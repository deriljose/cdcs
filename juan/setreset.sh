#!/bin/bash

# Role-Based Access: Requires Root (IT Admin) Privileges


# 1. PRIVILEGE CHECK: Enforcement of Role-Based Access
# only IT Admins (root) can modify system state.
if [[ $EUID -ne 0 ]]; then
   echo "CRITICAL ERROR: This script must be run with Root privileges (IT Admin)."
   echo "Access Denied for user: $USER"
   exit 1
fi

# 2. PORTABILITY: Set working directory to the script's own location
# This ensures relative paths (../deril) work on any VM or username.
cd "$(dirname "$0")"

# Policy switches for internal governance
ALLOW_REAL_SETUP=true
ALLOW_REAL_RESET=true

set -e

# --- ARGUMENT HANDLING ---
if [ $# -lt 1 ]; then
    echo "Usage: sudo $0 {setup|reset} [--dry-run]"
    exit 1
fi

MODE="$1"
shift || true

DRY_RUN=false
for arg in "$@"; do
    if [ "$arg" = "--dry-run" ]; then
        DRY_RUN=true
    fi
done

# Command execution wrapper
run_cmd() {
    if $DRY_RUN; then
        echo "  → [DRY-RUN] Would run: $*"
    else
        echo "  → Running: $*"
        "$@"
    fi
}

echo ""
echo " Starting CDCS Governance Module"
echo " Access Level: ADMINISTRATIVE (ROOT)"
echo " Mode: $MODE | Dry Run: $DRY_RUN"
echo "--------------------------------"

setup_all() {
    # Idempotency check: prevent re-installing over a live system
    if [ -f "/opt/cdcs/deril/client.js" ]; then
        echo "CDCS: Governance layer already installed. Skipping setup."
        exit 0
    fi
    
    echo "SETUP REQUEST RECEIVED"
    echo "Timestamp   : $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "Operator    : ${SUDO_USER:-$USER}"
    echo "--------------------------------"

    if [ "$ALLOW_REAL_SETUP" != "true" ] && ! $DRY_RUN; then
        echo "Setup is disabled by internal policy."
        return 0
    fi

    # 1. Establish Software Baseline
    echo " Capturing initial software baseline..."
    run_cmd mkdir -p /opt/cdcs/juan
    if ! $DRY_RUN; then
        # Creates the reference map used by the reset protocol to identify deviations
        apt-mark showmanual | sort > ./baseline_packages.txt
    fi

    # 2. Directory Initialization
    echo " Initializing protected system directories in /opt..."
    run_cmd mkdir -p /opt/cdcs/deril
    run_cmd mkdir -p /opt/cdcs/juan

    # 3. Governance Deployment (Using relative paths for portability)
    echo " Deploying core binaries to /opt/cdcs/deril/..."
    run_cmd cp ../deril/client.js /opt/cdcs/deril/
    run_cmd cp ../deril/.env /opt/cdcs/deril/
    run_cmd cp ../deril/package.json /opt/cdcs/deril/
    
    # 4. Script Deployment
    echo " Deploying administrative scripts to /opt/cdcs/juan/..."
    run_cmd bash -c "cp ./*.sh /opt/cdcs/juan/"
    run_cmd bash -c "cp ./*.txt /opt/cdcs/juan/"
    run_cmd chmod +x /opt/cdcs/juan/*.sh

    # 5. Dependency Management
    if [ -d "../deril/node_modules" ]; then
        echo " Migrating local dependencies..."
        run_cmd cp -r ../deril/node_modules /opt/cdcs/deril/
    else
        echo " No dependencies found locally. Performing network install..."
        run_cmd npm install --prefix /opt/cdcs/deril
    fi

    # 6. Security Hardening
    # Ensures the employee cannot read the .env or modify governance files
    echo " Hardening file permissions..."
    run_cmd chown root:root -R /opt/cdcs
    run_cmd chmod 755 -R /opt/cdcs
    run_cmd chmod 600 /opt/cdcs/deril/.env

    # 7. Persistence Logic (Systemd)
    echo " Registering Systemd governance service..."
    if ! $DRY_RUN; then
        tee /etc/systemd/system/cdcs.service > /dev/null <<EOF
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

    # 8. Service Activation
    run_cmd systemctl daemon-reload
    run_cmd systemctl enable cdcs.service
    run_cmd systemctl restart cdcs.service

    # 9. State Persistence
    run_cmd touch ./.provisioned
    
    echo " SETUP SEQUENCE FINISHED: Endpoint is now under governance."
}

reset_all() {
    echo "--------------------------------"
    echo "INITIATING SYSTEM SANITIZATION"
    echo "REASON: ADMINISTRATIVE OFFBOARDING / TERMINATION"
    echo "--------------------------------"

    # 1. Baseline Enforcement
    echo " Reverting system to authorized software baseline..."
    # Purge common deviations that might bypass standard package comparison
    run_cmd snap remove code 2>/dev/null || true
    run_cmd apt-get purge -y code vlc htop 2>/dev/null || true

    if [ -f "/opt/cdcs/juan/delete_packages.sh" ]; then
        run_cmd /opt/cdcs/juan/delete_packages.sh
    fi

    # 2. Metadata Purge
    echo " Sanitizing application caches and history..."
    run_cmd rm -rf ~/.mozilla/firefox/*.default-release/*
    run_cmd rm -rf ~/.config/google-chrome/Default/*
    run_cmd rm -rf ~/.vscode
    run_cmd rm -rf ~/.config/Code

    # 3. User Data Wipe
    echo " Clearing user-generated files and downloads..."
    # Wipes all standard personal directories
    run_cmd rm -rf ~/Documents/*
    run_cmd rm -rf ~/Downloads/*
    run_cmd rm -rf ~/Pictures/*
    run_cmd rm -rf ~/Desktop/* # 4. Forensics/History Erasure
    echo " Wiping session command history..."
    if ! $DRY_RUN; then
        history -c && history -w
    fi
    run_cmd rm -rf /tmp/*
    
    echo "--- RESET COMPLETE: USER DATA REMOVED, CDCS PERSISTED ---"
}

case "$MODE" in
    setup) setup_all ;;
    reset) reset_all ;;
    *) echo "Usage: sudo $0 {setup|reset} [--dry-run]"; exit 1 ;;
esac