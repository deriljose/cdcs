#!/bin/bash

# =================================================================
# CDCS: Unified Governance & Resilience Module
# Features: Auto-Dependency, Multi-User (Current User Admin), & Password Fix
# =================================================================

if [[ $EUID -ne 0 ]]; then
   echo "CRITICAL ERROR: This script must be run with sudo."
   exit 1
fi

# DYNAMIC IDENTITY DETECTION (Ensures we know who you are before entering Root Vault)
REAL_USER=$(logname 2>/dev/null || echo $SUDO_USER)

# 1. THE VAULTING
VAULT_ROOT="/root/cdcs"
VAULT_JUAN="$VAULT_ROOT/juan"
CURRENT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ "$CURRENT_DIR" != "$VAULT_JUAN" ]; then
    echo "[STAGING] Moving project into the protected /root Vault..."
    mkdir -p "$VAULT_ROOT"
    cp -r "$CURRENT_DIR/.."/* "$VAULT_ROOT/"
    chmod +x "$VAULT_JUAN/setreset.sh"
    exec "$VAULT_JUAN/setreset.sh" "$@"
fi

cd "$(dirname "$0")"
set -e

setup_all() {
    echo "--- PHASE 0: STATUS CHECK ---"
    if systemctl is-active --quiet cdcs.service && [ -d "$VAULT_ROOT" ]; then
        echo "******************************************"
        echo "* [INFO] CDCS SETUP IS ALREADY COMPLETE  *"
        echo "******************************************"
        read -p "Do you want to force a re-sync of dependencies? (y/N): " confirm
        if [[ $confirm != [yY] ]]; then
            echo "Exiting setup. No changes made."
            exit 0
        fi
    fi

    echo "--- PHASE 1: PRE-FLIGHT (Tool Check) ---"
    if ! command -v git &>/dev/null; then
        apt-get update && apt-get install -y git
    fi

    if ! command -v google-chrome &>/dev/null; then
        wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /etc/apt/trusted.gpg.d/google-chrome.gpg 
        echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" | tee /etc/apt/sources.list.d/google-chrome.list        
        apt-get update && apt-get install -y google-chrome-stable
    fi

    if ! command -v mongod &>/dev/null; then
        curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor 
        echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-7.0.list        
        apt-get update && apt-get install -y mongodb-org
        systemctl enable --now mongod
    fi

    echo "--- PHASE 2: USER PROVISIONING ---"
    usermod -aG sudo "$REAL_USER"
    echo "${REAL_USER}:admin123" | chpasswd
    if ! id "cdcs_employee" &>/dev/null; then
        useradd -m -s /bin/bash cdcs_employee
    fi
    echo "cdcs_employee:employee123" | chpasswd

    echo "--- PHASE 3: SECURITY HARDENING ---"
    apt-get install -y ufw fail2ban
    ufw allow ssh
    ufw --force enable
    systemctl enable fail2ban && systemctl start fail2ban

    echo "--- PHASE 4: GLOBAL NVM & NODE SETUP ---"
    export NVM_DIR="/opt/nvm"
    mkdir -p "$NVM_DIR"
    # Install NVM to global directory
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash
    
    # Load NVM for current session
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    
    # Install latest Node
    nvm install node
    nvm alias default node
    NODE_BIN_PATH=$(which node)

    # Make NVM available to ALL users (Admin & Employee) on login
    tee /etc/profile.d/nvm.sh > /dev/null <<EOF
export NVM_DIR="/opt/nvm"
[ -s "\$NVM_DIR/nvm.sh" ] && \. "\$NVM_DIR/nvm.sh"
EOF
    chmod -R 755 /opt/nvm

    echo "--- PHASE 5: DEPENDENCY RESOLUTION ---"
    # Dependencies installed using the global Node binary
    echo "Installing Agent dependencies (Deril)..."
    npm install --prefix "$VAULT_ROOT/deril" --silent
    
    if [ -d "$VAULT_ROOT/evana/client_frontend" ]; then
        echo "Installing Frontend dependencies (Evana)..."
        npm install --prefix "$VAULT_ROOT/evana/client_frontend" --silent
    fi

    echo "--- PHASE 5.5: CREATING DESKTOP APP LAUNCHER ---"
    DESKTOP_DIR="/home/cdcs_employee/Desktop"
    mkdir -p "$DESKTOP_DIR"
    
    # Updated launcher to use global NVM path
    tee "$DESKTOP_DIR/CDCS-App.desktop" > /dev/null <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=CDCS Client App
Comment=Launch Frontend on Port 5173
Exec=bash -c 'export NVM_DIR="/opt/nvm"; [ -s "\$NVM_DIR/nvm.sh" ] && \. "\$NVM_DIR/nvm.sh"; cd $VAULT_ROOT/evana/client_frontend && (npm run dev &); sleep 5; google-chrome http://localhost:5173'
Icon=google-chrome
Terminal=true
Categories=Development;
EOF

    chmod +x "$DESKTOP_DIR/CDCS-App.desktop"
    chown cdcs_employee:cdcs_employee "$DESKTOP_DIR/CDCS-App.desktop"
    sudo -u cdcs_employee gio set "$DESKTOP_DIR/CDCS-App.desktop" metadata::trusted true || true

    echo "--- PHASE 6: VAULT EXECUTION & PERSISTENCE ---"
    chmod +x "$VAULT_ROOT/juan"/*.sh
    
    tee /etc/systemd/system/cdcs.service > /dev/null <<EOF
[Unit]
Description=CDCS Background Governance Agent
After=network.target

[Service]
User=root
WorkingDirectory=$VAULT_ROOT/deril
ExecStart=$NODE_BIN_PATH $VAULT_ROOT/deril/client.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable cdcs.service
    systemctl start cdcs.service

    chown root:root -R "$VAULT_ROOT"
    chmod 700 "$VAULT_ROOT"
    
    echo "--- [SUCCESS] CDCS SETUP COMPLETE ---"
    echo "Node version: $(node -v)"
}

reset_all() {
    echo "--- INITIATING SYSTEM RESET TO GOLDEN BASELINE ---"

    # 1. Process Termination
    echo "[1/4] Terminating employee sessions and runtime..."
    # Kill all processes owned by the employee
    pkill -u cdcs_employee || true
    # Force close any hanging Vite server on port 5173
    fuser -k 5173/tcp || true

    # 2. Package Sanitization
    echo "[2/4] Purging unauthorized software..."
    if [ -f "$VAULT_JUAN/delete_packages.sh" ]; then
        bash "$VAULT_JUAN/delete_packages.sh"
    fi

    # 3. Workspace Sanitization (Preserving Environment)
    echo "[3/4] Wiping employee workspace..."
    # Delete all files EXCEPT hidden configuration files (preserves NVM/Node v25)
    find /home/cdcs_employee -mindepth 1 -not -path '*/.*' -delete
    
    # Re-initialize standard directory structure
    mkdir -p /home/cdcs_employee/{Desktop,Documents,Downloads}

    # 4. Desktop Launcher Restoration
    echo "[4/4] Restoring Client Application Launcher..."
    tee "/home/cdcs_employee/Desktop/CDCS-App.desktop" > /dev/null <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=CDCS Client App
Comment=Launch Governance Frontend
Exec=bash -c 'export NVM_DIR="\$HOME/.nvm"; [ -s "\$NVM_DIR/nvm.sh" ] && \. "\$NVM_DIR/nvm.sh"; cd $VAULT_ROOT/evana/client_frontend && (npm run dev &); sleep 5; google-chrome http://localhost:5173'
Icon=google-chrome
Terminal=true
Categories=Development;
EOF
    
    # Set proper ownership and execution bits
    chmod +x /home/cdcs_employee/Desktop/CDCS-App.desktop
    chown -R cdcs_employee:cdcs_employee /home/cdcs_employee/
    
    # Restart the Background Governance Service
    systemctl restart cdcs.service

    echo "******************************************"
    echo "* [SUCCESS] SYSTEM RESTORED TO BASELINE  *"
    echo "******************************************"
}

case "$1" in
    setup) setup_all ;;
    reset) reset_all ;;
    *) echo "Usage: sudo ./setreset.sh {setup|reset}" ;;
esac