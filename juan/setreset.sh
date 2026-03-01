#!/bin/bash

# =================================================================
# CDCS: Unified Governance & Resilience Module
# Features: Auto-Dependency, Root NodeJS, Unified Service, Password Fix
# =================================================================

if [[ $EUID -ne 0 ]]; then
   echo "CRITICAL ERROR: This script must be run with sudo."
   exit 1
fi

# DYNAMIC IDENTITY DETECTION
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

# -----------------------------------------------------------------
#  FUNCTION: Install Node/NVM as root
# -----------------------------------------------------------------
install_node_for_root() {
    ROOT_HOME="/root"
    echo "--- PHASE 4: INSTALL NVM/Node FOR ROOT ---"

    export NVM_DIR="$ROOT_HOME/.nvm"
    if [ ! -s "$NVM_DIR/nvm.sh" ]; then
        echo "Installing NVM for root..."
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash
    fi

    # Load NVM and install Node
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    nvm install --lts
    nvm use --lts
    nvm alias default 'lts/*'

    echo "Node installed at: $(which node)"
    echo "Node version: $(node --version)"
}

# -----------------------------------------------------------------
#  SETUP FUNCTION
# -----------------------------------------------------------------
setup_all() {
    echo "--- PHASE 0: STATUS CHECK ---"
    if systemctl is-active --quiet cdcs.service && [ -d "$VAULT_ROOT" ]; then
        echo "******************************************"
        echo "* [INFO] CDCS SETUP IS ALREADY COMPLETE  *"
        echo "******************************************"
        read -p "Force re-sync dependencies? (y/N): " confirm
        if [[ $confirm != [yY] ]]; then
            echo "Exiting setup. No changes made."
            exit 0
        fi
    fi

    echo "--- PHASE 1: PRE-FLIGHT (Tool Check) ---"
    # Git
    if ! command -v git &>/dev/null; then
        apt-get update && apt-get install -y git
    fi

    # Chrome
    if ! command -v google-chrome &>/dev/null; then
        wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /etc/apt/trusted.gpg.d/google-chrome.gpg
        echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list
        apt-get update && apt-get install -y google-chrome-stable
    fi

    # MongoDB 7.0
    if ! command -v mongod &>/dev/null; then
        curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
        echo "deb [arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" > /etc/apt/sources.list.d/mongodb-org-7.0.list
        apt-get update && apt-get install -y mongodb-org
        systemctl enable --now mongod
    fi

    echo "--- PHASE 2: USER PROVISIONING ---"
    echo "Promoting '$REAL_USER' to CDCS Admin..."
    usermod -aG sudo "$REAL_USER"
    echo "${REAL_USER}:admin123" | chpasswd
    echo "Admin '$REAL_USER' password set to: admin123"

    if ! id "cdcs_employee" &>/dev/null; then
        useradd -m -s /bin/bash cdcs_employee
        echo "User 'cdcs_employee' created."
    fi
    echo "cdcs_employee:employee123" | chpasswd

    echo "--- PHASE 3: SECURITY HARDENING ---"
    apt-get install -y ufw fail2ban
    ufw allow ssh
    ufw --force enable
    systemctl enable fail2ban && systemctl start fail2ban

    # -----------------------------------------------------------------
    # Node/NVM for root
    # -----------------------------------------------------------------
    install_node_for_root

    # -----------------------------------------------------------------
    # DEPENDENCY RESOLUTION (root)
    # -----------------------------------------------------------------
    export NVM_DIR="/root/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

    echo "--- PHASE 5: INSTALLING DERIL DEPENDENCIES ---"
    npm install --prefix "$VAULT_ROOT/deril" --silent

    if [ -d "$VAULT_ROOT/evana/client_frontend" ]; then
        echo "--- PHASE 5: INSTALLING EVANA FRONTEND ---"
        npm install --prefix "$VAULT_ROOT/evana/client_frontend" --silent
    fi

    # -----------------------------------------------------------------
    # CREATE DESKTOP LAUNCHER FOR EMPLOYEE
    # -----------------------------------------------------------------
    DESKTOP_DIR="/home/cdcs_employee/Desktop"
    mkdir -p "$DESKTOP_DIR"

    tee "$DESKTOP_DIR/CDCS-App.desktop" > /dev/null <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=CDCS Client App
Exec=bash -c 'export NVM_DIR="/root/.nvm"; [ -s "\$NVM_DIR/nvm.sh" ] && \. "\$NVM_DIR/nvm.sh"; cd $VAULT_ROOT/evana/client_frontend && nohup npm run dev > /dev/null 2>&1 & sleep 5; google-chrome http://localhost:5173'
Icon=google-chrome
Terminal=false
Categories=Development;
EOF

    chmod +x "$DESKTOP_DIR/CDCS-App.desktop"
    chown cdcs_employee:cdcs_employee "$DESKTOP_DIR/CDCS-App.desktop"
    sudo -u cdcs_employee gio set "$DESKTOP_DIR/CDCS-App.desktop" metadata::trusted true || true

    # -----------------------------------------------------------------
    # CREATE/UPDATE SYSTEMD SERVICE (root)
    # -----------------------------------------------------------------
    NODE_BIN=$(which node)
    tee /etc/systemd/system/cdcs.service > /dev/null <<EOF
[Unit]
Description=CDCS Background Governance Agent
After=network.target

[Service]
User=root
WorkingDirectory=$VAULT_ROOT/deril
ExecStart=$NODE_BIN $VAULT_ROOT/deril/client.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable cdcs.service
    systemctl restart cdcs.service

    # -----------------------------------------------------------------
    # LOCKDOWN VAULT
    # -----------------------------------------------------------------
    chown root:root -R "$VAULT_ROOT"
    chmod 700 "$VAULT_ROOT"

    echo "--- [SUCCESS] CDCS SETUP COMPLETE ---"
    echo "Total Users Managed: 2 ($REAL_USER & cdcs_employee)"
}

# -----------------------------------------------------------------
# RESET FUNCTION
# -----------------------------------------------------------------
reset_all() {
    echo "--- INITIATING SYSTEM RESET ---"

    echo "[1/4] Terminating 'cdcs' user processes..."
    pkill -u cdcs || true
    sleep 2

    echo "[2/4] Sanitizing 'cdcs' workspace..."
    find /home/cdcs -mindepth 1 -not -path '*/.nvm*' -delete
    mkdir -p /home/cdcs/{Desktop,Documents,Downloads,Pictures}
    chown -R cdcs:cdcs /home/cdcs

    echo "[3/4] Resetting 'cdcs' credentials..."
    echo "cdcs:employee123" | chpasswd

    echo "[4/4] Restarting Governance Agent..."
    systemctl restart cdcs.service
    echo "* RESET COMPLETE: GOLDEN BASELINE RESTORED *"
}

# -----------------------------------------------------------------
# SCRIPT ENTRY
# -----------------------------------------------------------------
case "$1" in
    setup) setup_all ;;
    reset) reset_all ;;
    *) echo "Usage: sudo ./setreset.sh {setup|reset}" ;;
esac