#!/bin/bash
set -e

# Build the trex web binary
# This script is a wrapper around the Makefile

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"
make build-web

echo "Build complete: dist/trex"
