#!/usr/bin/env bash
# apply-mute-menu.sh — пункт «Выключить звук» / «Включить звук» в меню питомца dsh-pet.
#
#   ./apply-mute-menu.sh                 # профиль по умолчанию (~/.dsh/profiles/desktop/...)
#   ./apply-mute-menu.sh --plugin DIR    # другой профиль / песочница
#   ./apply-mute-menu.sh --check         # только проверить, ничего не писать
#   ./apply-mute-menu.sh --dry-run       # показать план правок
#   ./apply-mute-menu.sh --yes           # без подтверждения
#
# Что делает: бэкап шести файлов → патч (маршрут + web-меню + desktop-меню) →
# node --check → verify (маршрут и подписи в обоих бандлах). Идемпотентен.
# Ничего не перезапускает и не включает озвучку: voiceEnabled меняется только
# по клику в меню. Ключи и провайдер Gemini не трогаются.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PLUGIN="${DSH_PET_PLUGIN:-$HOME/.dsh/profiles/desktop/node_modules/dsh-pet}"
ASSUME_YES=0
MODE=apply

while [ $# -gt 0 ]; do
  case "$1" in
    --plugin) PLUGIN="$2"; shift 2 ;;
    --plugin=*) PLUGIN="${1#*=}"; shift ;;
    --yes|-y) ASSUME_YES=1; shift ;;
    --check) MODE=check; shift ;;
    --dry-run) MODE=dry; shift ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "неизвестный аргумент: $1" >&2; exit 2 ;;
  esac
done
PLUGIN="${PLUGIN/#\~/$HOME}"

say()  { printf '%s\n' "$*"; }
fail() { printf '✗ %s\n' "$*" >&2; exit 1; }

[ -d "$PLUGIN" ] || fail "нет каталога плагина: $PLUGIN"
[ -f "$PLUGIN/package.json" ] || fail "нет package.json: $PLUGIN"
[ -f "$PLUGIN/lib/index.js" ] || fail "нет lib/index.js: $PLUGIN"
[ -f "$PLUGIN/lib/client.js" ] || fail "нет lib/client.js: $PLUGIN"
[ -f "$PLUGIN/runtime/electron-helper/shared-core.js" ] || fail "нет shared-core.js: $PLUGIN"
[ -f "$PLUGIN/runtime/electron-helper/renderer.js" ] || fail "нет renderer.js: $PLUGIN"
[ -f "$PLUGIN/runtime/electron-helper/sprite/menu.js" ] || fail "нет sprite/menu.js: $PLUGIN"

NAME="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("name",""))' "$PLUGIN/package.json")"
[ "$NAME" = "dsh-pet" ] || fail "это не dsh-pet (name=$NAME)"
PLUGIN="$(cd "$PLUGIN" && pwd -P)"
command -v node >/dev/null || fail "нет node (нужен для node --check)"
command -v python3 >/dev/null || fail "нет python3"

FILES=(
  lib/index.js
  lib/standalone.js
  lib/client.js
  runtime/electron-helper/shared-core.js
  runtime/electron-helper/renderer.js
  runtime/electron-helper/sprite/menu.js
)
ADDED=lib/voice-mute.js

sha() {
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | cut -d' ' -f1
  else sha256sum "$1" | cut -d' ' -f1; fi
}

say "плагин: $PLUGIN"
say "пункт:  «Выключить звук» / «Включить звук» (рядом с «Чат»), маршрут POST /dsh-pet-7340/voice/mute"

if [ "$MODE" = check ]; then
  python3 "$HERE/tools/patch-mute.py" --plugin "$PLUGIN" --check || exit 1
  for rel in "${FILES[@]}" "$ADDED"; do
    node --check "$PLUGIN/$rel" >/dev/null || fail "node --check: $rel"
  done
  say "✓ node --check: ${#FILES[@]}+1 файлов OK"
  exit 0
fi

if [ "$MODE" = dry ]; then
  python3 "$HERE/tools/patch-mute.py" --plugin "$PLUGIN" --dry-run
  exit $?
