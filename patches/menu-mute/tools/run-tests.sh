#!/usr/bin/env bash
# run-tests.sh — песочница: маршрут + подпись меню.
#
#   ./tools/run-tests.sh                    # sandbox/dsh-pet (по умолчанию)
#   ./tools/run-tests.sh /path/to/dsh-pet   # любой пропатченный плагин
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN="${1:-$HERE/../sandbox/dsh-pet}"
PLUGIN="${PLUGIN/#\~/$HOME}"

[ -f "$PLUGIN/lib/voice-mute.js" ] || { echo "✗ нет $PLUGIN/lib/voice-mute.js — сначала примените патч" >&2; exit 1; }

node "$HERE/test-route.mjs" --plugin "$PLUGIN"
echo
node "$HERE/test-label.mjs" --plugin "$PLUGIN"
echo
node "$HERE/test-toggle.mjs" --plugin "$PLUGIN"
