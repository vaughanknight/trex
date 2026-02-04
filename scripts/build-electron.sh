#!/bin/bash
set -e

# Build the trex Electron desktop app
# This script is a wrapper around the Makefile

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"
make build-electron

echo "Build complete: electron/release/"
