#!/usr/bin/env bash
# rollback-font.sh — откат шрифта/метрик бабла dsh-pet к бэкапу apply-font.sh.
#
#   ./rollback-font.sh                      # последний бэкап, профиль по умолчанию
#   ./rollback-font.sh --plugin DIR         # песочница / другой профиль
#   ./rollback-font.sh --backup backup/...  # конкретный бэкап
#   ./rollback-font.sh --list               # список бэкапов
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PLUGIN="${DSH_PET_PLUGIN:-$HOME/.dsh/profiles/desktop/node_modules/dsh-pet}"
BACKUP=""

while [ $# -gt 0 ]; do
  case "$1" in
    --plugin) PLUGIN="$2"; shift 2 ;;
    --plugin=*) PLUGIN="${1#*=}"; shift ;;
    --backup) BACKUP="$2"; shift 2 ;;
    --backup=*) BACKUP="${1#*=}"; shift ;;
    --list)
      [ -d "$ROOT/backups/font" ] || { echo "бэкапов нет"; exit 0; }
      for d in "$ROOT"/backups/font/*/; do
        [ -f "$d/meta.txt" ] || continue
        printf '%s  %s\n' "$(basename "$d")" "$(sed -n 's/^plugin=//p' "$d/meta.txt")"
      done
      exit 0 ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "неизвестный аргумент: $1" >&2; exit 2 ;;
  esac
done
PLUGIN="${PLUGIN/#\~/$HOME}"

say()  { printf '%s\n' "$*"; }
fail() { printf '✗ %s\n' "$*" >&2; exit 1; }

[ -d "$PLUGIN" ] || fail "нет каталога плагина: $PLUGIN"

if [ -z "$BACKUP" ]; then
  BACKUP="$(ls -1d "$ROOT"/backups/font/*/ 2>/dev/null | sort | tail -1 || true)"
  [ -n "$BACKUP" ] || fail "бэкапов нет — нечего откатывать"
fi
BACKUP="${BACKUP%/}"
[ -f "$BACKUP/manifest.txt" ] || fail "в бэкапе нет manifest.txt: $BACKUP"

say "откат: $BACKUP"
say "плагин: $PLUGIN"

while IFS=$'\t' read -r kind rel sum; do
  [ "$kind" = "F" ] || continue
  src="$BACKUP/files/$rel"
  [ -f "$src" ] || fail "нет файла в бэкапе: $src"
  mkdir -p "$PLUGIN/$(dirname "$rel")"
  cp -p "$src" "$PLUGIN/$rel"
  got="$(shasum -a 256 "$PLUGIN/$rel" | cut -d' ' -f1)"
  [ "$got" = "$sum" ] || fail "sha256 не совпал после восстановления: $rel"
  say "✓ восстановлен $rel"
done < "$BACKUP/manifest.txt"

if [ -f "$BACKUP/fonts.txt" ]; then
  while IFS=$'\t' read -r kind f; do
    case "$kind" in
      A) rm -f "$PLUGIN/assets/fonts/$f"; say "✓ удалён добавленный assets/fonts/$f" ;;
      R) cp -p "$BACKUP/fonts/$f" "$PLUGIN/assets/fonts/$f"; say "✓ восстановлен assets/fonts/$f" ;;
    esac
  done < "$BACKUP/fonts.txt"
fi

say ""
say "Откат выполнен. Проверка: $HERE/apply-font.sh --check --plugin \"$PLUGIN\" (должна сказать, что патч НЕ применён)."
say "Обновите страницу DSH / перезапустите приложение."
