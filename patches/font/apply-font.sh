#!/usr/bin/env bash
# apply-font.sh — манга-шрифт и плотные метрики для речевого пузыря dsh-pet.
#
#   ./apply-font.sh                 # профиль по умолчанию (~/.dsh/profiles/desktop/...)
#   ./apply-font.sh --plugin DIR    # другой профиль / песочница
#   ./apply-font.sh --check         # только проверить, ничего не писать
#   ./apply-font.sh --dry-run       # показать план замен
#   ./apply-font.sh --yes           # без подтверждения
#
# Идемпотентен: повторный запуск не создаёт второй бэкап и не дублирует @font-face.
# Ничего не перезапускает: после применения обновите страницу DSH / перезапустите
# приложение вручную.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
FONT_DIR="$ROOT/assets/font"
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
    -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
    *) echo "неизвестный аргумент: $1" >&2; exit 2 ;;
  esac
done
PLUGIN="${PLUGIN/#\~/$HOME}"

say()  { printf '%s\n' "$*"; }
fail() { printf '✗ %s\n' "$*" >&2; exit 1; }

[ -d "$PLUGIN" ] || fail "нет каталога плагина: $PLUGIN"
[ -f "$PLUGIN/package.json" ] || fail "нет package.json: $PLUGIN"
[ -f "$PLUGIN/lib/client.js" ] || fail "нет lib/client.js: $PLUGIN"
[ -f "$PLUGIN/runtime/electron-helper/shared-core.js" ] || fail "нет shared-core.js: $PLUGIN"

NAME="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("name",""))' "$PLUGIN/package.json")"
[ "$NAME" = "dsh-pet" ] || fail "это не dsh-pet (name=$NAME)"
PLUGIN="$(cd "$PLUGIN" && pwd -P)"

for f in BalsamiqSans-Regular.ttf BalsamiqSans-Bold.ttf Pangolin-Regular.ttf; do
  [ -s "$FONT_DIR/$f" ] || fail "нет шрифта $FONT_DIR/$f"
done
command -v node >/dev/null || fail "нет node (нужен для node --check)"
command -v python3 >/dev/null || fail "нет python3"

say "плагин: $PLUGIN"
say "шрифты: Balsamiq Sans 400/700 + Pangolin (fallback), кириллица 64/64"

if [ "$MODE" = check ]; then
  python3 "$HERE/tools/patch-font.py" --plugin "$PLUGIN" --check
  exit $?
fi

if [ "$MODE" = dry ]; then
  python3 "$HERE/tools/patch-font.py" --plugin "$PLUGIN" --dry-run
  exit $?
fi

# Уже применено? Тогда ни бэкапа, ни копирования — только проверка.
if python3 "$HERE/tools/patch-font.py" --plugin "$PLUGIN" --check >/dev/null 2>&1; then
  say "✓ патч уже применён — ничего не меняю (идемпотентно)"
  node --check "$PLUGIN/lib/client.js"
  node --check "$PLUGIN/runtime/electron-helper/shared-core.js"
  node --check "$PLUGIN/runtime/electron-helper/renderer.js"
  say "✓ node --check: client.js, shared-core.js, renderer.js — OK"
  exit 0
fi

if [ "$ASSUME_YES" -ne 1 ]; then
  say ""
  say "Будет изменено:"
  say "  lib/client.js                          (@font-face + стек + метрики)"
  say "  runtime/electron-helper/shared-core.js (стек + BUBBLE_METRICS)"
  say "  runtime/electron-helper/index.html     (CSS бабла)"
  say "  runtime/electron-helper/renderer.js    (@font-face)"
  say "  assets/fonts/                          (+3 .ttf)"
  printf 'Продолжить? [y/N] '
  read -r ans || true
  case "$ans" in y|Y|yes|YES) ;; *) say "отменено"; exit 1 ;; esac
fi

TS="$(date +%Y%m%d-%H%M%S)"
BACKUP="$ROOT/backups/font/$TS"
mkdir -p "$BACKUP/files" "$BACKUP/fonts"
say "бэкап: $BACKUP"

: > "$BACKUP/manifest.txt"
: > "$BACKUP/fonts.txt"
for rel in lib/client.js runtime/electron-helper/shared-core.js \
           runtime/electron-helper/index.html runtime/electron-helper/renderer.js; do
  mkdir -p "$BACKUP/files/$(dirname "$rel")"
  cp -p "$PLUGIN/$rel" "$BACKUP/files/$rel"
  printf 'F\t%s\t%s\n' "$rel" "$(shasum -a 256 "$PLUGIN/$rel" | cut -d' ' -f1)" >> "$BACKUP/manifest.txt"
done
for f in BalsamiqSans-Regular.ttf BalsamiqSans-Bold.ttf Pangolin-Regular.ttf; do
  if [ -f "$PLUGIN/assets/fonts/$f" ]; then
    cp -p "$PLUGIN/assets/fonts/$f" "$BACKUP/fonts/$f"
    printf 'R\t%s\n' "$f" >> "$BACKUP/fonts.txt"
  else
    printf 'A\t%s\n' "$f" >> "$BACKUP/fonts.txt"
  fi
done
{
  echo "plugin=$PLUGIN"
  echo "created=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "version=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("version",""))' "$PLUGIN/package.json")"
} > "$BACKUP/meta.txt"

mkdir -p "$PLUGIN/assets/fonts"
for f in BalsamiqSans-Regular.ttf BalsamiqSans-Bold.ttf Pangolin-Regular.ttf; do
  cp "$FONT_DIR/$f" "$PLUGIN/assets/fonts/$f"
done
say "✓ шрифты скопированы в assets/fonts/"

if ! python3 "$HERE/tools/patch-font.py" --plugin "$PLUGIN"; then
  say "✗ патч не применился — возвращаю файлы из бэкапа" >&2
  "$HERE/rollback-font.sh" --plugin "$PLUGIN" --backup "$BACKUP" >/dev/null || true
  exit 1
fi

say "→ node --check"
for rel in lib/client.js runtime/electron-helper/shared-core.js runtime/electron-helper/renderer.js; do
  node --check "$PLUGIN/$rel" || { say "✗ синтаксис $rel — откат" >&2; "$HERE/rollback-font.sh" --plugin "$PLUGIN" --backup "$BACKUP"; exit 1; }
done
say "✓ node --check: 3 файла OK"

if ! python3 "$HERE/tools/patch-font.py" --plugin "$PLUGIN" --check; then
  say "✗ проверка после патча не прошла — откат" >&2
  "$HERE/rollback-font.sh" --plugin "$PLUGIN" --backup "$BACKUP"
  exit 1
fi

say ""
say "Готово. Откат: $HERE/rollback-font.sh --plugin \"$PLUGIN\""
say "Обновите страницу DSH или перезапустите приложение — шрифт подхватится."
