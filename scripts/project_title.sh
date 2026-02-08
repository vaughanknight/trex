#!/bin/bash
#
# project_title.sh - Get project abbreviation and name for terminal titles
#
# Usage:
#   ./scripts/project_title.sh abbrev     # Returns 2-letter abbreviation (e.g., "TR")
#   ./scripts/project_title.sh name       # Returns full project name (e.g., "trex")
#   ./scripts/project_title.sh            # Returns abbreviation (default)
#
# Config: .config/project.json
# If config doesn't exist, creates it from folder name.
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CONFIG_FILE="$PROJECT_ROOT/.config/project.json"

# Get project folder name
get_folder_name() {
    basename "$PROJECT_ROOT"
}

# Generate 2-letter abbreviation from folder name
generate_abbrev() {
    local name="$1"
    echo "${name:0:2}" | tr '[:lower:]' '[:upper:]'
}

# Create config if it doesn't exist
ensure_config() {
    if [[ ! -f "$CONFIG_FILE" ]]; then
        mkdir -p "$(dirname "$CONFIG_FILE")"
        local folder_name=$(get_folder_name)
        local abbrev=$(generate_abbrev "$folder_name")
        cat > "$CONFIG_FILE" << EOF
{
  "abbreviation": "$abbrev",
  "name": "$folder_name"
}
EOF
        echo "Created $CONFIG_FILE" >&2
    fi
}

# Read value from JSON config (simple grep-based, no jq dependency)
read_config() {
    local key="$1"
    grep "\"$key\"" "$CONFIG_FILE" | sed 's/.*: *"\([^"]*\)".*/\1/'
}

# Main
ensure_config

case "${1:-abbrev}" in
    abbrev|a)
        read_config "abbreviation"
        ;;
    name|n)
        read_config "name"
        ;;
    *)
        echo "Usage: $0 [abbrev|name]" >&2
        exit 1
        ;;
esac
