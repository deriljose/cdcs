#!/bin/bash

# =================================================================
# CDCS: Unified Governance & Resilience Module
# Features: Self-Vaulting, Multi-User Provisioning, Auto-Dependencies
# =================================================================

if [[ $EUID -ne 0 ]]; then
   echo "CRITICAL ERROR: This script must be run with sudo."
   exit 1
fi

# 1. THE VAULTING (Move project to protected /root space)
VAULT_ROOT="/root/cdcs"
VAULT_JUAN="$VAULT_ROOT/juan"
CURRENT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ "$CURRENT_DIR" != "$VAULT_JUAN" ]; then
    echo "[STAGING] Moving project into the protected /root Vault..."
    mkdir -p "$VAULT_ROOT"
    cp -r "$CURRENT_DIR/.."/* "$VAULT_ROOT/"
    chmod +x "$VAULT_JUAN/setreset.sh"
    echo "[STAGING] Vault secured. Re-executing from protected space..."
    exec "$VAULT_JUAN/setreset.sh" "$@"
fi

cd "$(dirname "$0")"
set -e

setup_all() {
    echo "--- PHASE 1: USER PROVISIONING ---"
    # Create Admin (Sudoer)
    if ! id "cdcs_admin" &>/dev/null; then
        useradd -m -s /bin/bash cdcs_admin
        echo "cdcs_admin:admin123" | chpasswd
        usermod -aG sudo cdcs_admin
        echo "Admin 'cdcs_admin' created (Pass: admin123)."
    fi

    # Create Employee (Restricted)
    if ! id "cdcs_employee" &>/dev/null; then
        useradd -m -s /bin/bash cdcs_employee
        echo "cdcs_employee:employee123" | chpasswd
        echo "Employee 'cdcs_employee' created (Pass: employee123)."
    fi

    echo "--- PHASE 2: SECURITY HARDENING ---"
    apt-get update && apt-get install -y ufw fail2ban
    ufw allow ssh
    ufw --force enable
    systemctl enable fail2ban && systemctl start fail2ban

    echo "--- PHASE 3: DEPENDENCY RESOLUTION ---"
    # Ensure dependencies exist BEFORE the service starts
    if command -v npm &>/dev/null; then
        echo "Installing Agent dependencies in Vault..."
        npm install --prefix "$VAULT_ROOT/deril" --silent
        
        if [ -d "$VAULT_ROOT/evana/client_frontend" ]; then
            echo "Installing Frontend dependencies in Vault..."
            npm install --prefix "$VAULT_ROOT/evana/client_frontend" --silent
        fi
    else
        echo "ERROR: npm not found. Install Node.js before running setup."
        exit 1
    fi

    echo "--- PHASE 4: VAULT EXECUTION & PERSISTENCE ---"
    chmod +x "$VAULT_ROOT/juan"/*.sh
    
    # Create the System Service pointing to the Vault
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

    # Strict Lockdown: Only root can touch the Vault
    chown root:root -R "$VAULT_ROOT"
    chmod 700 "$VAULT_ROOT"
    
    echo "--- [SUCCESS] CDCS SETUP COMPLETE ---"
}

reset_all() {
    echo "INITIATING SYSTEM SANITIZATION..."
    # Call the reset logic from the Vault
    if [ -f "$VAULT_JUAN/delete_packages.sh" ]; then
        "$VAULT_JUAN/delete_packages.sh"
    fi
    # Wipe employee data but leave system/admin data
    rm -rf /home/cdcs_employee/Documents/*
    rm -rf /home/cdcs_employee/Downloads/*
    echo "RESET COMPLETE. SYSTEM RESTORED TO BASELINE."
}

case "$1" in
    setup) setup_all ;;
    reset) reset_all ;;
    *) echo "Usage: sudo ./setreset.sh {setup|reset}" ;;
esac