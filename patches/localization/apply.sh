#!/bin/bash
# =============================================================================
# dsh-pet 0.4.7 → русская версия: установка одной командой (macOS, bash 3.2+)
#
#   ./apply.sh                 установить (с бэкапом)
#   ./apply.sh --check         ничего не менять, только проверить установку
#   ./apply.sh --dry-run       показать, что будет сделано
#   ./apply.sh --yes           без подтверждения (для автоматизации)
#   ./apply.sh --pet-home DIR  другой каталог данных (по умолчанию ~/.dsh/dsh-pet)
#   ./apply.sh --plugin DIR    другой каталог плагина
#   ./apply.sh --name "Имя"    имя питомца (по умолчанию — текущее из конфига, иначе «Бетси»)
#
# Что делает:
#   1) бэкап lib/client.js, lib/index.js и ~/.dsh/dsh-pet в backup/<время>/;
#   2) копирует assets/webm/*.webm из плагина в <PET_HOME>/main-animation/webm/
#      под русскими именами и 27 PNG из <project>/assets/memes в <PET_HOME>/memes/
#      (config ссылается на русские имена файлов);
#   3) пишет config/main-config.jsonc в <PET_HOME>/main-config.jsonc;
#   4) идемпотентно патчит подписи меню/уведомлений в lib/client.js и lib/index.js;
#   5) проверяет результат (JSON, файлы, отсутствие китайских подписей).
#
# Не перезапускает DSH и не трогает работающее приложение: изменения подхватятся
# после перезапуска приложения (см. README.md).
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

PET_PROFILE="${PET_PROFILE:-$HOME/.dsh/profiles/desktop}"
PET_PLUGIN="${PET_PLUGIN:-$PET_PROFILE/node_modules/dsh-pet}"
PET_HOME="${PET_HOME:-$HOME/.dsh/dsh-pet}"

MODE="apply"
ASSUME_YES=0
NAME_ARG=""

usage() {
  sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

while [ $# -gt 0 ]; do
  case "$1" in
    --check) MODE="check" ;;
    --dry-run) MODE="dry-run" ;;
    --yes|-y) ASSUME_YES=1 ;;
    --pet-home) shift; PET_HOME="${1:?--pet-home требует значение}" ;;
    --plugin) shift; PET_PLUGIN="${1:?--plugin требует значение}" ;;
    --profile) shift; PET_PROFILE="${1:?--profile требует значение}"; PET_PLUGIN="$PET_PROFILE/node_modules/dsh-pet" ;;
    --name) shift; NAME_ARG="${1:?--name требует значение}" ;;
    -h|--help) usage; exit 0 ;;
    *) echo "неизвестный аргумент: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

TS="$(date +%Y%m%d-%H%M%S)"
BACKUP_ROOT="${PET_BACKUP_ROOT:-$ROOT/backups/localization}"
BACKUP_DIR="$BACKUP_ROOT/$TS"
# два запуска в одну секунду не должны затирать бэкап друг друга
n=1
while [ -e "$BACKUP_DIR" ]; do
  BACKUP_DIR="$BACKUP_ROOT/$TS-$n"
  n=$((n + 1))
done
CLIENT_JS="$PET_PLUGIN/lib/client.js"
INDEX_JS="$PET_PLUGIN/lib/index.js"
CFG_TEMPLATE="$ROOT/config/main-config.jsonc"
ANIM_MAP="$SCRIPT_DIR/data/anim-map.tsv"
MEME_MAP="$SCRIPT_DIR/data/meme-map.tsv"
MEME_SRC="$ROOT/assets/memes"
WEBM_DIR="$PET_HOME/main-animation/webm"
MEMES_DIR="$PET_HOME/memes"

say()  { printf '%s\n' "$*"; }
step() { printf '\n== %s\n' "$*"; }
warn() { printf 'ВНИМАНИЕ: %s\n' "$*" >&2; }
die()  { printf 'ОШИБКА: %s\n' "$*" >&2; exit 1; }

