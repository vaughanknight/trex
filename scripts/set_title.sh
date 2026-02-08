#!/bin/bash
#
# set_title.sh - Set terminal title for agent workflow status
#
# Usage:
#   ./scripts/set_title.sh idle                              # Set to project name (trex)
#   ./scripts/set_title.sh working 008 P2/3 T3/25            # TR-008:P2/3:T3/25
#   ./scripts/set_title.sh working 008 P2/3 T5/25 S2/4       # TR-008:P2/3:T5/25:S2/4
#   ./scripts/set_title.sh working 008 T3/9                  # TR-008:T3/9 (simple mode)
#   ./scripts/set_title.sh waiting 008 P2/3 T3/25            # ? TR-008:P2/3:T3/25
#   ./scripts/set_title.sh phase-done 008 P3/3               # → TR-008:P3/3
#   ./scripts/set_title.sh plan-done 008-dynamic-session-titles  # ✓ TR-008-dynamic-session-titles
#   ./scripts/set_title.sh raw "Any Custom Title"            # Sets exact string
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Get project abbreviation
get_abbrev() {
    "$SCRIPT_DIR/project_title.sh" abbrev
}

# Get project name
get_name() {
    "$SCRIPT_DIR/project_title.sh" name
}

# Set the terminal title via OSC escape sequence
set_title() {
    echo -ne "\033]0;$1\007"
}

# Build working title: TR-008:P2/3:T3/25 or TR-008:P2/3:T5/25:S2/4
build_working_title() {
    local abbrev=$(get_abbrev)
    local ordinal="$1"
    shift

    local title="${abbrev}-${ordinal}"

    # Append remaining components with colons
    while [[ $# -gt 0 ]]; do
        title="${title}:$1"
        shift
    done

    echo "$title"
}

# Main
case "${1:-}" in
    idle)
        set_title "$(get_name)"
        echo "Title: $(get_name)"
        ;;
    working)
        shift
        title=$(build_working_title "$@")
        set_title "$title"
        echo "Title: $title"
        ;;
    waiting)
        shift
        title="? $(build_working_title "$@")"
        set_title "$title"
        echo "Title: $title"
        ;;
    phase-done)
        shift
        title="→ $(build_working_title "$@")"
        set_title "$title"
        echo "Title: $title"
        ;;
    plan-done)
        shift
        abbrev=$(get_abbrev)
        title="✓ ${abbrev}-$1"
        set_title "$title"
        echo "Title: $title"
        ;;
    raw)
        shift
        set_title "$1"
        echo "Title: $1"
        ;;
    *)
        echo "Usage: $0 <command> [args...]"
        echo ""
        echo "Commands:"
        echo "  idle                           Set to project name"
        echo "  working <ord> [P#/#] [T#/#] [S#/#]  Set working status"
        echo "  waiting <ord> [P#/#] [T#/#]    Set waiting for input"
        echo "  phase-done <ord> P#/#          Phase complete, ready for next"
        echo "  plan-done <ord>-<slug>         Plan complete"
        echo "  raw \"<title>\"                  Set exact title string"
        exit 1
        ;;
esac
