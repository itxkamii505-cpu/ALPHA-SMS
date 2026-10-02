#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
echo "Starting ALPHA SMS on HTTP port 80..."
exec sudo python3 main.py