# --- 1. проверки окружения ---------------------------------------------------
step "Проверка путей"
say "плагин:  $PET_PLUGIN"
say "данные:  $PET_HOME"
[ -d "$PET_PLUGIN" ] || die "плагин не найден: $PET_PLUGIN (укажите --plugin)"
# Абсолютные пути: от них зависят симлинк assets в проверке слияния и manifest.txt.
PET_PLUGIN="$(cd "$PET_PLUGIN" && pwd -P)"
if [ -d "$PET_HOME" ]; then PET_HOME="$(cd "$PET_HOME" && pwd -P)"; fi
CLIENT_JS="$PET_PLUGIN/lib/client.js"
INDEX_JS="$PET_PLUGIN/lib/index.js"
WEBM_DIR="$PET_HOME/main-animation/webm"
MEMES_DIR="$PET_HOME/memes"
[ -f "$PET_PLUGIN/package.json" ] || die "это не каталог плагина dsh-pet: нет package.json"
[ -f "$CLIENT_JS" ] || die "нет $CLIENT_JS — установка плагина повреждена"
[ -f "$INDEX_JS" ] || die "нет $INDEX_JS — установка плагина повреждена"
[ -f "$PET_PLUGIN/assets/config.jsonc" ] || die "нет assets/config.jsonc в плагине"
[ -f "$CFG_TEMPLATE" ] || die "нет шаблона конфигурации: $CFG_TEMPLATE"
[ -f "$ANIM_MAP" ] || die "нет карты анимаций: $ANIM_MAP"
[ -f "$MEME_MAP" ] || die "нет карты мемов: $MEME_MAP"
command -v python3 >/dev/null 2>&1 || die "нужен python3 (входит в macOS Command Line Tools)"

PLUGIN_VERSION="$(python3 - "$PET_PLUGIN/package.json" <<'PY'
import json, sys
print(json.load(open(sys.argv[1], encoding='utf-8')).get('version', '?'))
PY
)"
say "версия плагина: $PLUGIN_VERSION (проверялась на 0.4.7)"
if [ "$PLUGIN_VERSION" != "0.4.7" ]; then
  warn "версия отличается от 0.4.7 — патчи могут не совпасть, скрипт остановится до записи"
fi


# Проверка слияния конфига НАСТОЯЩИМ кодом плагина (readAllConfig).
# Нужен node с type stripping и копия src плагина вне node_modules
# (Node не снимает типы с файлов внутри node_modules). Код 3 = проверить нельзя.
host_merge_check() {
  [ -d "$PET_PLUGIN/src/host/config" ] || { warn "в плагине нет src/ — проверка слияния пропущена"; return 3; }
  command -v node >/dev/null 2>&1 || { warn "node не найден — проверка слияния пропущена"; return 3; }
  local work="$SCRIPT_DIR/.cache/hostcheck"
  rm -rf "$work"
  mkdir -p "$work"
  cp -R "$PET_PLUGIN/src" "$work/src" 2>/dev/null || { warn "не удалось скопировать src — проверка слияния пропущена"; return 3; }
  ln -s "$PET_PLUGIN/assets" "$work/assets"
  set +e
  node "$SCRIPT_DIR/tools/check-host-merge.mjs" --plugin "$work" --pet-home "$PET_HOME"
  local rc=$?
  set -e
  if [ "$rc" -eq 0 ] || [ "$rc" -eq 3 ]; then
    [ "$rc" -eq 0 ] && rm -rf "$work"
  fi
  return "$rc"
}

if [ "$MODE" = "check" ]; then
  step "Только проверка (--check)"
  rc=0
  python3 "$SCRIPT_DIR/tools/validate.py" --plugin "$PET_PLUGIN" --pet-home "$PET_HOME" || rc=1
  step "Проверка слияния конфига кодом плагина"
  set +e
  host_merge_check
  mrc=$?
  set -e
  [ "$mrc" -eq 1 ] && rc=1
  exit "$rc"
