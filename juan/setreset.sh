# Force the script to use its own location as the starting point
cd "$(dirname "$0")"
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

    # 1. Directory Creation (Satisfies relative paths like ../juan/)
    echo " Creating split directory structure..."
    run_cmd sudo mkdir -p /opt/cdcs/deril
    run_cmd sudo mkdir -p /opt/cdcs/juan

    # 2. File Protection (Deploying to /opt/cdcs/deril)
    echo " Moving governance files to /opt/cdcs/deril/..."
    run_cmd sudo cp /home/juan/cdcs/deril/client.js /opt/cdcs/deril/
    run_cmd sudo cp /home/juan/cdcs/deril/.env /opt/cdcs/deril/
    run_cmd sudo cp /home/juan/cdcs/deril/package.json /opt/cdcs/deril/
    
    # 3. Script Deployment (Pulls from juan folder, deploys to /opt/cdcs/juan)
    echo " Deploying helper scripts to /opt/cdcs/juan/..."
    # Use bash -c to ensure the wildcard (*) expands correctly with sudo
    run_cmd sudo bash -c "cp /home/juan/cdcs/juan/*.sh /opt/cdcs/juan/"
    
    # Check if any .txt files exist in juan before copying
    if ls /home/juan/cdcs/juan/*.txt >/dev/null 2>&1; then
        run_cmd sudo bash -c "cp /home/juan/cdcs/juan/*.txt /opt/cdcs/juan/"
    fi

    run_cmd sudo chmod +x /opt/cdcs/juan/*.sh

    # 4. Dependency Handling
    if [ -d "/home/juan/cdcs/deril/node_modules" ]; then
        echo " Copying existing dependencies..."
        run_cmd sudo cp -r /home/juan/cdcs/deril/node_modules /opt/cdcs/deril/
    else
        echo " No node_modules found. Attempting fresh install in target..."
        run_cmd sudo npm install --prefix /opt/cdcs/deril
    fi

    # 5. Permissions Lockdown
    echo " Locking down file permissions (Root Access Only)..."
    run_cmd sudo chown root:root -R /opt/cdcs
    run_cmd sudo chmod 755 -R /opt/cdcs
    
    # Secure the .env file so it is only readable by root
    if [ -f "/opt/cdcs/deril/.env" ] || $DRY_RUN; then
        run_cmd sudo chmod 600 /opt/cdcs/deril/.env
    fi

    # 6. Service Creation (Targeting client.js)
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

    # 7. Activation
    echo " Activating service..."
    run_cmd sudo systemctl daemon-reload
    run_cmd sudo systemctl enable cdcs.service
    run_cmd sudo systemctl restart cdcs.service

    # 8. Service Validation
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
    echo "--------------------------------"
    echo "INITIATING SYSTEM SANITIZATION"
    echo "STATE: RESTORING TO POST-SETUP BASELINE"
    echo "--------------------------------"

    # 1. Software Baseline Enforcement
    echo " Removing unauthorized user-installed packages..."
    # This calls your script to uninstall everything not in the original whitelist
    if [ -f "/opt/cdcs/juan/delete_packages.sh" ]; then
        sudo /opt/cdcs/juan/delete_packages.sh
    fi

    # 2. Browser Sanitization (Cleaning without Deleting)
    echo " Sanitizing web browser data (Profiles, History, Cookies)..."
    # This clears Firefox/Chrome profiles without deleting the application itself
    rm -rf ~/.mozilla/firefox/*.default-release/*
    rm -rf ~/.config/google-chrome/Default/*

    # 3. User Directory Purge
    echo " Clearing user-generated files and downloads..."
    # Cleans the standard folders to look 'out-of-the-box'
    rm -rf ~/Documents/*
    rm -rf ~/Downloads/*
    rm -rf ~/Pictures/*
    rm -rf ~/Desktop/* # 4. System Logs and History
    echo " Wiping session metadata and command history..."
    history -c && history -w
    sudo rm -rf /tmp/*
    
    # NOTE: We do NOT delete /opt/cdcs or the systemd service. 
    # The 'Governance Layer' remains active.

    echo "--- RESET COMPLETE: SYSTEM RESTORED TO FRESH STATE ---"
}
case "$MODE" in
    setup) setup_all ;;
    reset) reset_all ;;
    *)
        echo "Usage: $0 {setup|reset} [--dry-run]"
        exit 1
        ;;
esac