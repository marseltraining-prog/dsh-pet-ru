#!/usr/bin/env bash
# rollback-mute-menu.sh — откат патча меню звука dsh-pet.
#
#   ./rollback-mute-menu.sh                 # последний бэкап
#   ./rollback-mute-menu.sh --list          # список бэкапов
#   ./rollback-mute-menu.sh --backup DIR    # конкретный бэкап
#   ./rollback-mute-menu.sh --plugin DIR    # другой профиль / песочница
#
# Возвращает пять пропатченных файлов и удаляет созданный lib/voice-mute.js.
# Ничего не перезапускает.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PLUGIN="${DSH_PET_PLUGIN:-$HOME/.dsh/profiles/desktop/node_modules/dsh-pet}"
BACKUP=""
LIST=0

while [ $# -gt 0 ]; do
  case "$1" in
    --plugin) PLUGIN="$2"; shift 2 ;;
    --plugin=*) PLUGIN="${1#*=}"; shift ;;
    --backup) BACKUP="$2"; shift 2 ;;
    --backup=*) BACKUP="${1#*=}"; shift ;;
    --list) LIST=1; shift ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "неизвестный аргумент: $1" >&2; exit 2 ;;
  esac
done
PLUGIN="${PLUGIN/#\~/$HOME}"

say()  { printf '%s\n' "$*"; }
fail() { printf '✗ %s\n' "$*" >&2; exit 1; }

if [ "$LIST" -eq 1 ]; then
  [ -d "$HERE/backup" ] || { say "бэкапов нет"; exit 0; }
  for d in "$HERE"/backup/*/; do
    [ -f "$d/meta.txt" ] || continue
    ts="$(basename "$d")"
    ver="$(sed -n 's/^version=//p' "$d/meta.txt")"
    say "$ts  dsh-pet $ver"
  done
  exit 0
fi

[ -d "$PLUGIN" ] || fail "нет каталога плагина: $PLUGIN"
PLUGIN="$(cd "$PLUGIN" && pwd -P)"

if [ -z "$BACKUP" ]; then
  BACKUP="$(ls -1d "$ROOT"/backups/menu-mute/*/ 2>/dev/null | sort | tail -1 || true)"
  [ -n "$BACKUP" ] || fail "бэкапов нет: $HERE/backup"
fi
BACKUP="${BACKUP%/}"
[ -f "$BACKUP/manifest.txt" ] || fail "нет manifest.txt в $BACKUP"

say "плагин: $PLUGIN"
say "бэкап:  $BACKUP"

while IFS=$'\t' read -r kind rel hash; do
  [ -n "${rel:-}" ] || continue
  case "$rel" in
    /*|*..*) fail "подозрительный путь в manifest: $rel" ;;
  esac
  case "$kind" in
    F)
      [ -f "$BACKUP/files/$rel" ] || fail "в бэкапе нет $rel"
      mkdir -p "$PLUGIN/$(dirname "$rel")"
      cp -p "$BACKUP/files/$rel" "$PLUGIN/$rel"
      say "✓ восстановлен $rel"
      ;;
    A)
      if [ -f "$PLUGIN/$rel" ]; then
        rm -f "$PLUGIN/$rel"
        say "✓ удалён созданный $rel"
      else
        say "· $rel уже отсутствует"
      fi
      ;;
    *) fail "неизвестная запись manifest: $kind $rel" ;;
  esac
done < "$BACKUP/manifest.txt"

# Контроль целостности: восстановленные файлы должны совпасть с хэшами из manifest.
bad=0
while IFS=$'\t' read -r kind rel hash; do
  [ "$kind" = F ] || continue
  [ -n "${rel:-}" ] || continue
  if command -v shasum >/dev/null 2>&1; then
    now="$(shasum -a 256 "$PLUGIN/$rel" | cut -d' ' -f1)"
  else
    now="$(sha256sum "$PLUGIN/$rel" | cut -d' ' -f1)"
  fi
  if [ "$now" != "$hash" ]; then
    say "✗ $rel: хэш не совпал после отката"
    bad=1
  fi
done < "$BACKUP/manifest.txt"
[ "$bad" -eq 0 ] || fail "откат неполный"

say ""
say "✓ откат завершён. Обновите страницу DSH (web) или перезапустите desktop-окно вручную."
