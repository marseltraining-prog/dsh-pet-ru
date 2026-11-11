#!/usr/bin/env bash
# apply-memes.sh — установка русских мемов в dsh-pet с бэкапом и проверками.
#
#   ./apply-memes.sh                     # в $PET_HOME (по умолчанию ~/.dsh/dsh-pet)
#   PET_HOME=/tmp/pet ./apply-memes.sh   # песочница / другой профиль
#   ./apply-memes.sh --dry-run           # показать, что будет сделано
#   ./apply-memes.sh --no-backup         # без бэкапа (не рекомендуется)
#   ./apply-memes.sh --src DIR           # взять PNG из другой папки
#
# Идемпотентен: если все 27 файлов уже совпадают побайтово — ничего не делает.
# Откат: ./rollback-memes.sh [--list | --to DIR]

set -euo pipefail

SELF_DIR=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$SELF_DIR/../.." && pwd)
SRC="$ROOT/assets/memes"
PET_HOME="${PET_HOME:-$HOME/.dsh/dsh-pet}"
DEST="$PET_HOME/memes"
BACKUP_ROOT="$ROOT/backups/memes"
EXPECTED=27
W=384
H=384

DRY=0
DO_BACKUP=1
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --no-backup) DO_BACKUP=0 ;;
    --src) shift; SRC="$1" ;;
    --pet-home) shift; PET_HOME="$1" ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "неизвестный аргумент: $1" >&2; exit 2 ;;
  esac
  shift
done
PET_HOME="${PET_HOME/#\~/$HOME}"
DEST="$PET_HOME/memes"

say() { printf '%s\n' "$*"; }
die() { printf 'ОШИБКА: %s\n' "$*" >&2; exit 1; }

sha() { shasum -a 256 "$1" | awk '{print $1}'; }

dims() { # печатает "WxH"
  sips -g pixelWidth -g pixelHeight "$1" 2>/dev/null \
    | awk '/pixelWidth/{w=$2} /pixelHeight/{h=$2} END{print w"x"h}'
}

# ---------------------------------------------------------------- проверки источника
[ -d "$SRC" ] || die "нет папки с новыми мемами: $SRC"
[ -d "$PET_HOME" ] || die "нет профиля питомца: $PET_HOME (ожидается \$PET_HOME/memes)"

COUNT=$(find "$SRC" -maxdepth 1 -name '*.png' -type f ! -name 'contact-sheet.png' | wc -l | tr -d ' ')
[ "$COUNT" -eq "$EXPECTED" ] || die "в $SRC $COUNT PNG, ожидалось $EXPECTED"

say "источник : $SRC ($COUNT файлов)"
say "профиль  : $PET_HOME"
say "цель     : $DEST"

# список имён (по источнику)
NAMES_FILE=$(mktemp)
trap 'rm -f "$NAMES_FILE"' EXIT
find "$SRC" -maxdepth 1 -name '*.png' -type f ! -name 'contact-sheet.png' -exec basename {} \; | LC_ALL=C sort > "$NAMES_FILE"

# размеры и читаемость каждого нового файла
while IFS= read -r n; do
  d=$(dims "$SRC/$n")
  [ "$d" = "${W}x${H}" ] || die "«$n» имеет размер $d, ожидалось ${W}x${H}"
done < "$NAMES_FILE"

if [ "$DRY" -eq 1 ]; then
  say ""
  say "[dry-run] бэкап: $BACKUP_ROOT/<timestamp>/"
  say "[dry-run] копирование $COUNT файлов в $DEST"
  exit 0
fi

mkdir -p "$DEST"

# ---------------------------------------------------------------- идемпотентность
SAME=1
MISSING=0
while IFS= read -r n; do
  if [ ! -f "$DEST/$n" ]; then MISSING=$((MISSING+1)); SAME=0; continue; fi
  [ "$(sha "$SRC/$n")" = "$(sha "$DEST/$n")" ] || SAME=0
done < "$NAMES_FILE"

if [ "$SAME" -eq 1 ] && [ "$MISSING" -eq 0 ]; then
  say ""
  say "Уже установлено: все $EXPECTED файлов совпадают побайтово. Ничего не меняю."
  exit 0
fi

# ---------------------------------------------------------------- бэкап
TS=$(date +%Y%m%d-%H%M%S)
BK="$BACKUP_ROOT/$TS"
if [ "$DO_BACKUP" -eq 1 ]; then
  mkdir -p "$BK"
  OLD=$(find "$DEST" -maxdepth 1 -name '*.png' -type f | wc -l | tr -d ' ')
  if [ "$OLD" -gt 0 ]; then
    cp -p "$DEST"/*.png "$BK"/ 2>/dev/null || true
    ( cd "$BK" && shasum -a 256 *.png > MANIFEST.sha256 )
    say "бэкап    : $BK ($OLD файлов)"
  else
    : > "$BK/EMPTY"
    say "бэкап    : папка была пуста ($BK)"
  fi
  printf '%s\n' "$TS" > "$BACKUP_ROOT/last"
else
  say "бэкап    : пропущен (--no-backup)"
fi

# ---------------------------------------------------------------- копирование
while IFS= read -r n; do
  cp -f "$SRC/$n" "$DEST/$n"
done < "$NAMES_FILE"

# ---------------------------------------------------------------- проверка
BAD=0
NEW=$(find "$DEST" -maxdepth 1 -name '*.png' -type f | wc -l | tr -d ' ')
[ "$NEW" -eq "$EXPECTED" ] || { say "ВНИМАНИЕ: в $DEST теперь $NEW PNG (ожидалось $EXPECTED)"; BAD=1; }

while IFS= read -r n; do
  [ -f "$DEST/$n" ] || { say "нет файла: $n"; BAD=1; continue; }
  d=$(dims "$DEST/$n")
  [ "$d" = "${W}x${H}" ] || { say "размер «$n» = $d"; BAD=1; }
  [ "$(sha "$SRC/$n")" = "$(sha "$DEST/$n")" ] || { say "хеш не совпал: $n"; BAD=1; }
done < "$NAMES_FILE"

if [ "$BAD" -ne 0 ]; then
  die "проверка не прошла. Откат: ./rollback-memes.sh --to ${BK:-<нет>}"
fi

TOTAL=$(du -sk "$DEST" | awk '{print $1}')
say ""
say "Готово: $EXPECTED мемов установлены в $DEST (${TOTAL} КБ)."
if [ "$DO_BACKUP" -eq 1 ] && [ -d "$BK" ]; then
  say "Бэкап  : $BK"
  say "Откат  : ./rollback-memes.sh           (последний бэкап)"
  say "         ./rollback-memes.sh --to \"$BK\""
fi
