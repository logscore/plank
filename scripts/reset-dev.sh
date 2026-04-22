#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEV_COMPOSE_FILE="$ROOT_DIR/docker/docker-compose.dev.yml"
PROD_COMPOSE_FILE="$ROOT_DIR/docker/docker-compose.yml"

ASSUME_YES=false
INCLUDE_MEDIA=false

usage() {
    echo "Usage: scripts/reset-dev.sh [--yes] [--include-media]"
    echo
    echo "  --yes            Skip confirmation prompt"
    echo "  --include-media  Also remove repo-local ./media if it exists"
}

for arg in "$@"; do
    case "$arg" in
        --yes)
            ASSUME_YES=true
            ;;
        --include-media)
            INCLUDE_MEDIA=true
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown option: $arg" >&2
            usage >&2
            exit 1
            ;;
    esac
done

confirm() {
    if [ "$ASSUME_YES" = true ]; then
        return 0
    fi

    echo "This will remove Docker dev/prod containers, named volumes, and local build artifacts."
    if [ "$INCLUDE_MEDIA" = true ]; then
        echo "It will also delete the repo-local media directory."
    fi
    printf "Continue? [y/N] "
    read -r reply
    case "$reply" in
        y|Y|yes|YES)
            ;;
        *)
            echo "Aborted."
            exit 1
            ;;
    esac
}

run_compose_down() {
    local compose_file="$1"
    if [ ! -f "$compose_file" ]; then
        return 0
    fi

    docker compose -f "$compose_file" down --volumes --remove-orphans || true
}

remove_path() {
    local target="$1"
    if [ -e "$target" ]; then
        rm -rf "$target"
        echo "Removed $(realpath --relative-to="$ROOT_DIR" "$target" 2>/dev/null || printf '%s' "$target")"
    fi
}

confirm

echo "Stopping Docker environments..."
run_compose_down "$DEV_COMPOSE_FILE"
run_compose_down "$PROD_COMPOSE_FILE"

echo "Removing local dev artifacts..."
remove_path "$ROOT_DIR/node_modules"
remove_path "$ROOT_DIR/build"
remove_path "$ROOT_DIR/.svelte-kit"
remove_path "$ROOT_DIR/coverage"
remove_path "$ROOT_DIR/data"
remove_path "$ROOT_DIR/db"

if [ "$INCLUDE_MEDIA" = true ]; then
    remove_path "$ROOT_DIR/media"
fi

echo
echo "Dev environment reset complete."
echo "Next steps:"
echo "  1. npm install"
echo "  2. ./scripts/dev.sh"
