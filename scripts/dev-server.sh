#!/usr/bin/env bash
# Manage the trex dev backend server.
# Uses nohup so the server survives if the parent process (e.g. Claude Code) exits.
#
# Usage:
#   ./scripts/dev-server.sh start    # Start the server (default)
#   ./scripts/dev-server.sh stop     # Stop the server
#   ./scripts/dev-server.sh restart  # Stop then start
#   ./scripts/dev-server.sh status   # Check if running
#   ./scripts/dev-server.sh logs     # Tail the log file
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

LOG_FILE="$ROOT_DIR/backend/dev-server.log"
PID_FILE="$ROOT_DIR/backend/dev-server.pid"

is_running() {
  [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null
}

do_start() {
  if is_running; then
    echo "Already running (PID $(cat "$PID_FILE"))"
    return 0
  fi

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
  cd "$ROOT_DIR"
  nohup make dev-backend > "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
  echo "Server started (PID $!) — logs: $LOG_FILE"
}

do_stop() {
  if ! is_running; then
    echo "Not running"
    rm -f "$PID_FILE"
    return 0
  fi

  local pid
  pid=$(cat "$PID_FILE")
  echo "Stopping server (PID $pid)"
  kill "$pid" 2>/dev/null || true
  # Wait up to 5 seconds for graceful shutdown
  for i in {1..10}; do
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.5
  done
  # Force kill if still alive
  if kill -0 "$pid" 2>/dev/null; then
    echo "Force killing (PID $pid)"
    kill -9 "$pid" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
  echo "Stopped"
}

do_status() {
  if is_running; then
    echo "Running (PID $(cat "$PID_FILE"))"
    echo "Logs: $LOG_FILE"
  else
    echo "Not running"
    rm -f "$PID_FILE"
  fi
}

do_logs() {
  if [ ! -f "$LOG_FILE" ]; then
    echo "No log file found"
    exit 1
  fi
  tail -f "$LOG_FILE"
}

case "${1:-start}" in
  start)   do_start ;;
  stop)    do_stop ;;
  restart) do_stop && do_start ;;
  status)  do_status ;;
  logs)    do_logs ;;
  *)
    echo "Usage: $0 {start|stop|restart|status|logs}"
    exit 1
    ;;
esac
