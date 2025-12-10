#!/usr/bin/env bash
set -euo pipefail

main() {
    # This script is run as root by client.js.
    # It receives the whitelisted package name as its first argument.
    
    local package_name="$1"

    if [ -z "$package_name" ]; then
        echo "Error: No package name provided." >&2
        exit 1
    fi

    # --- Security: Sanitize input ---
    # Ensure the package name contains only valid characters for an apt package.
    # This prevents command injection if the whitelist check in client.js fails.
    if ! [[ "$package_name" =~ ^[a-zA-Z0-9][a-zA-Z0-9.+-]+$ ]]; then
        echo "Error: Invalid package name format: '$package_name'. Aborting." >&2
        exit 1
    fi

    echo "Starting installation for package: ${package_name}"

    # --- Debian/Ubuntu Installation Logic ---
    # Set frontend to noninteractive to prevent apt from asking questions.
    export DEBIAN_FRONTEND=noninteractive

    # --- Improved APT Logic ---
    # 1. Clean up local cache to resolve potential inconsistencies.
    echo "Cleaning apt cache..."
    apt-get clean

    # 2. Update package lists with retry logic for transient network errors.
    echo "Updating package lists (will retry up to 3 times)..."
    local update_attempts=0
    until apt-get update; do
        update_attempts=$((update_attempts + 1))
        if [ "$update_attempts" -ge 3 ]; then
            echo "Error: 'apt-get update' failed after 3 attempts." >&2
            exit 1
        fi
        echo "Retrying 'apt-get update' in 10 seconds..."
        sleep 10
    done

    # Install the package non-interactively (-y).
    echo "Installing with apt-get..."
    if ! apt-get install -y "$package_name"; then
        echo "Error: Failed to install package '$package_name'." >&2
        exit 1
    fi

    echo "Installation script for '${package_name}' finished successfully."
}

# Pass all script arguments to the main function.
main "$@"
