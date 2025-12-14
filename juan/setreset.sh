#!/bin/bash
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
    echo " RESETTING YOUR SYSTEM"
    echo "========================"
    echo ""

    echo " Stopping security services..."
    run_cmd sudo systemctl stop fail2ban || true
    run_cmd sudo ufw disable || true

    echo ""
    echo " Removing configuration files..."
    run_cmd sudo rm -f /etc/fail2ban/jail.local
    run_cmd sudo rm -f /etc/cron.weekly/cdcs-system-upgrade
    run_cmd sudo rm -f /etc/cron.weekly/cdcs-git-backup
    run_cmd sudo rm -f /usr/local/bin/cdcs-backup.sh
    run_cmd sudo rm -rf /var/backups/git-backup

    echo ""
    echo "  Reinstalling everything fresh..."
    setup_all

    echo " RESET COMPLETE!"
    echo ""
}

case "$MODE" in
    setup)
        setup_all
        ;;
    reset)
        reset_all
        ;;
    *)
        echo "Usage: $0 {setup|reset} [--dry-run]"
        exit 1
        ;;
esac