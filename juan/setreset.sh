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
    run_cmd sudo cp ../deril/client.js /opt/cdcs/deril/
    run_cmd sudo cp ../deril/.env /opt/cdcs/deril/
    run_cmd sudo cp ../deril/package.json /opt/cdcs/deril/
    
    if [ -d "../deril/node_modules" ]; then
        echo " Copying dependencies..."
        run_cmd sudo cp -r ../deril/node_modules /opt/cdcs/deril/
    fi

    # 3. Permissions
    echo " Locking down file permissions..."
    run_cmd sudo chown root:root -R /opt/cdcs
    run_cmd sudo chmod 755 -R /opt/cdcs
    if [ -f "../deril/.env" ] || $DRY_RUN; then
        run_cmd sudo chmod 600 /opt/cdcs/deril/.env
    fi

    # 4. Service Creation
    echo " Configuring Systemd Service..."
    if $DRY_RUN; then
        echo "  → [DRY-RUN] Would create /etc/systemd/system/cdcs.service"
    else
        sudo tee /etc/systemd/system/cdcs.service > /dev/null <<EOF
[Unit]
Description=CDCS: Centralized Linux Endpoint Client
After=network.target

[Service]
User=root
Group=root
WorkingDirectory=/opt/cdcs/deril
ExecStart=/usr/bin/node /opt/cdcs/deril/client.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
    fi

    # 5. Activation
    echo " Activating service..."
    run_cmd sudo systemctl daemon-reload
    run_cmd sudo systemctl enable cdcs.service
    run_cmd sudo systemctl restart cdcs.service

    # 6. Service Validation
    if ! $DRY_RUN; then
        echo " Validating service health..."
        sleep 2
        if systemctl is-active --quiet cdcs.service; then
            echo " [OK] CDCS Client is running successfully."
        else
            echo " [ERROR] CDCS Client failed to start. Check 'sudo journalctl -u cdcs.service'"
        fi
    fi

    echo ""
    echo " SETUP SEQUENCE FINISHED"
}

reset_all() {
    echo "RESET REQUEST RECEIVED"
    echo "--------------------------------"

    if [ "$ALLOW_REAL_RESET" != "true" ] && ! $DRY_RUN; then
        echo "[CDCS] Real reset is DISABLED by policy."
        return 0
    fi

    echo " Stopping and removing CDCS Client..."
    run_cmd sudo systemctl stop cdcs.service
    run_cmd sudo systemctl disable cdcs.service
    
    echo " Deleting files and service configurations..."
    run_cmd sudo rm -f /etc/systemd/system/cdcs.service
    run_cmd sudo rm -rf /opt/cdcs
    run_cmd sudo systemctl daemon-reload

    echo " RESET COMPLETE"
}

case "$MODE" in
    setup) setup_all ;;
    reset) reset_all ;;
    *)
        echo "Usage: $0 {setup|reset} [--dry-run]"
        exit 1
        ;;
esac