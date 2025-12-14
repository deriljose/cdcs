#!/bin/bash
# List user-installed Linux packages (excluding dependencies & default packages)

# Get cur directory where script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Specify file of default system packages to exclude
WHITELIST_FILE="$SCRIPT_DIR/default_packages.txt"

# Check if system is Debian-based (uses apt)
if command -v apt-mark &> /dev/null; then
    # List manually installed packages
    output=$(apt-mark showmanual)

    # Filter libraries
    filtered=$(echo "$output" \
        | grep -Ev '^(lib|gir1\.|fonts-|python|gstreamer|linux-|xserver|mesa-|gnome-|kde-|qt[0-9]?|ubuntu|language-|task-)' \
        | grep -Fxv -f "$WHITELIST_FILE" \
        | sort)

    echo "$filtered"

# Check if system is Fedora-based (uses dnf)
elif command -v dnf &> /dev/null; then
    # List manually installed packages
    output=$(dnf repoquery --userinstalled --qf '%{name}')

    # Filter libraries
    filtered=$(echo "$output" \
        | grep -Ev '^(lib|python|gstreamer|fonts-|kernel-|mesa-|xorg-|gtk|gnome-|kde-|qt[0-9]?|language|desktop-|x11|adwaita|themes?|systemd|grub)' \
        | grep -Fxv -f "$WHITELIST_FILE" \
        | sort)

    echo "$filtered"
fi
