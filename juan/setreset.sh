#!/bin/bash

# Policy switches
ALLOW_REAL_SETUP=true
ALLOW_REAL_RESET=true

set -e

# Basic argument check
if [ $# -lt 1 ]; then
    echo "Usage: $0 {setup|reset} [--dry-run]"
    exit 1
fi

MODE="$1"
shift || true

# Check for dry-run flag
DRY_RUN=false
for arg in "$@"; do
    if [ "$arg" = "--dry-run" ]; then
        DRY_RUN=true
    fi
done

# Command runner helper
run_cmd() {
    if $DRY_RUN; then
        echo "  → [DRY-RUN] Would run: $*"
    else
        echo "  → Running: $*"
        "$@"
    fi
}

echo ""
echo " Starting CDCS Script"
echo "Mode: $MODE | Dry Run: $DRY_RUN"
echo "--------------------------------"

setup_all() {
    if [ -f "/opt/cdcs/deril/client.js" ]; then
        echo "CDCS: Already installed. Skipping setup."
        exit 0
    fi
    echo "SETUP REQUEST RECEIVED"
    echo "Timestamp   : $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "User        : ${SUDO_USER:-$USER}"
    echo "--------------------------------"

    if [ "$ALLOW_REAL_SETUP" != "true" ] && ! $DRY_RUN; then
        echo "[CDCS] Real setup is DISABLED by policy. No changes made."
        return 0
    fi

    # 1. Directory Creation
    echo " Creating protected directory..."
    run_cmd sudo mkdir -p /opt/cdcs/deril

    # 2. File Protection (Moving to Root folder)
    echo " Moving governance files to /opt/cdcs/deril/..."
    run_cmd sudo cp /home/juan/cdcs/deril/client.js /opt/cdcs/deril/
    run_cmd sudo cp /home/juan/cdcs/deril/.env /opt/cdcs/deril/
    run_cmd sudo cp /home/juan/cdcs/deril/package.json /opt/cdcs/deril/
    
    # 3. Dependency Handling
    if [ -d "/home/juan/cdcs/deril/node_modules" ]; then
        echo " Copying existing dependencies..."
        run_cmd sudo cp -r /home/juan/cdcs/deril/node_modules /opt/cdcs/deril/
    else
        echo " No node_modules found. Attempting fresh install in target..."
        run_cmd sudo npm install --prefix /opt/cdcs/deril
    fi

    # 4. Permissions Lockdown
    echo " Locking down file permissions (Root Access Only)..."
    run_cmd sudo chown root:root -R /opt/cdcs
    run_cmd sudo chmod 755 -R /opt/cdcs
    
    # Secure the .env file so it is only readable by root
    if [ -f "/opt/cdcs/deril/.env" ] || $DRY_RUN; then
        run_cmd sudo chmod 600 /opt/cdcs/deril/.env
    fi

    # 5. Service Creation (Targeting client.js)
    echo " Configuring Systemd Service..."
    if $DRY_RUN; then
        echo "  → [DRY-RUN] Would create /etc/systemd/system/cdcs.service"
    else
        # Correcting ExecStart to target client.js instead of server.js
        sudo tee /etc/systemd/system/cdcs.service > /dev/null <<EOF
[Unit]
Description=CDCS: Centralized Linux Endpoint Client
After=network.target

[Service]
User=root
Group=root
WorkingDirectory=/opt/cdcs/deril
ExecStart=$(which node) /opt/cdcs/deril/client.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
    fi

    # 6. Activation
    echo " Activating service..."
    run_cmd sudo systemctl daemon-reload
    run_cmd sudo systemctl enable cdcs.service
    run_cmd sudo systemctl restart cdcs.service

    # 7. Service Validation
    if ! $DRY_RUN; then
        echo " Validating service health..."
        sleep 3
        if systemctl is-active --quiet cdcs.service; then
            echo " [OK] CDCS Client is running successfully."
        else
            echo " [ERROR] CDCS Client failed to start."
            echo " Check logs: sudo journalctl -u cdcs.service -n 20 --no-pager"
        fi
    fi

    echo " Creating completion flag..."
    run_cmd touch /home/juan/cdcs/juan/.provisioned
    
    echo ""
    echo " SETUP SEQUENCE FINISHED"
}

reset_all() {
    echo "RESET REQUEST RECEIVED"
    echo "--------------------------------"

    # 1. Stop and Disable the service
    echo " Stopping background services..."
    run_cmd sudo systemctl stop cdcs.service
    run_cmd sudo systemctl disable cdcs.service
    
    # 2. Remove System Configurations
    echo " Deleting service configurations..."
    run_cmd sudo rm -f /etc/systemd/system/cdcs.service
    run_cmd sudo systemctl daemon-reload

    # 3. Clean up Autostart Trigger (The login part)
    echo " Removing first-login trigger..."
    run_cmd sudo rm -f /etc/xdg/autostart/cdcs-init.desktop

    # 4. Wipe Deployment Folder
    echo " Wiping deployment directory in /opt..."
    run_cmd sudo rm -rf /opt/cdcs

    # 5. Clear Local Flags
    echo " Clearing provisioning flags..."
    run_cmd sudo rm -f /home/juan/cdcs/juan/.provisioned

    echo "--- RESET COMPLETE ---"
}

case "$MODE" in
    setup) setup_all ;;
    reset) reset_all ;;
    *)
        echo "Usage: $0 {setup|reset} [--dry-run]"
        exit 1
        ;;
esac