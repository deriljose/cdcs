#!/bin/bash

# =================================================================
# CDCS: Vault-Centric Governance Module
# Architecture: Root-Only Execution & Multi-User Provisioning
# =================================================================

if [[ $EUID -ne 0 ]]; then
   echo "CRITICAL ERROR: This script must be run with sudo."
   exit 1
fi

# 1. THE VAULTING (Master Source in /root)
VAULT_ROOT="/root/cdcs"
VAULT_JUAN="$VAULT_ROOT/juan"
CURRENT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ "$CURRENT_DIR" != "$VAULT_JUAN" ]; then
    echo "[STAGING] Moving project into the protected /root Vault..."
    mkdir -p "$VAULT_ROOT"
    cp -r "$CURRENT_DIR/.."/* "$VAULT_ROOT/"
    chmod +x "$VAULT_JUAN/setreset.sh"
    echo "[STAGING] Vault secured. Re-executing..."
    exec "$VAULT_JUAN/setreset.sh" "$@"
fi

cd "$(dirname "$0")"
set -e

setup_all() {
    echo "--- PHASE 1: USER PROVISIONING ---"
    # Create Admin (with sudo) and Employee (standard user)
    if ! id "cdcs_admin" &>/dev/null; then
        useradd -m -s /bin/bash cdcs_admin
        echo "cdcs_admin:admin123" | chpasswd
        usermod -aG sudo cdcs_admin
        echo "Admin 'cdcs_admin' created."
    fi

    if ! id "cdcs_employee" &>/dev/null; then
        useradd -m -s /bin/bash cdcs_employee
        echo "cdcs_employee:employee123" | chpasswd
        echo "Employee 'cdcs_employee' created."
    fi

    echo "--- PHASE 2: SECURITY HARDENING ---"
    apt-get update && apt-get install -y ufw fail2ban
    ufw allow ssh
    ufw --force enable
    systemctl enable fail2ban && systemctl start fail2ban

    echo "--- PHASE 3: VAULT CONFIGURATION ---"
    # Ensure all scripts in the vault are executable
    chmod +x "$VAULT_ROOT/juan"/*.sh
    
    # Install Node dependencies directly in the Vault
    echo "Installing agent dependencies..."
    npm install --prefix "$VAULT_ROOT/deril"

    echo "--- PHASE 4: AUTO-BOOT FROM VAULT ---"
    # The service now points to the /root/cdcs/deril folder
    tee /etc/systemd/system/cdcs.service > /dev/null <<EOF
[Unit]
Description=CDCS Background Governance Agent (Vault Exec)
After=network.target

[Service]
User=root
WorkingDirectory=$VAULT_ROOT/deril
ExecStart=$(which node) $VAULT_ROOT/deril/client.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable cdcs.service
    systemctl start cdcs.service

    # Lockdown the Vault
    chown root:root -R "$VAULT_ROOT"
    chmod 700 "$VAULT_ROOT" # Only root can even enter this folder
    
    echo "--- [SUCCESS] SETUP COMPLETE ---"
    echo "Admin: cdcs_admin | Employee: cdcs_employee"
}

reset_all() {
    echo "INITIATING SYSTEM SANITIZATION..."
    # Running the delete script from the Vault
    if [ -f "$VAULT_JUAN/delete_packages.sh" ]; then
        "$VAULT_JUAN/delete_packages.sh"
    fi
    # Wipe employee data but leave admin data intact
    rm -rf /home/cdcs_employee/Documents/*
    echo "RESET COMPLETE."
}

case "$1" in
    setup) setup_all ;;
    reset) reset_all ;;
    *) echo "Usage: sudo ./setreset.sh {setup|reset}" ;;
esac