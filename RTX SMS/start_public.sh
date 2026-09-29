#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
echo "Starting MAIT SMS on HTTP port 80..."
exec sudo python3 main.py
