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
    echo "--- PHASE 1: USER PROVISIONING ---"
    # Create Admin and Employee
    for user in cdcs_admin cdcs_employee; do
        if ! id "$user" &>/dev/null; then
            useradd -m -s /bin/bash "$user"
            echo "$user:${user}123" | chpasswd
            [[ "$user" == "cdcs_admin" ]] && usermod -aG sudo "$user"
            echo "User '$user' created."
        fi
    done

    echo "--- PHASE 2: DEPENDENCY RESOLUTION ---"
    # We run these BEFORE starting the service to prevent ENOENT/Module errors
    if command -v npm &>/dev/null; then
        echo "Installing Agent dependencies (Deril)..."
        npm install --prefix "$VAULT_ROOT/deril" --silent
        
        echo "Installing Frontend dependencies (Evana)..."
        # Checks for the client_frontend specifically if it exists
        if [ -d "$VAULT_ROOT/evana/client_frontend" ]; then
            npm install --prefix "$VAULT_ROOT/evana/client_frontend" --silent
        fi
    else
        echo "CRITICAL: npm not found! Install nodejs/npm first."
        exit 1
    fi

    echo "--- PHASE 3: VAULT CONFIGURATION ---"
    chmod +x "$VAULT_ROOT/juan"/*.sh

    echo "--- PHASE 4: AUTO-BOOT PERSISTENCE ---"
    tee /etc/systemd/system/cdcs.service > /dev/null <<EOF
[Unit]
Description=CDCS Background Governance Agent
After=network.target

[Service]
User=root
WorkingDirectory=$VAULT_ROOT/deril
ExecStart=$(which node) $VAULT_ROOT/deril/client.js
Restart=always

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable cdcs.service
    systemctl start cdcs.service

    # Strict Security Lockdown
    chown root:root -R "$VAULT_ROOT"
    chmod 700 "$VAULT_ROOT"
    
    echo "--- [SUCCESS] SETUP COMPLETE ---"
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