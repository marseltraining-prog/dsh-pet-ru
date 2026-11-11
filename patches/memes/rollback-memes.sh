#!/usr/bin/env bash
# rollback-memes.sh — откат мемов dsh-pet к состоянию из бэкапа apply-memes.sh.
#
#   ./rollback-memes.sh                 # последний бэкап
#   ./rollback-memes.sh --list          # список бэкапов
#   ./rollback-memes.sh --to backup/TS  # конкретный бэкап
#   PET_HOME=/tmp/pet ./rollback-memes.sh
#   ./rollback-memes.sh --dry-run
#
# Восстанавливает ровно те файлы, что лежат в бэкапе (обычно 27 PNG),
# сверяет sha256 с MANIFEST.sha256 и печатает результат.

set -euo pipefail

SELF_DIR=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$SELF_DIR/../.." && pwd)
PET_HOME="${PET_HOME:-$HOME/.dsh/dsh-pet}"
DEST="$PET_HOME/memes"
BACKUP_ROOT="$ROOT/backups/memes"

BK=""
DRY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --list)
      if [ -d "$BACKUP_ROOT" ]; then
        for d in "$BACKUP_ROOT"/*/; do
          [ -d "$d" ] || continue
          n=$(find "$d" -maxdepth 1 -name '*.png' -type f | wc -l | tr -d ' ')
          printf '%s  (%s png)\n' "$(basename "$d")" "$n"
        done
      else
        echo "бэкапов нет: $BACKUP_ROOT"
      fi
      exit 0 ;;
    --to) shift; BK="$1" ;;
    --pet-home) shift; PET_HOME="$1"; DEST="$PET_HOME/memes" ;;
    --dry-run) DRY=1 ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "неизвестный аргумент: $1" >&2; exit 2 ;;
  esac
  shift
done

say() { printf '%s\n' "$*"; }
die() { printf 'ОШИБКА: %s\n' "$*" >&2; exit 1; }
sha() { shasum -a 256 "$1" | awk '{print $1}'; }

if [ -z "$BK" ]; then
  # 1) marker last, 2) иначе самый свежий по имени каталог
  if [ -f "$BACKUP_ROOT/last" ]; then
    BK="$BACKUP_ROOT/$(cat "$BACKUP_ROOT/last")"
  fi
  if [ ! -d "$BK" ]; then
    BK=$(ls -1d "$BACKUP_ROOT"/*/ 2>/dev/null | LC_ALL=C sort | tail -1 || true)
  fi
fi

[ -n "$BK" ] && [ -d "$BK" ] || die "не найден бэкап (см. --list)"
[ -d "$PET_HOME" ] || die "нет профиля питомца: $PET_HOME"

N=$(find "$BK" -maxdepth 1 -name '*.png' -type f | wc -l | tr -d ' ')
say "бэкап    : $BK ($N файлов)"
say "восстановление в: $DEST"

if [ "$N" -eq 0 ]; then
  if [ -f "$BK/EMPTY" ]; then
    say "В бэкапе нет PNG (папка была пуста) — восстанавливать нечего."
    exit 0
  fi
  die "в бэкапе нет PNG"
fi

if [ "$DRY" -eq 1 ]; then
  say "[dry-run] скопировал бы $N файлов"
  exit 0
fi

mkdir -p "$DEST"
find "$BK" -maxdepth 1 -name '*.png' -type f -exec cp -f {} "$DEST"/ \;

BAD=0
if [ -f "$BK/MANIFEST.sha256" ]; then
  while read -r want name; do
    [ -n "${name:-}" ] || continue
    f="$DEST/$name"
    [ -f "$f" ] || { say "нет файла после отката: $name"; BAD=1; continue; }
    got=$(sha "$f")
    [ "$got" = "$want" ] || { say "хеш не совпал: $name"; BAD=1; }
  done < "$BK/MANIFEST.sha256"
else
  say "ВНИМАНИЕ: в бэкапе нет MANIFEST.sha256 — сверка по количеству."
fi

NOW=$(find "$DEST" -maxdepth 1 -name '*.png' -type f | wc -l | tr -d ' ')
say ""
if [ "$BAD" -ne 0 ]; then
  die "откат выполнен с ошибками (файлов сейчас: $NOW)"
fi
say "Откат выполнен: $N файлов восстановлены (в папке сейчас $NOW PNG)."
