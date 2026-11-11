#!/usr/bin/env bash
# Все офлайн-тесты: pickStyle (12 фраз), провайдер с моками, собранный бандл в песочнице.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"
exec node --experimental-vm-modules --test tests/*.test.mjs
