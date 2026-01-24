#!/bin/bash
dpkg --configure -a
apt-get update
apt-get upgrade -y