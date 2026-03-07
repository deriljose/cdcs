#!/bin/bash
# Update all packages

dpkg --configure -a
apt-get update
apt-get upgrade -y