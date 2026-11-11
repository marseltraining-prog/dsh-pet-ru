#!/usr/bin/env bash
# rollback.sh — вернуть два видео-клипа к версиям из последнего бэкапа install.sh.
#
#   ./rollback.sh                 # последний бэкап
#   ./rollback.sh --list          # список бэкапов
#   ./rollback.sh --to DIR        # конкретный бэкап
#   ./rollback.sh --dry-run
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PET_HOME="${PET_HOME:-$HOME/.dsh/dsh-pet}"
DEST="$PET_HOME/main-animation/webm"
BACKUP_ROOT="$ROOT/backups/video"

BK=""
DRY=0
say()  { printf '%s\n' "$*"; }
fail() { printf 'ОШИБКА: %s\n' "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --list)
      [ -d "$BACKUP_ROOT" ] || { echo "бэкапов нет: $BACKUP_ROOT"; exit 0; }
      for d in "$BACKUP_ROOT"/*/; do
        [ -d "$d" ] || continue
        printf '%s  (%s файлов)\n' "$(basename "$d")" "$(find "$d" -maxdepth 1 -name '*.webm' | wc -l | tr -d ' ')"
      done
      exit 0 ;;
    --to) shift; BK="${1:?--to требует значение}" ;;
    --dry-run) DRY=1 ;;
    -h|--help) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "неизвестный аргумент: $1" >&2; exit 2 ;;
  esac
  shift
done

if [ -z "$BK" ]; then
  BK="$(ls -1d "$BACKUP_ROOT"/*/ 2>/dev/null | sort | tail -1 || true)"
fi
[ -n "$BK" ] && [ -d "$BK" ] || fail "не найден бэкап (см. --list)"
[ -d "$DEST" ] || fail "нет каталога клипов: $DEST"

N=$(find "$BK" -maxdepth 1 -name '*.webm' -type f | wc -l | tr -d ' ')
say "бэкап: $BK ($N файлов)"
if [ "$DRY" -eq 1 ]; then
  say "[dry-run] вернул бы $N файлов в $DEST"
  exit 0
fi

find "$BK" -maxdepth 1 -name '*.webm' -type f -exec cp -f {} "$DEST"/ \;
say "восстановлено файлов: $N"
say "Перезапустите DSH, чтобы вернулись прежние клипы."
