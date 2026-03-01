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

# Helper function to install NVM/Node for a specific user
install_node_for_user() {
    local target_user=$1
    echo "Installing NVM/Node for $target_user..."
    sudo -u "$target_user" bash -c '
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
        nvm install --lts
    '
}

setup_all() {
    echo "--- PHASE 0: STATUS CHECK ---"
    # Check if the service is already running and the vault exists
    if systemctl is-active --quiet cdcs.service && [ -d "$VAULT_ROOT" ]; then
        echo "******************************************"
        echo "* [INFO] CDCS SETUP IS ALREADY COMPLETE  *"
        echo "* System is currently under Governance.  *"
        echo "******************************************"
        # Optional: Ask if they want to force a refresh
        read -p "Do you want to force a re-sync of dependencies? (y/N): " confirm
        if [[ $confirm != [yY] ]]; then
            echo "Exiting setup. No changes made."
            exit 0
        fi
    fi
    echo "--- PHASE 1: PRE-FLIGHT (Tool Check) ---"
    # Check and Install Git
    if ! command -v git &>/dev/null; then
        echo "Git not found. Installing..."
        apt-get update && apt-get install -y git
    else
        echo "Git is already installed. Skipping."
    fi

    # Chrome 
    if ! command -v google-chrome &>/dev/null; then
        echo "Installing Google Chrome..."
        wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/google-chrome.gpg 
        echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" | sudo tee /etc/apt/sources.list.d/google-chrome.list        
        apt-get update && apt-get install -y google-chrome-stable
    fi

    # MONGODB 7.0 
    if ! command -v mongod &>/dev/null; then
        echo "Installing MongoDB 7.0..."
        curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor 
        echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list        
        apt-get update && apt-get install -y mongodb-org
        systemctl enable --now mongod
    fi

    echo "--- PHASE 2: USER PROVISIONING ---"
    # 1. ELEVATE CURRENT USER TO ADMIN (Total User 1)
    echo "Promoting '$REAL_USER' to CDCS Admin..."
    usermod -aG sudo "$REAL_USER"
    echo "${REAL_USER}:admin123" | chpasswd
    echo "Admin '$REAL_USER' password set to: admin123"

    # 2. CREATE EMPLOYEE (Total User 2)
    if ! id "cdcs_employee" &>/dev/null; then
        useradd -m -s /bin/bash cdcs_employee
        echo "User 'cdcs_employee' created."
    fi
    echo "cdcs_employee:employee123" | chpasswd
    echo "Employee 'cdcs_employee' password set to: employee123"

    echo "--- PHASE 3: SECURITY HARDENING ---"
    apt-get install -y ufw fail2ban
    ufw allow ssh
    ufw --force enable
    systemctl enable fail2ban && systemctl start fail2ban

    echo "--- PHASE 4: NVM ISOLATION ---"
    install_node_for_user "$REAL_USER"
    install_node_for_user "cdcs_employee"

    echo "--- PHASE 5: DEPENDENCY RESOLUTION ---"
    # Execute npm install as the employee to ensure compatibility with Node v25
    sudo -u cdcs_employee bash -c "
        export NVM_DIR=\"\$HOME/.nvm\"
        [ -s \"\$NVM_DIR/nvm.sh\" ] && \. \"\$NVM_DIR/nvm.sh\"
        
        echo \"Installing Agent dependencies (Deril)...\"
        npm install --prefix $VAULT_ROOT/deril --silent
        
        if [ -d $VAULT_ROOT/evana/client_frontend ]; then
            echo \"Installing Frontend dependencies (Evana)...\"
            npm install --prefix $VAULT_ROOT/evana/client_frontend --silent
        fi
    "

    echo "--- PHASE 5.5: CREATING DESKTOP APP LAUNCHER ---"
    DESKTOP_DIR="/home/cdcs_employee/Desktop"
    mkdir -p "$DESKTOP_DIR"
    
    # This creates the 'App' icon on the employee's desktop
    # It starts the Vite server, waits 5 seconds, then opens Chrome to 5173
    tee "$DESKTOP_DIR/CDCS-App.desktop" > /dev/null <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=CDCS Client App
Exec=bash -c 'export NVM_DIR="\$HOME/.nvm"; [ -s "\$NVM_DIR/nvm.sh" ] && \. "\$NVM_DIR/nvm.sh"; cd $VAULT_ROOT/evana/client_frontend && nohup npm run dev > /dev/null 2>&1 & sleep 5; google-chrome http://localhost:5173'
Icon=google-chrome
Terminal=false
Categories=Development;
EOF

    chmod +x "$DESKTOP_DIR/CDCS-App.desktop"
    chown cdcs_employee:cdcs_employee "$DESKTOP_DIR/CDCS-App.desktop"
    # Tell Ubuntu the launcher is trusted (removes the "security" warning)
    sudo -u cdcs_employee gio set "$DESKTOP_DIR/CDCS-App.desktop" metadata::trusted true || true

    echo "--- PHASE 6: VAULT EXECUTION & PERSISTENCE ---"
    chmod +x "$VAULT_ROOT/juan"/*.sh
    
    # Borrow the Node path from the employee's NVM for the Root Service
    NODE_PATH=$(sudo -u cdcs_employee bash -c 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"; which node')

    tee /etc/systemd/system/cdcs.service > /dev/null <<EOF
[Unit]
Description=CDCS Background Governance Agent
After=network.target

[Service]
User=root
WorkingDirectory=$VAULT_ROOT/deril
ExecStart=$(which node) $VAULT_ROOT/deril/client.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable cdcs.service
    systemctl start cdcs.service

    # Strict Lockdown
    chown root:root -R "$VAULT_ROOT"
    chmod 700 "$VAULT_ROOT"
    
    echo "--- [SUCCESS] CDCS SETUP COMPLETE ---"
    echo "Total Users Managed: 2 ($REAL_USER & cdcs_employee)"
}

reset_all() {
    echo "--- INITIATING SYSTEM RESET TO GOLDEN BASELINE ---"

    echo "[1/4] Purging unauthorized software..."
    if [ -f "$VAULT_JUAN/delete_packages.sh" ]; then
        bash "$VAULT_JUAN/delete_packages.sh"
    else
        echo "[!] Warning: delete_packages.sh not found."
    fi

    echo "[2/4] Resetting employee credentials..."
    usermod -U cdcs_employee || true
    echo "cdcs_employee:employee123" | chpasswd

    echo "[3/4] Wiping employee workspace..."
    # Kill active processes to avoid "File Busy" errors
    pkill -u cdcs_employee || true
    find /home/cdcs_employee -mindepth 1 -delete
    mkdir -p /home/cdcs_employee/{Desktop,Documents,Downloads,Pictures,Public,Templates,Videos}
    chown -R cdcs_employee:cdcs_employee /home/cdcs_employee

    echo "[4/4] Restarting Governance Agent..."
    systemctl restart cdcs.service

    echo "* [SUCCESS] SYSTEM RESTORED TO BASELINE *"
}

case "$1" in
    setup) setup_all ;;
    reset) reset_all ;;
    *) echo "Usage: sudo ./setreset.sh {setup|reset}" ;;
esac