fi

if [ "$ASSUME_YES" -ne 1 ] && [ "$MODE" != "dry-run" ]; then
  say ""
  printf 'Применить русскую локализацию к %s? [y/N] ' "$PET_PLUGIN"
  read -r answer || answer=""
  case "$answer" in
    y|Y|yes|YES) ;;
    *) say "отменено"; exit 0 ;;
  esac
fi

# --- 2. бэкап ----------------------------------------------------------------
step "Бэкап"
if [ "$MODE" = "dry-run" ]; then
  say "[dry-run] пропуск бэкапа"
else
  mkdir -p "$BACKUP_DIR/lib" "$BACKUP_DIR/pet-home"
  cp -p "$CLIENT_JS" "$BACKUP_DIR/lib/client.js.orig"
  cp -p "$INDEX_JS" "$BACKUP_DIR/lib/index.js.orig"
  if [ -d "$PET_HOME" ]; then
    # копируем данные целиком (конфиг, память диалога, задачи, уже лежащие ассеты)
    cp -R "$PET_HOME/." "$BACKUP_DIR/pet-home/" 2>/dev/null || warn "не удалось скопировать часть $PET_HOME"
  fi
  : > "$BACKUP_DIR/manifest.txt"
  {
    echo "timestamp=$TS"
    echo "plugin=$PET_PLUGIN"
    echo "pet_home=$PET_HOME"
    echo "plugin_version=$PLUGIN_VERSION"
  } > "$BACKUP_DIR/meta.txt"
  say "бэкап: $BACKUP_DIR"
fi

# --- 3. ассеты ---------------------------------------------------------------
step "Копирование анимаций"
[ "$MODE" = "dry-run" ] || mkdir -p "$WEBM_DIR"
copied_webm=0
skipped_webm=0
while IFS=$'\t' read -r pool old new; do
  case "$pool" in ''|\#*) continue ;; esac
  src="$PET_PLUGIN/assets/webm/$old.webm"
  dst="$WEBM_DIR/$new.webm"
  [ -f "$src" ] || die "нет исходного файла: $src"
  if [ -f "$dst" ]; then
    skipped_webm=$((skipped_webm + 1))
    continue
  fi
  if [ "$MODE" = "dry-run" ]; then
    say "[dry-run] cp '$old.webm' → '$new.webm'"
  else
    cp -p "$src" "$dst"
    printf '%s\n' "$dst" >> "$BACKUP_DIR/manifest.txt"
  fi
  copied_webm=$((copied_webm + 1))
done < "$ANIM_MAP"
say "webm: скопировано $copied_webm, уже было $skipped_webm"

step "Копирование мемов"
[ "$MODE" = "dry-run" ] || mkdir -p "$MEMES_DIR"
copied_png=0
skipped_png=0
while IFS=$'\t' read -r old new; do
  case "$old" in ''|\#*) continue ;; esac
  src="$MEME_SRC/$new.png"
  dst="$MEMES_DIR/$new.png"
  [ -f "$src" ] || die "нет исходного файла: $src"
  if [ -f "$dst" ]; then
    skipped_png=$((skipped_png + 1))
    continue
  fi
  if [ "$MODE" = "dry-run" ]; then
    say "[dry-run] cp '$old.png' → '$new.png'"
  else
    cp -p "$src" "$dst"
    printf '%s\n' "$dst" >> "$BACKUP_DIR/manifest.txt"
  fi
  copied_png=$((copied_png + 1))
done < "$MEME_MAP"
say "png: скопировано $copied_png, уже было $skipped_png"