fi

# Уже применено? Тогда ни бэкапа, ни правок — только проверка.
if python3 "$HERE/tools/patch-mute.py" --plugin "$PLUGIN" --check >/dev/null 2>&1; then
  say "✓ патч уже применён — ничего не меняю (идемпотентно)"
  for rel in "${FILES[@]}" "$ADDED"; do
    node --check "$PLUGIN/$rel" >/dev/null || fail "node --check: $rel"
  done
  say "✓ node --check: ${#FILES[@]}+1 файлов OK"
  exit 0
fi

if [ "$ASSUME_YES" -ne 1 ]; then
  say ""
  say "Будет изменено:"
  say "  lib/index.js                              — POST /voice/mute"
  say "  lib/standalone.js                         — тот же маршрут для standalone-режима"
  say "  lib/voice-mute.js                         — новый модуль маршрута"
  say "  lib/client.js                             — пункт в web-меню"
  say "  runtime/electron-helper/shared-core.js    — состояние + подпись + экспорт"
  say "  runtime/electron-helper/renderer.js       — начальное voiceEnabled"
  say "  runtime/electron-helper/sprite/menu.js    — пункт в desktop-меню"
  printf 'Продолжить? [y/N] '
  read -r ans || true
  case "$ans" in y|Y|yes|YES) ;; *) say "отменено"; exit 1 ;; esac
fi

TS="$(date +%Y%m%d-%H%M%S)"
BACKUP="$ROOT/backups/menu-mute/$TS"
mkdir -p "$BACKUP/files"
say "бэкап: $BACKUP"

: > "$BACKUP/manifest.txt"
for rel in "${FILES[@]}"; do
  mkdir -p "$BACKUP/files/$(dirname "$rel")"
  cp -p "$PLUGIN/$rel" "$BACKUP/files/$rel"
  printf 'F\t%s\t%s\n' "$rel" "$(sha "$PLUGIN/$rel")" >> "$BACKUP/manifest.txt"
done
if [ -f "$PLUGIN/$ADDED" ]; then
  mkdir -p "$BACKUP/files/$(dirname "$ADDED")"
  cp -p "$PLUGIN/$ADDED" "$BACKUP/files/$ADDED"
  printf 'F\t%s\t%s\n' "$ADDED" "$(sha "$PLUGIN/$ADDED")" >> "$BACKUP/manifest.txt"
else
  printf 'A\t%s\t-\n' "$ADDED" >> "$BACKUP/manifest.txt"
fi
{
  echo "plugin=$PLUGIN"
  echo "created=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "version=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("version",""))' "$PLUGIN/package.json")"
} > "$BACKUP/meta.txt"

if ! python3 "$HERE/tools/patch-mute.py" --plugin "$PLUGIN"; then
  say "✗ патч не применился — возвращаю файлы из бэкапа" >&2
  "$HERE/rollback-mute-menu.sh" --plugin "$PLUGIN" --backup "$BACKUP" >/dev/null || true
  exit 1
fi

say "→ node --check"
for rel in "${FILES[@]}" "$ADDED"; do
  if ! node --check "$PLUGIN/$rel" >/dev/null; then
    say "✗ синтаксис $rel — откат" >&2
    "$HERE/rollback-mute-menu.sh" --plugin "$PLUGIN" --backup "$BACKUP"
    exit 1
  fi
done
say "✓ node --check: ${#FILES[@]}+1 файлов OK"

if ! python3 "$HERE/tools/patch-mute.py" --plugin "$PLUGIN" --check; then
  say "✗ verify после патча не прошёл — откат" >&2
  "$HERE/rollback-mute-menu.sh" --plugin "$PLUGIN" --backup "$BACKUP"
  exit 1
fi

say ""
say "Готово. Откат: $HERE/rollback-mute-menu.sh --plugin \"$PLUGIN\""
say "Обновите страницу DSH (web) или перезапустите desktop-окно вручную — меню подхватит патч."
