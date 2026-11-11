#!/bin/bash
# =============================================================================
# Откат русской локализации dsh-pet к состоянию из бэкапа.
#
#   ./rollback.sh                     откатить последний бэкап
#   ./rollback.sh --backup DIR        откатить конкретный backup/<время>
#   ./rollback.sh --list              показать доступные бэкапы
#   ./rollback.sh --yes               без подтверждения
#
# Что делает:
#   • возвращает lib/client.js и lib/index.js из <backup>/lib/*.orig;
#   • возвращает <PET_HOME>/main-config.jsonc (или удаляет его, если до установки
#     файла не было);
#   • удаляет файлы анимаций и мемов, созданные установкой (список в manifest.txt).
# Файлы, которые уже были у пользователя, не трогаются: их нет в манифесте.
# DSH не перезапускается — после отката перезапустите приложение вручную.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

PET_PROFILE="${PET_PROFILE:-$HOME/.dsh/profiles/desktop}"
PET_PLUGIN="${PET_PLUGIN:-$PET_PROFILE/node_modules/dsh-pet}"
PET_HOME="${PET_HOME:-$HOME/.dsh/dsh-pet}"

BACKUP_ROOT="${PET_BACKUP_ROOT:-$ROOT/backups/localization}"
BACKUP_DIR=""
ASSUME_YES=0

say()  { printf '%s\n' "$*"; }
step() { printf '\n== %s\n' "$*"; }
warn() { printf 'ВНИМАНИЕ: %s\n' "$*" >&2; }
die()  { printf 'ОШИБКА: %s\n' "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --backup) shift; BACKUP_DIR="${1:?--backup требует значение}" ;;
    --pet-home) shift; PET_HOME="${1:?--pet-home требует значение}" ;;
    --plugin) shift; PET_PLUGIN="${1:?--plugin требует значение}" ;;
    --profile) shift; PET_PROFILE="${1:?--profile требует значение}"; PET_PLUGIN="$PET_PROFILE/node_modules/dsh-pet" ;;
    --yes|-y) ASSUME_YES=1 ;;
    --list)
      say "доступные бэкапы:"
      for d in "$BACKUP_ROOT"/*/; do
        if [ -d "$d" ]; then say "  $(basename "$d")"; fi
      done
      exit 0 ;;
    -h|--help) sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "неизвестный аргумент: $1" >&2; exit 2 ;;
  esac
  shift
done

if [ -z "$BACKUP_DIR" ]; then
  # последний по времени
  BACKUP_DIR="$(ls -1dt "$BACKUP_ROOT"/*/ 2>/dev/null | head -1 | sed 's:/$::' || true)"
fi
[ -n "${BACKUP_DIR:-}" ] && [ -d "$BACKUP_DIR" ] || die "не найден каталог бэкапа (запускали apply.sh?)"

say "плагин: $PET_PLUGIN"
say "данные: $PET_HOME"
say "бэкап:  $BACKUP_DIR"

if [ "$ASSUME_YES" -ne 1 ]; then
  printf 'Откатить изменения к этому бэкапу? [y/N] '
  read -r answer || answer=""
  case "$answer" in
    y|Y|yes|YES) ;;
    *) say "отменено"; exit 0 ;;
  esac
fi

step "Возврат бандлов"
if [ -f "$BACKUP_DIR/bundles/index.tsv" ]; then
  # патчер кладёт сюда все пропатченные файлы: lib/*.js и runtime/electron-helper/*
  while IFS=$'\t' read -r rel orig; do
    [ -n "$rel" ] || continue
    src="$BACKUP_DIR/bundles/$orig"
    dst="$PET_PLUGIN/$rel"
    if [ ! -f "$src" ]; then
      warn "в бэкапе нет $orig — пропуск"
      continue
    fi
    if [ ! -f "$dst" ]; then
      warn "нет целевого $dst — пропуск"
      continue
    fi
    if cmp -s "$src" "$dst"; then
      say "$rel уже совпадает с бэкапом"
    else
      cp -p "$src" "$dst"
      say "$rel восстановлен"
    fi
  done < "$BACKUP_DIR/bundles/index.tsv"
else
  # старый формат бэкапа (только lib)
  for pair in "client.js" "index.js"; do
    orig="$BACKUP_DIR/lib/$pair.orig"
    dst="$PET_PLUGIN/lib/$pair"
    if [ ! -f "$orig" ]; then
      warn "в бэкапе нет $pair.orig — пропуск"
      continue
    fi
    [ -f "$dst" ] || { warn "нет целевого $dst — пропуск"; continue; }
    if cmp -s "$orig" "$dst"; then
      say "$pair уже совпадает с бэкапом"
    else
      cp -p "$orig" "$dst"
      say "$pair восстановлен"
    fi
  done
fi

step "Возврат конфигурации"
cfg_dst="$PET_HOME/main-config.jsonc"
cfg_bak="$BACKUP_DIR/pet-home/main-config.jsonc"
if [ -f "$cfg_bak" ]; then
  cp -p "$cfg_bak" "$cfg_dst"
  say "main-config.jsonc восстановлен из бэкапа"
elif [ -f "$cfg_dst" ]; then
  rm -f "$cfg_dst"
  say "main-config.jsonc удалён (до установки его не было)"
else
  say "main-config.jsonc отсутствует и в бэкапе, и на месте — ничего не делаем"
fi

step "Удаление созданных ассетов"
removed=0
if [ -f "$BACKUP_DIR/manifest.txt" ]; then
  while IFS= read -r path; do
    [ -n "$path" ] || continue
    case "$path" in
      "$cfg_dst") continue ;;  # конфиг обработан выше
    esac
    # страховка: удаляем только внутри каталога данных питомца
    case "$path" in
      "$PET_HOME"/*) ;;
      *) warn "пропуск пути вне $PET_HOME: $path"; continue ;;
    esac
    if [ -f "$path" ]; then
      rm -f "$path"
      removed=$((removed + 1))
    fi
  done < "$BACKUP_DIR/manifest.txt"
  say "удалено файлов: $removed"
else
  warn "в бэкапе нет manifest.txt — ассеты не удалялись"
fi

step "Готово"
say "Откат выполнен. Перезапустите DSH, чтобы вернулся прежний вид питомца."
