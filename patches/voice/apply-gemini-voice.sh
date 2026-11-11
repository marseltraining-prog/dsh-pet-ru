#!/usr/bin/env bash
# Применение Gemini TTS (Aoede) к dsh-pet 0.4.7.
#
#   ./apply-gemini-voice.sh                 # к ~/.dsh/profiles/desktop/node_modules/dsh-pet
#   ./apply-gemini-voice.sh --dry-run       # только показать план, ничего не писать
#   ./apply-gemini-voice.sh --plugin DIR --config FILE
#
# Скрипт идемпотентен: повторный запуск не делает новых бэкапов и не переписывает
# манифест. Озвучку (voiceEnabled) не включает. Ключи не читает и не печатает —
# только проверяет, что файл ключей существует.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PLUGIN="${DSH_PET_DIR:-$HOME/.dsh/profiles/desktop/node_modules/dsh-pet}"
CONFIG="${DSH_PET_CONFIG:-$HOME/.dsh/dsh-pet/main-config.jsonc}"
DRY=0

die() {
  echo "error: $*" >&2
  exit 2
}

usage() {
  cat <<'USAGE'
Использование: ./apply-gemini-voice.sh [--plugin DIR] [--config FILE] [--dry-run]

  --plugin DIR   каталог установленного dsh-pet (по умолчанию ~/.dsh/profiles/desktop/node_modules/dsh-pet)
  --config FILE  main-config.jsonc (по умолчанию ~/.dsh/dsh-pet/main-config.jsonc)
  --dry-run      показать план патча, ничего не менять
  -h, --help     эта справка

Переменные: DSH_PET_DIR, DSH_PET_CONFIG — то же самое, что --plugin/--config.
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --plugin) [ $# -ge 2 ] || die "--plugin требует путь"; PLUGIN="$2"; shift 2 ;;
    --config) [ $# -ge 2 ] || die "--config требует путь"; CONFIG="$2"; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "неизвестный аргумент: $1 (см. --help)" ;;
  esac
done

[ -d "$PLUGIN" ] || die "каталог плагина не найден: $PLUGIN"
PLUGIN="$(cd "$PLUGIN" && pwd)"
[ -f "$CONFIG" ] || die "конфиг не найден: $CONFIG"
CONFIG="$(cd "$(dirname "$CONFIG")" && pwd)/$(basename "$CONFIG")"
USER_ROOT="$(dirname "$CONFIG")"

command -v python3 >/dev/null 2>&1 || die "нужен python3"
command -v node >/dev/null 2>&1 || die "нужен node"
[ -f "$PLUGIN/lib/index.js" ] || die "это не dsh-pet: нет lib/index.js"
[ -f "$PLUGIN/src/host/voice/edge.ts" ] || die "нет src/host/voice/edge.ts (нужна установка с исходниками)"

echo "plugin: $PLUGIN"
echo "config: $CONFIG"

# Ключи: только наличие, содержимое не читаем.
if [ -f "$USER_ROOT/gemini.keys" ]; then
  echo "keys:   gemini.keys ($(wc -l < "$USER_ROOT/gemini.keys" | tr -d ' ') строк)"
elif [ -f "$USER_ROOT/gemini.key" ]; then
  echo "keys:   gemini.key (legacy, одна строка)"
else
  echo "keys:   НЕТ — до добавления ключа каждый синтез пойдёт через Edge-фолбэк"
  echo "        добавьте ~/.dsh/dsh-pet/gemini.keys (по одному ключу на строку)"
fi

if command -v ffmpeg >/dev/null 2>&1 || [ -x /opt/homebrew/bin/ffmpeg ]; then
  echo "ffmpeg: есть (PCM → mp3)"
else
  echo "ffmpeg: НЕТ — Gemini отдаст .wav, маршрут выставит audio/wav"
fi

if [ "$DRY" = 1 ]; then
  echo
  echo "== dry-run: план патча =="
  python3 "$HERE/patch_gemini_voice.py" --plugin "$PLUGIN" --config "$CONFIG" --dry-run
  echo
  echo "dry-run: файлы не изменялись"
  exit 0
fi

PLAN="$(python3 "$HERE/patch_gemini_voice.py" --plugin "$PLUGIN" --config "$CONFIG" --dry-run --json)"
CHANGED="$(printf '%s' "$PLAN" | python3 -c 'import json,sys; print("1" if json.load(sys.stdin).get("changed") else "0")')"

STAMP="$(date +%Y%m%d-%H%M%S)"
MANIFEST="$ROOT/backups/voice/last-apply.json"
mkdir -p "$(dirname "$MANIFEST")"

if [ "$CHANGED" = "1" ]; then
  echo
  echo "== бэкапы =="
  printf '%s' "$PLAN" | python3 "$HERE/backup_manifest.py" "$PLUGIN" "$CONFIG" "$STAMP" "$MANIFEST"

  echo
  echo "== патч =="
  if ! python3 "$HERE/patch_gemini_voice.py" --plugin "$PLUGIN" --config "$CONFIG"; then
    echo "error: патч не применился — откат" >&2
    "$HERE/rollback-gemini-voice.sh" --plugin "$PLUGIN" --config "$CONFIG" >&2 || true
    exit 1
  fi
else
  echo
  echo "уже применено: патч и провайдер на месте, новых бэкапов нет"
fi

echo
echo "== проверки =="
run_checks() {
  node --check "$PLUGIN/lib/index.js" &&
    node --check "$PLUGIN/lib/voice-gemini.js" &&
    node "$HERE/verify-gemini-voice.cjs" --plugin "$PLUGIN" --config "$CONFIG" &&
    node --experimental-vm-modules "$HERE/tests/dispatch-check.mjs" --plugin "$PLUGIN"
}

if ! run_checks; then
  echo "error: проверки после патча не прошли" >&2
  if [ "$CHANGED" = "1" ]; then
    echo "откатываю изменения" >&2
    "$HERE/rollback-gemini-voice.sh" --plugin "$PLUGIN" --config "$CONFIG" >&2 || true
  fi
  exit 1
fi

echo
echo "готово. voiceEnabled не менялся — смотрите текущее значение в $CONFIG."
echo "  включить/выключить: настройки плагина → «Озвучка», голос «Аоэде»,"
echo "            либо voiceEnabled + voiceName=\"gemini:Aoede\" в $CONFIG"
echo "  откат:    $HERE/rollback-gemini-voice.sh"
if [ "$CHANGED" = "1" ]; then
  echo "  манифест: $MANIFEST"
fi
