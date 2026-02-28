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
    echo "Total Users Managed: 2 ($REAL_USER & cdcs_employee)"
}

reset_all() {
    echo "INITIATING SYSTEM SANITIZATION..."
    if [ -f "$VAULT_JUAN/delete_packages.sh" ]; then
        "$VAULT_JUAN/delete_packages.sh"
    fi
    # Only wipes restricted employee folders
    rm -rf /home/cdcs_employee/Documents/*
    rm -rf /home/cdcs_employee/Downloads/*
    echo "RESET COMPLETE."
}

case "$1" in
    setup) setup_all ;;
    reset) reset_all ;;
    *) echo "Usage: sudo ./setreset.sh {setup|reset}" ;;
esac