# --- 4. конфигурация ---------------------------------------------------------
step "Запись main-config.jsonc"
cfg_dst="$PET_HOME/main-config.jsonc"
# Имя питомца: --name > имя из уже существующего конфига > «Китёнок».
# Так установка не переименовывает питомца, если пользователь назвал его по-своему.
NAME_TO_USE="$NAME_ARG"
if [ -z "$NAME_TO_USE" ] && [ -f "$cfg_dst" ]; then
  NAME_TO_USE="$(python3 "$SCRIPT_DIR/tools/read-name.py" "$cfg_dst" 2>/dev/null || true)"
  [ -n "$NAME_TO_USE" ] && say "текущее имя питомца: «${NAME_TO_USE}» — сохраняю"
fi
[ -n "$NAME_TO_USE" ] || NAME_TO_USE="Бетси"
say "имя в новом конфиге: «${NAME_TO_USE}»"
if [ "$MODE" = "dry-run" ]; then
  say "[dry-run] запись main-config.jsonc → $cfg_dst"
else
  mkdir -p "$PET_HOME"
  if [ "$NAME_TO_USE" = "Бетси" ] && [ -f "$cfg_dst" ] && cmp -s "$CFG_TEMPLATE" "$cfg_dst"; then
    say "конфиг уже актуален (содержимое совпадает)"
  else
    if [ ! -f "$cfg_dst" ]; then
      printf '%s\n' "$cfg_dst" >> "$BACKUP_DIR/manifest.txt"
    fi
    python3 "$SCRIPT_DIR/tools/write-config.py" "$CFG_TEMPLATE" "$cfg_dst" "$NAME_TO_USE"
    say "записан: $cfg_dst"
  fi
  printf 'pet_name=%s\n' "$NAME_TO_USE" >> "$BACKUP_DIR/meta.txt"
fi

# --- 5. патч бандлов ---------------------------------------------------------
step "Патч подписей интерфейса"
if [ "$MODE" = "dry-run" ]; then
  python3 "$SCRIPT_DIR/tools/patch-bundles.py" --plugin "$PET_PLUGIN" --dry-run
else
  python3 "$SCRIPT_DIR/tools/patch-bundles.py" --plugin "$PET_PLUGIN" --backup "$BACKUP_DIR"
fi

# --- 6. проверки -------------------------------------------------------------
if [ "$MODE" != "dry-run" ]; then
  step "Проверка синтаксиса бандлов"
  if command -v node >/dev/null 2>&1; then
    for f in "lib/client.js" "lib/index.js" \
             "runtime/electron-helper/shared-core.js" \
             "runtime/electron-helper/sprite/menu.js" \
             "runtime/electron-helper/sprite.js" \
             "runtime/electron-helper/main/tray.js" \
             "runtime/electron-helper/renderer.js"; do
      [ -f "$PET_PLUGIN/$f" ] || continue
      node --check "$PET_PLUGIN/$f" || die "$f не парсится после патча — откатитесь: ./rollback.sh"
    done
    say "node --check: все пропатченные JS разбираются"
  else
    warn "node не найден — проверка синтаксиса пропущена"
  fi
fi

if [ "$MODE" != "dry-run" ]; then
step "Итоговая проверка"
python3 "$SCRIPT_DIR/tools/validate.py" --plugin "$PET_PLUGIN" --pet-home "$PET_HOME" || {
  warn "проверка не прошла. Откат: $SCRIPT_DIR/rollback.sh"
  exit 1
}

step "Проверка слияния конфига кодом плагина"
set +e
host_merge_check
mrc=$?
set -e
if [ "$mrc" -eq 1 ]; then
  warn "слияние конфига дало неожиданный результат — откат: $SCRIPT_DIR/rollback.sh"
  exit 1
fi
fi  # /не dry-run

step "Готово"
if [ "$MODE" = "dry-run" ]; then
  say "Это был dry-run: ничего не изменено."
else
  say "Бэкап:      $BACKUP_DIR"
  say "Откат:      $SCRIPT_DIR/rollback.sh"
  say "Перезапустите DSH (или обновите страницу), чтобы питомец подхватил конфиг и патчи."
fi
