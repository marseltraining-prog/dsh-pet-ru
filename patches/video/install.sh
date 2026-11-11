#!/usr/bin/env bash
# install.sh — два переведённых видео-клипа dsh-pet (вшитые облачка с текстом).
#
#   ./install.sh                     # в $PET_HOME (по умолчанию ~/.dsh/dsh-pet)
#   ./install.sh --pet-home DIR      # другой профиль / песочница
#   ./install.sh --check             # только проверить, ничего не писать
#   ./install.sh --dry-run           # показать план
#
# Что делает: кладёт «Ну и что поесть.webm» и «Раздумывает вслух.webm» в
# <PET_HOME>/main-animation/webm/ (имена совпадают с config/main-config.jsonc),
# предварительно сохранив старые версии в backups/video/<время>/.
# Идемпотентен: если файлы совпадают побайтово — ничего не делает.
# Оригиналы в node_modules плагина не трогаются. DSH не перезапускается.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
SRC="$ROOT/assets/video"
PET_HOME="${PET_HOME:-$HOME/.dsh/dsh-pet}"
DEST=""
BACKUP_ROOT="$ROOT/backups/video"
MODE=apply

CLIPS=("Ну и что поесть.webm" "Раздумывает вслух.webm")

say()  { printf '%s\n' "$*"; }
fail() { printf 'ОШИБКА: %s\n' "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --pet-home) shift; PET_HOME="${1:?--pet-home требует значение}" ;;
    --check) MODE=check ;;
    --dry-run) MODE=dry ;;
    -h|--help) sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "неизвестный аргумент: $1" >&2; exit 2 ;;
  esac
  shift
done
PET_HOME="${PET_HOME/#\~/$HOME}"
DEST="$PET_HOME/main-animation/webm"

sha() {
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | cut -d' ' -f1
  else sha256sum "$1" | cut -d' ' -f1; fi
}

[ -d "$SRC" ] || fail "нет каталога с клипами: $SRC"
for c in "${CLIPS[@]}"; do
  [ -s "$SRC/$c" ] || fail "нет файла: $SRC/$c"
done

say "клипы : $SRC"
say "профиль: $PET_HOME"

if [ "$MODE" = "check" ]; then
  bad=0
  for c in "${CLIPS[@]}"; do
    if [ ! -f "$DEST/$c" ]; then
      say "  FAIL нет $DEST/$c"; bad=1
    elif [ "$(sha "$SRC/$c")" != "$(sha "$DEST/$c")" ]; then
      say "  FAIL $c отличается от версии в проекте"; bad=1
    else
      say "  OK   $c"
    fi
  done
  [ "$bad" -eq 0 ] && say "ИТОГ: оба клипа установлены" || { say "ИТОГ: не установлено"; exit 1; }
  exit 0
fi

if [ "$MODE" = "dry" ]; then
  for c in "${CLIPS[@]}"; do
    if [ -f "$DEST/$c" ] && [ "$(sha "$SRC/$c")" = "$(sha "$DEST/$c")" ]; then
      say "[dry-run] $c уже на месте"
    else
      say "[dry-run] cp '$c' → $DEST/$c"
    fi
  done
  say "[dry-run] бэкап: $BACKUP_ROOT/<время>/"
  exit 0
fi

[ -d "$PET_HOME" ] || fail "нет профиля питомца: $PET_HOME (сначала установите dsh-pet)"

mkdir -p "$DEST"
TS="$(date +%Y%m%d-%H%M%S)"
BK="$BACKUP_ROOT/$TS"
changed=0
same=0
for c in "${CLIPS[@]}"; do
  if [ -f "$DEST/$c" ] && [ "$(sha "$SRC/$c")" = "$(sha "$DEST/$c")" ]; then
    same=$((same + 1))
    continue
  fi
  if [ -f "$DEST/$c" ]; then
    mkdir -p "$BK"
    cp -p "$DEST/$c" "$BK/$c"
  fi
  cp -f "$SRC/$c" "$DEST/$c"
  changed=$((changed + 1))
done

if [ "$changed" -eq 0 ]; then
  say "уже установлено: $same из ${#CLIPS[@]} клипов совпадают — ничего не меняю"
  exit 0
fi

say "скопировано: $changed, уже было: $same"
[ -d "$BK" ] && say "бэкап старых версий: $BK"

# Проверка: файлы на месте и не пустые; ffprobe (если есть) — длительность и размер кадра.
for c in "${CLIPS[@]}"; do
  [ -s "$DEST/$c" ] || fail "после копирования нет файла: $DEST/$c"
  if command -v ffprobe >/dev/null 2>&1; then
    info="$(ffprobe -v error -select_streams v:0 \
      -show_entries stream=width,height,pix_fmt -show_entries format=duration \
      -of default=noprint_wrappers=1 "$DEST/$c" | tr '\n' ' ')"
    say "  $c: $info"
  fi
done

say ""
say "Готово. Откат: $HERE/rollback.sh"
say "Перезапустите DSH (или обновите страницу), чтобы клипы подхватились."
