#!/bin/bash

# Policy switches
ALLOW_REAL_SETUP=true
ALLOW_REAL_RESET=false

set -e

if [ $# -lt 1 ]; then
    echo "Usage: $0 {setup|reset} [--dry-run]"
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

run_cmd() {
    if $DRY_RUN; then
        echo "  → Would run: $*"
    else
        echo "  → Running: $*"
        "$@"
    fi
}

echo ""
echo " Starting CDCS Script"
echo "Mode: $MODE | Test Mode: $DRY_RUN"
echo ""

setup_all() {

    echo "SETUP REQUEST RECEIVED"
    echo "--------------------------------"
    echo "Policy      : SIMULATION MODE"
    echo "Reason      : Device provisioning requested"
    echo "Timestamp   : $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "Hostname    : $(hostname)"
    echo "User        : ${SUDO_USER:-$USER}"
    echo "--------------------------------"

    if [ "$ALLOW_REAL_SETUP" != "true" ]; then
        echo "[CDCS] Real setup is DISABLED by policy."
        echo "[CDCS] No system changes executed."
        echo "[CDCS] Setup acknowledged."
        echo ""
        return 0
    fi

    echo " SETTING UP YOUR SYSTEM"
    echo "=========================="
    echo ""

    echo "  Updating software packages..."
    run_cmd sudo apt update -y

    echo ""
    echo "  Installing firewall..."
    run_cmd sudo apt install -y ufw
    run_cmd sudo ufw default deny incoming
    run_cmd sudo ufw default allow outgoing
    run_cmd sudo ufw allow 22/tcp
    run_cmd sudo ufw --force enable

    echo ""
    echo " Installing security protection (Fail2Ban)..."
    run_cmd sudo apt install -y fail2ban

    if $DRY_RUN; then
        echo "  → Would create security config file"
    else
        sudo tee /etc/fail2ban/jail.local > /dev/null << 'EOF'
[sshd]
enabled = true
port    = ssh
filter  = sshd
logpath = /var/log/auth.log
maxretry = 5
bantime = 3600
EOF
    fi

    run_cmd sudo systemctl restart fail2ban

    echo ""
    echo " Setting up automatic security updates..."
    run_cmd sudo apt install -y unattended-upgrades
    run_cmd sudo dpkg-reconfigure --priority=low unattended-upgrades

    if $DRY_RUN; then
        echo "  → Would create auto-update config"
    else
        sudo tee /etc/apt/apt.conf.d/20auto-upgrades > /dev/null << 'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
EOF
    fi

    echo ""
    echo " SETUP COMPLETE!"
    echo ""
}

reset_all() {
    echo "[CDCS] RESET REQUEST RECEIVED"
    echo "--------------------------------"
    echo "Policy      : SIMULATION MODE"
    echo "Reason      : Remote reset requested by server"
    echo "Timestamp   : $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "Hostname    : $(hostname)"
    echo "User        : ${SUDO_USER:-$USER}"
    echo "--------------------------------"

    if [ "$ALLOW_REAL_RESET" != "true" ]; then
        echo "[CDCS] Real reset is DISABLED by policy."
        echo "[CDCS] No destructive actions executed."
        echo "[CDCS] Reset acknowledged."
        return 0
    fi
}

case "$MODE" in
    setup) setup_all  ;;
    reset) reset_all  ;;
    *)
        echo "Usage: $0 {setup|reset} [--dry-run]"
        exit 1
        ;;
esac