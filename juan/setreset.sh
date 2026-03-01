#!/bin/bash

# =================================================================
# CDCS: Unified Governance & Resilience Module
# Features: Node 25 NVM, Chrome, MongoDB 7.0, & Dynamic Pathing
# =================================================================

if [[ $EUID -ne 0 ]]; then
   echo "CRITICAL ERROR: This script must be run with sudo."
   exit 1
fi

REAL_USER=$(logname 2>/dev/null || echo $SUDO_USER)
VAULT_ROOT="/root/cdcs"
VAULT_JUAN="$VAULT_ROOT/juan"
CURRENT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 1. THE VAULTING
if [ "$CURRENT_DIR" != "$VAULT_JUAN" ]; then
    echo "[STAGING] Moving project into the protected /root Vault..."
    mkdir -p "$VAULT_ROOT"
    cp -r "$CURRENT_DIR/.."/* "$VAULT_ROOT/"
    chmod +x "$VAULT_JUAN/setreset.sh"
    exec "$VAULT_JUAN/setreset.sh" "$@"
fi

cd "$(dirname "$0")"
set -e

# Helper to install NVM and specific Node 25
install_node_25() {
    local target_user=$1
    local user_home=$(eval echo ~$target_user)
    echo "Installing NVM & Node v25 for $target_user..."
    sudo -u "$target_user" bash -c "
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash
        export NVM_DIR=\"$user_home/.nvm\"
        [ -s \"\$NVM_DIR/nvm.sh\" ] && \. \"\$NVM_DIR/nvm.sh\"
        nvm install 25
        nvm alias default 25
    "
}

setup_all() {
    echo "--- PHASE 0: STATUS CHECK ---"
    if systemctl is-active --quiet cdcs.service && [ -d "$VAULT_ROOT" ]; then
        echo "******************************************"
        echo "* [INFO] CDCS SETUP IS ALREADY COMPLETE  *"
        echo "******************************************"
        read -p "Force re-sync? (y/N): " confirm
        [[ $confirm != [yY] ]] && exit 0
    fi

    echo "--- PHASE 1: PRE-FLIGHT (Tools & DB) ---"
    apt-get update && apt-get install -y git wget curl gpg

    # Chrome Installation
    if ! command -v google-chrome &>/dev/null; then
        wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /etc/apt/trusted.gpg.d/google-chrome.gpg 
        echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" | tee /etc/apt/sources.list.d/google-chrome.list        
        apt-get update && apt-get install -y google-chrome-stable
    fi

    # MongoDB 7.0 Installation
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
        echo "cdcs_employee:employee123" | chpasswd
    fi

    echo "--- PHASE 3: NVM ISOLATION (NODE 25) ---"
    install_node_25 "$REAL_USER"
    install_node_25 "cdcs_employee"

    echo "--- PHASE 4: DEPENDENCY RESOLUTION ---"
    # Ownership fix to prevent NPM permission errors
    chown -R cdcs_employee:cdcs_employee "$VAULT_ROOT"
    
    sudo -u cdcs_employee bash -c "
        export NVM_DIR=\"\$HOME/.nvm\"
        [ -s \"\$NVM_DIR/nvm.sh\" ] && \. \"\$NVM_DIR/nvm.sh\"
        
        echo \"[1/2] Installing Agent (Deril)...\"
        cd $VAULT_ROOT/deril && npm install --silent
        
        # Dynamic search for frontend to avoid path errors
        FE_PATH=\$(find $VAULT_ROOT/evana -name 'package.json' -exec dirname {} \; | head -n 1)
        if [ -n \"\$FE_PATH\" ]; then
            echo \"[2/2] Installing Frontend in \$FE_PATH...\"
            cd \"\$FE_PATH\" && npm install --silent
        else
            echo \"[!] ERROR: Frontend not found!\"
        fi
    "

    echo "--- PHASE 5: SILENT LAUNCHER ---"
    # Create the desktop icon for the employee
    mkdir -p /home/cdcs_employee/Desktop
    tee "/home/cdcs_employee/Desktop/CDCS-App.desktop" > /dev/null <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=CDCS Client App
Exec=bash -c 'export NVM_DIR="\$HOME/.nvm"; [ -s "\$NVM_DIR/nvm.sh" ] && \. "\$NVM_DIR/nvm.sh"; FE=\$(find $VAULT_ROOT/evana -name "package.json" -exec dirname {} \; | head -n 1) && cd "\$FE" && nohup npm run dev > /dev/null 2>&1 & sleep 8; google-chrome http://localhost:5173'
Icon=google-chrome
Terminal=false
EOF
    chmod +x /home/cdcs_employee/Desktop/CDCS-App.desktop
    chown cdcs_employee:cdcs_employee /home/cdcs_employee/Desktop/CDCS-App.desktop

    echo "--- PHASE 6: SYSTEM SERVICE ---"
    # Link the service to the Employee's Node 25 path
    NODE_BIN=$(sudo -u cdcs_employee bash -c 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"; which node')
    tee /etc/systemd/system/cdcs.service > /dev/null <<EOF
[Unit]
Description=CDCS Governance Agent
After=network.target mongod.service
[Service]
User=root
WorkingDirectory=$VAULT_ROOT/deril
ExecStart=$NODE_BIN $VAULT_ROOT/deril/client.js
Restart=always
[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload
    systemctl enable cdcs.service
    systemctl restart cdcs.service

    # Final Security Lockdown
    chown root:root -R "$VAULT_ROOT" && chmod 700 "$VAULT_ROOT"
    echo "--- [SUCCESS] SETUP COMPLETE ---"
}

reset_all() {
    echo "--- INITIATING SYSTEM RESET ---"
    pkill -u cdcs_employee || true
    sleep 2
    # Wipe everything EXCEPT the .nvm folder so Node stays installed
    find /home/cdcs_employee -mindepth 1 -not -path '*/.nvm*' -delete
    mkdir -p /home/cdcs_employee/{Desktop,Documents,Downloads,Pictures}
    chown -R cdcs_employee:cdcs_employee /home/cdcs_employee
    echo "cdcs_employee:employee123" | chpasswd
    systemctl restart cdcs.service
    echo "* RESET COMPLETE *"
}

case "$1" in
    setup) setup_all ;;
    reset) reset_all ;;
    *) echo "Usage: sudo ./setreset.sh {setup|reset}" ;;
esac