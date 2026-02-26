#!/bin/bash

# =================================================================
# CDCS: Self-Deploying & Hardened Governance Module
# Features: Self-Vaulting, Firewall, Fail2Ban, & Auto-Boot Service
# =================================================================

if [[ $EUID -ne 0 ]]; then
   echo "CRITICAL ERROR: This script must be run with sudo (IT Admin)."
   exit 1
fi

# SELF-MOVE LOGIC (Ensures files are in the /root Vault)
VAULT_ROOT="/root/cdcs"
VAULT_JUAN="$VAULT_ROOT/juan"
CURRENT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ "$CURRENT_DIR" != "$VAULT_JUAN" ]; then
    echo "Staging CDCS project into the /root Vault..."
    mkdir -p "$VAULT_ROOT"
    cp -r "$CURRENT_DIR/.."/* "$VAULT_ROOT/"
    chmod +x "$VAULT_JUAN/setreset.sh"
    echo "Re-executing from protected space..."
    exec "$VAULT_JUAN/setreset.sh" "$@"
fi

cd "$(dirname "$0")"
set -e

setup_all() {
    echo "--- PHASE 0: PRE-FLIGHT (Fresh System Check) ---"
    if ! command -v node &> /dev/null; then
        echo "Node.js not found. Installing runtime..."
        apt-get update
        apt-get install -y nodejs npm
    fi

    echo "--- PHASE 1: SECURITY HARDENING ---"
    apt-get install -y ufw fail2ban
    ufw allow ssh
    ufw --force enable
    systemctl enable fail2ban
    systemctl start fail2ban

    echo "--- PHASE 2: VAULTING & PERSISTENCE ---"
    # Moves the agent to the internal protected drive
    mkdir -p /opt/cdcs/deril
    cp ../deril/client.js /opt/cdcs/deril/
    cp ../deril/.env /opt/cdcs/deril/
    cp ../deril/package.json /opt/cdcs/deril/

    # Register the background service to start at EVERY boot
    tee /etc/systemd/system/cdcs.service > /dev/null <<EOF
[Unit]
Description=CDCS Background Governance Agent
After=network.target

[Service]
User=root
WorkingDirectory=/opt/cdcs/deril
ExecStart=$(which node) /opt/cdcs/deril/client.js
Restart=always

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable cdcs.service
    systemctl start cdcs.service
    
    echo "--- SETUP COMPLETE ---"
}

reset_all() {
    echo "INITIATING SYSTEM SANITIZATION..."
    # Standard reset logic stays here
    apt-get purge -y vlc htop 2>/dev/null || true
    if [ -f "/opt/cdcs/juan/delete_packages.sh" ]; then
        /opt/cdcs/juan/delete_packages.sh
    fi
    rm -rf ~/Documents/*
    echo "RESET COMPLETE."
}

case "$1" in
    setup) setup_all ;;
    reset) reset_all ;;
    *) echo "Usage: sudo ./setreset.sh {setup|reset}" ;;
esac