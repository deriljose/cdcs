#!/bin/bash

# =================================================================
# CDCS: Identity-Aware Governance & Resilience Module
# Architecture: Current-User Admin Elevation & Secure Provisioning
# =================================================================

if [[ $EUID -ne 0 ]]; then
   echo "CRITICAL ERROR: This script must be run with sudo."
   exit 1
fi

# DYNAMIC IDENTITY DETECTION
# This identifies the actual human user behind the sudo command
CURRENT_VM_USER=$(logname 2>/dev/null || echo $SUDO_USER)

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
    for tool in git node npm; do
        if ! command -v $tool &>/dev/null; then
            echo "$tool not found. Installing..."
            apt-get update && apt-get install -y $tool
        fi
    done

    echo "--- PHASE 1: ROLE PERMISSIONS & PROVISIONING ---"
    # Elevate Current User to CDCS Admin
    echo "Elevating '$CURRENT_VM_USER' to CDCS Admin..."
    usermod -aG sudo "$CURRENT_VM_USER"
    # Reset/Set password securely to avoid 'Invalid Password' errors
    echo "${CURRENT_VM_USER}:admin123" | chpasswd
    
    # Create Employee (Restricted)
    if ! id "cdcs_employee" &>/dev/null; then
        useradd -m -s /bin/bash cdcs_employee
        echo "cdcs_employee:employee123" | chpasswd
        echo "Employee 'cdcs_employee' created (Pass: employee123)."
    fi

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
    echo "Admin User: $CURRENT_VM_USER (Pass: admin123)"
    echo "Employee User: cdcs_employee (Pass: employee123)"
}

reset_all() {
    echo "INITIATING SYSTEM SANITIZATION..."
    # Reset targets the restricted employee, never the admin/current user
    if [ -f "$VAULT_JUAN/delete_packages.sh" ]; then
        "$VAULT_JUAN/delete_packages.sh"
    fi
    rm -rf /home/cdcs_employee/Documents/*
    echo "RESET COMPLETE."
}

case "$1" in
    setup) setup_all ;;
    reset) reset_all ;;
    *) echo "Usage: sudo ./setreset.sh {setup|reset}" ;;
esac