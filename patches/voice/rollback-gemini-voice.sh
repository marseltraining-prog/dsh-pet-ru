#!/usr/bin/env bash
# Откат Gemini TTS (Aoede) к состоянию до apply-gemini-voice.sh.
#
#   ./rollback-gemini-voice.sh              # по манифесту logs/last-apply.json
#   ./rollback-gemini-voice.sh --dry-run    # показать, что будет восстановлено
#   ./rollback-gemini-voice.sh --plugin DIR --config FILE
#
# Если манифеста нет — восстанавливает самые свежие <файл>.bak.* и удаляет
# lib/voice-gemini.js / src/host/voice/gemini.ts (только если в них наш маркер).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PLUGIN="${DSH_PET_DIR:-$HOME/.dsh/profiles/desktop/node_modules/dsh-pet}"
CONFIG="${DSH_PET_CONFIG:-$HOME/.dsh/dsh-pet/main-config.jsonc}"
MANIFEST="$ROOT/backups/voice/last-apply.json"
DRY=0

die() {
  echo "error: $*" >&2
  exit 2
}

while [ $# -gt 0 ]; do
  case "$1" in
    --plugin) [ $# -ge 2 ] || die "--plugin требует путь"; PLUGIN="$2"; shift 2 ;;
    --config) [ $# -ge 2 ] || die "--config требует путь"; CONFIG="$2"; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    -h|--help) sed -n '2,12p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) die "неизвестный аргумент: $1" ;;
  esac
done

[ -d "$PLUGIN" ] || die "каталог плагина не найден: $PLUGIN"
PLUGIN="$(cd "$PLUGIN" && pwd)"
CONFIG="$(cd "$(dirname "$CONFIG")" 2>/dev/null && pwd)/$(basename "$CONFIG")"

PROVIDER_FILES=("$PLUGIN/lib/voice-gemini.js" "$PLUGIN/src/host/voice/gemini.ts")
KNOWN_FILES=(
  "$PLUGIN/lib/index.js"
  "$PLUGIN/src/host/voice/voices.ts"
  "$PLUGIN/src/host/voice/edge.ts"
  "$PLUGIN/src/host/voice/speak.ts"
  "$PLUGIN/src/host/voice/cache.ts"
  "$PLUGIN/src/host/routes/voice.ts"
)

ACTIONS=""
if [ -f "$MANIFEST" ]; then
  ACTIONS="$(python3 - "$MANIFEST" <<'PY'
import json, sys
manifest = json.load(open(sys.argv[1], encoding="utf-8"))
for item in manifest.get("backups", []):
    print("RESTORE\t%s\t%s" % (item["file"], item["backup"]))
for path in manifest.get("created", []):
    print("REMOVE\t%s" % path)
PY
)"
else
  echo "манифест не найден: $MANIFEST — ищу свежие *.bak.*"
  for file in "${KNOWN_FILES[@]}" "$CONFIG"; do
    latest="$(ls -1 "$file".bak.* 2>/dev/null | sort | tail -1 || true)"
    [ -n "$latest" ] && ACTIONS+="RESTORE	$file	$latest"$'\n'
  done
  for file in "${PROVIDER_FILES[@]}"; do
    [ -f "$file" ] && ACTIONS+="REMOVE	$file"$'\n'
  done
fi

if [ -z "$(printf '%s' "$ACTIONS" | tr -d '[:space:]')" ]; then
  echo "нечего откатывать: бэкапов нет, провайдер не установлен"
  exit 0
fi

echo "== план отката =="
printf '%s\n' "$ACTIONS"

if [ "$DRY" = 1 ]; then
  echo
  echo "dry-run: ничего не изменено"
  exit 0
fi

while IFS=$'\t' read -r action first second; do
  [ -n "$action" ] || continue
  case "$action" in
    RESTORE)
      if [ -f "$second" ]; then
        cp -p "$second" "$first"
        echo "restored: $first  <-  $(basename "$second")"
      else
        echo "WARN: бэкап пропал: $second" >&2
      fi
      ;;
    REMOVE)
      if [ -f "$first" ] && head -1 "$first" | grep -q 'dsh-pet gemini-provider'; then
        rm -f "$first"
        echo "removed:  $first"
      elif [ -f "$first" ]; then
        echo "WARN: $first не наш (нет маркера) — оставлен" >&2
      fi
      ;;
    *) echo "WARN: неизвестное действие: $action" >&2 ;;
  esac
done <<< "$ACTIONS"

echo
echo "== проверки =="
if [ -f "$PLUGIN/lib/index.js" ]; then
  node --check "$PLUGIN/lib/index.js"
fi
if grep -q 'gemini:Aoede' "$PLUGIN/lib/index.js" 2>/dev/null; then
  echo "WARN: gemini:Aoede всё ещё в lib/index.js — проверьте, что восстановился нужный бэкап" >&2
else
  echo "ok: gemini:Aoede в lib/index.js отсутствует"
fi
if grep -q '"voiceName": "gemini:Aoede"' "$CONFIG" 2>/dev/null; then
  echo "WARN: в конфиге всё ещё voiceName=gemini:Aoede" >&2
else
  echo "ok: voiceName в конфиге не gemini:Aoede"
fi

if [ -f "$MANIFEST" ]; then
  mkdir -p "$(dirname "$MANIFEST")"; mv "$MANIFEST" "$(dirname "$MANIFEST")/last-rollback.json"
  echo "манифест: $(dirname "$MANIFEST")/last-rollback.json"
fi
echo "откат завершён. Перезапустите DSH, чтобы плагин перечитал файлы."
