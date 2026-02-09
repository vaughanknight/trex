#!/usr/bin/env bash
# Start the trex backend with environment from .env
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

ENV_FILE="$ROOT_DIR/.env"
if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
  echo "Loaded environment from .env"
else
  echo "No .env file found — starting without auth"
fi

echo "Starting trex server (auth: ${TREX_AUTH_ENABLED:-false})"
cd "$ROOT_DIR" && make dev-backend
