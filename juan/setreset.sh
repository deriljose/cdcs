#!/bin/bash

# =================================================================
# CDCS: Unified Governance & Resilience Module
# Features: Auto-Dependency, Multi-User, & Self-Healing
# =================================================================

if [[ $EUID -ne 0 ]]; then
   echo "CRITICAL ERROR: This script must be run with sudo."
   exit 1
fi

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
    echo "--- PHASE 0: PRE-FLIGHT (Tool Check) ---"
    # Check and Install Git
    if ! command -v git &>/dev/null; then
        echo "Git not found. Installing..."
        apt-get update && apt-get install -y git
    else
        echo "Git is already installed. Skipping."
    fi

    # Check and Install Node/NPM
    if ! command -v node &>/dev/null || ! command -v npm &>/dev/null; then
        echo "Node.js/NPM not found. Installing latest stable..."
        apt-get update
        apt-get install -y nodejs npm
    else
        echo "Node.js and NPM are already installed. Skipping."
    fi

    echo "--- PHASE 1: USER PROVISIONING ---"
    for user in cdcs_admin cdcs_employee; do
        if ! id "$user" &>/dev/null; then
            useradd -m -s /bin/bash "$user"
            echo "$user:${user}123" | chpasswd
            [[ "$user" == "cdcs_admin" ]] && usermod -aG sudo "$user"
            echo "User '$user' created."
        fi
    done

    echo "--- PHASE 2: SECURITY HARDENING ---"
    apt-get install -y ufw fail2ban
    ufw allow ssh
    ufw --force enable
    systemctl enable fail2ban && systemctl start fail2ban

    echo "--- PHASE 3: DEPENDENCY RESOLUTION ---"
    echo "Installing Agent dependencies (Deril)..."
    npm install --prefix "$VAULT_ROOT/deril" --silent
    
    if [ -d "$VAULT_ROOT/evana/client_frontend" ]; then
        echo "Installing Frontend dependencies (Evana)..."
        npm install --prefix "$VAULT_ROOT/evana/client_frontend" --silent
    fi

    echo "--- PHASE 4: VAULT EXECUTION & PERSISTENCE ---"
    chmod +x "$VAULT_ROOT/juan"/*.sh
    
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
}

reset_all() {
    echo "INITIATING SYSTEM SANITIZATION..."
    if [ -f "$VAULT_JUAN/delete_packages.sh" ]; then
        "$VAULT_JUAN/delete_packages.sh"
    fi
    rm -rf /home/cdcs_employee/Documents/*
    rm -rf /home/cdcs_employee/Downloads/*
    echo "RESET COMPLETE."
}

case "$1" in
    setup) setup_all ;;
    reset) reset_all ;;
    *) echo "Usage: sudo ./setreset.sh {setup|reset}" ;;
esac