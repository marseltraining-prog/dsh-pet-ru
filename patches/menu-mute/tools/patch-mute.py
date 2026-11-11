#!/usr/bin/env python3
"""Идемпотентный патч dsh-pet: пункт меню «Выключить звук» / «Включить звук».

Патчит ровно шесть файлов и добавляет один новый:

  lib/index.js                              — маршрут POST /dsh-pet-7340/voice/mute
  lib/standalone.js                         — тот же маршрут для standalone-режима
  lib/voice-mute.js                         — новый модуль маршрута (создаётся)
  lib/client.js                             — web-меню (пункт + оптимистичное действие)
  runtime/electron-helper/shared-core.js    — состояние озвучки + подпись + экспорт
  runtime/electron-helper/renderer.js       — начальное voiceEnabled из /config
  runtime/electron-helper/sprite/menu.js    — desktop-меню (пункт + действие)

Режимы:
  --check     ничего не пишет; 0 — всё применено, 1 — чего-то не хватает
  --dry-run   печатает план правок
  (без флага) применяет недостающие правки

Каждая правка ищет уникальный якорь; если якорь не найден ровно один раз — ошибка
(значит, версия плагина другая). Повторный запуск ничего не дублирует.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
MODULE_SRC = HERE.parent / "patch" / "voice-mute.js"
MODULE_REL = "lib/voice-mute.js"


def L(*lines: str) -> str:
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# lib/index.js — импорт, маршрут, очередь конфига
# ---------------------------------------------------------------------------

HOST_IMPORT_OLD = 'import { createHash } from "node:crypto";'
HOST_IMPORT_NEW = L(
    'import { createHash } from "node:crypto";',
    'import { voiceMuteRoute } from "./voice-mute.js";',
)

HOST_ROUTE_OLD = L(
    "async function handleVoiceRoutes(deps, input) {",
    "\tconst { body, method, rest, signal } = input;",
)
HOST_ROUTE_NEW = L(
    "async function handleVoiceRoutes(deps, input) {",
    "\tconst { body, method, rest, signal } = input;",
    "\tif (rest === \"voice/mute\") {",
    "\t\tconst result = await voiceMuteRoute({ method, body }, {",
    "\t\t\tconfigPaths: deps.configPaths,",
    "\t\t\tuserConfigPath: deps.userConfigPath",
    "\t\t});",
    "\t\tif (result.obj.ok === true) deps.state.writeSection(\"config\", {});",
    "\t\treturn {",
    "\t\t\tkind: \"json\",",
    "\t\t\tstatus: result.status,",
    "\t\t\tobj: result.obj",
    "\t\t};",
    "\t}",
)

HOST_QUEUE_OLD = 'const isConfigQueue = rest === "config" || (rest === "pet-display" || rest === "pet-config") && method === "POST";'
HOST_QUEUE_NEW = 'const isConfigQueue = rest === "config" || (rest === "pet-display" || rest === "pet-config" || rest === "voice/mute") && method === "POST";'

# standalone-бандл (dsh-pet-standalone) использует тот же desktop-helper и меню,
# поэтому маршрут должен быть и там — иначе пункт меню в standalone-режиме уходил бы в 404.
STANDALONE_IMPORT_OLD = 'import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";'
STANDALONE_IMPORT_NEW = L(
    'import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";',
    'import { voiceMuteRoute } from "./voice-mute.js";',
)

# ---------------------------------------------------------------------------
# lib/client.js — web-меню
# ---------------------------------------------------------------------------

CLIENT_VAR_OLD = L(
    "/** 播放音量系数（0–1，1 = 最大音量）；两端共用，只作用于播放，不影响已合成好的音频。 */",
    "let voiceVolume = 1;",
)
CLIENT_VAR_NEW = L(
    "/** 播放音量系数（0–1，1 = 最大音量）；两端共用，只作用于播放，不影响已合成好的音频。 */",
    "let voiceVolume = 1;",
    "/** 全局 озвучка: main.voiceEnabled. false = host не выдаёт voiceTo, синтез не запускается. */",
    "let voiceEnabled = false;",
)

CLIENT_SETVOICE_OLD = L(
    "function setVoiceConfig(name, volume) {",
    '\tvoiceName = typeof name === "string" ? name : "";',
    "\tvoiceVolume = clampVolume(volume);",
    "\tconfigLoaded = true;",
    "}",
)
CLIENT_SETVOICE_NEW = L(
    "function setVoiceConfig(name, volume, enabled) {",
    '\tvoiceName = typeof name === "string" ? name : "";',
    "\tvoiceVolume = clampVolume(volume);",
    "\tif (typeof enabled === \"boolean\") voiceEnabled = enabled;",
    "\tconfigLoaded = true;",
    "}",
    "/** Глобальный тумблер озвучки: выключенный не тратит квоту Gemini (host не шлёт voiceTo). */",
    "function setVoiceEnabled(on) {",
    "\tvoiceEnabled = on === true;",
    "}",
    "function isVoiceEnabled() {",
    "\treturn voiceEnabled;",
    "}",
    "/** Подпись пункта меню показывает действие, а не состояние. */",
    "function voiceMuteLabel(enabled) {",
    '\treturn enabled === true ? "Выключить звук" : "Включить звук";',
    "}",
)

CLIENT_LOAD_OLD = L(
    "\t\tvoiceVolume = clampVolume(main?.voiceVolume);",
    "\t\tsetVoiceNotifyEnabled(main?.voiceNotifyEnabled);",
)
CLIENT_LOAD_NEW = L(
    "\t\tvoiceVolume = clampVolume(main?.voiceVolume);",
    "\t\tsetVoiceEnabled(main?.voiceEnabled === true);",
    "\t\tsetVoiceNotifyEnabled(main?.voiceNotifyEnabled);",
)

CLIENT_APPLY_OLD = "setVoiceConfig(main.voiceName, main.voiceVolume);"
CLIENT_APPLY_NEW = "setVoiceConfig(main.voiceName, main.voiceVolume, main.voiceEnabled === true);"

CLIENT_TOOLS_OLD = L(
    "\t\t\t\t{",
    '\t\t\t\t\tlabel: "Чат",',
    '\t\t\t\t\taction: "chat",',
    "\t\t\t\t\thint: CHAT_HOTKEY_HINT",
    "\t\t\t\t},",
)
CLIENT_TOOLS_NEW = L(
    "\t\t\t\t{",
    '\t\t\t\t\tlabel: "Чат",',
    '\t\t\t\t\taction: "chat",',
    "\t\t\t\t\thint: CHAT_HOTKEY_HINT",
    "\t\t\t\t},",
    "\t\t\t\t{",
    "\t\t\t\t\tlabel: voiceMuteLabel(isVoiceEnabled()),",
    '\t\t\t\t\taction: "voice-mute"',
    "\t\t\t\t},",
)

CLIENT_ACTION_OLD = L(
    '\t\tif (leaf$1.action === "chat") {',
    "\t\t\tdeps.openChat();",
    "\t\t\treturn;",
    "\t\t}",
)
CLIENT_ACTION_NEW = L(
    '\t\tif (leaf$1.action === "chat") {',
    "\t\t\tdeps.openChat();",
    "\t\t\treturn;",
    "\t\t}",
    '\t\tif (leaf$1.action === "voice-mute") {',
    "\t\t\tvoid toggleVoiceMute(deps);",
    "\t\t\treturn;",
    "\t\t}",
)

CLIENT_TOGGLE_OLD = "function createMenuActions(deps) {"
CLIENT_TOGGLE_NEW = L(
    "/** Глобальный тумблер озвучки: пишет main-config.jsonc и оптимистично меняет локальное состояние.",
    " *  Ошибка — откат к прежнему значению и короткая реплика, чтобы клик не выглядел «ничем». */",
    "async function toggleVoiceMute(deps) {",
    "\tconst before = isVoiceEnabled();",
    "\tconst next = !before;",
    "\tsetVoiceEnabled(next);",
    "\ttry {",
    '\t\tconst response = await fetch(ROUTE_PATH + "/voice/mute", {',
    '\t\t\tmethod: "POST",',
    "\t\t\theaders: {",
    '\t\t\t\t"content-type": "application/json"',
    "\t\t\t},",
    "\t\t\tbody: JSON.stringify({ muted: !next })",
    "\t\t});",
    '\t\tif (!response.ok) throw new Error("voice/mute HTTP " + response.status);',
    "\t\tconst body = await response.json();",
    '\t\tif (!body || body.ok !== true) throw new Error("voice/mute: " + String(body?.reason ?? "failed"));',
    "\t\tsetVoiceEnabled(body.voiceEnabled === true);",
    "\t} catch (error) {",
    "\t\tsetVoiceEnabled(before);",
    '\t\tdeps.warn("[dsh-pet] переключение звука не удалось: " + (error instanceof Error ? error.message : String(error)));',
    '\t\tdeps.say?.("Не удалось переключить звук");',
    "\t}",
    "}",
    "",
    "function createMenuActions(deps) {",
)

CLIENT_SLEEP_OLD = L(
    '\t"set-display",',
    '\t"reload",',
    '\t"third-party"',
)
CLIENT_SLEEP_NEW = L(
    '\t"set-display",',
    '\t"voice-mute",',
    '\t"reload",',
    '\t"third-party"',
)

# ---------------------------------------------------------------------------
# runtime/electron-helper/shared-core.js — состояние, подпись, экспорт
# ---------------------------------------------------------------------------

SHARED_VAR_OLD = CLIENT_VAR_OLD
SHARED_VAR_NEW = CLIENT_VAR_NEW

SHARED_SETVOICE_OLD = CLIENT_SETVOICE_OLD
SHARED_SETVOICE_NEW = CLIENT_SETVOICE_NEW

SHARED_LOAD_OLD = CLIENT_LOAD_OLD
SHARED_LOAD_NEW = CLIENT_LOAD_NEW

SHARED_SLEEP_OLD = CLIENT_SLEEP_OLD
SHARED_SLEEP_NEW = CLIENT_SLEEP_NEW

SHARED_EXPORT_IS_OLD = "exports.isVoiceNotifyEnabled = isVoiceNotifyEnabled"
SHARED_EXPORT_IS_NEW = L(
    "exports.isVoiceEnabled = isVoiceEnabled",
    "exports.isVoiceNotifyEnabled = isVoiceNotifyEnabled",
)

SHARED_EXPORT_SET_OLD = "exports.setVoiceBase = setVoiceBase"
SHARED_EXPORT_SET_NEW = L(
    "exports.setVoiceEnabled = setVoiceEnabled",
    "exports.setVoiceBase = setVoiceBase",
)

SHARED_EXPORT_LABEL_OLD = "exports.whisperBubbleView = whisperBubbleView"
SHARED_EXPORT_LABEL_NEW = L(
    "exports.voiceMuteLabel = voiceMuteLabel",
    "exports.whisperBubbleView = whisperBubbleView",
)

# ---------------------------------------------------------------------------
# runtime/electron-helper/renderer.js — начальное состояние из /config
# ---------------------------------------------------------------------------

RENDERER_CONFIG_OLD = "    voiceVolume: merged && merged.main ? merged.main.voiceVolume : undefined,"
RENDERER_CONFIG_NEW = L(
    "    voiceVolume: merged && merged.main ? merged.main.voiceVolume : undefined,",
    "    // Глобальный тумблер озвучки: меню берёт из него подпись, чтобы она совпадала с конфигом.",
    "    voiceEnabled: (merged && merged.main && merged.main.voiceEnabled) === true,",
)

RENDERER_SETVOICE_OLD = "    S.setVoiceConfig(cfg.voiceName, cfg.voiceVolume);"
RENDERER_SETVOICE_NEW = "    S.setVoiceConfig(cfg.voiceName, cfg.voiceVolume, cfg.voiceEnabled);"

# ---------------------------------------------------------------------------
# runtime/electron-helper/sprite/menu.js — desktop-меню
# ---------------------------------------------------------------------------

MENU_TOOLS_OLD = "      { label: 'Чат', action: 'chat', hint: S.CHAT_HOTKEY_HINT },"
MENU_TOOLS_NEW = L(
    "      { label: 'Чат', action: 'chat', hint: S.CHAT_HOTKEY_HINT },",
    "      // Голос: подпись показывает действие, а не состояние. Меняет voiceEnabled в конфиге",
    "      // (квота Gemini не тратится), а не громкость плеера.",
    "      { label: S.voiceMuteLabel(S.isVoiceEnabled()), action: 'voice-mute' },",
)

MENU_ACTION_OLD = L(
    "    if (leaf.action === 'chat') {",
    "      this.showChatFromMenu(); // 打开对话弹窗（记忆经 host /chat 读写，浏览器/桌面同一实例共享）",
    "      return;",
    "    }",
)
MENU_ACTION_NEW = L(
    "    if (leaf.action === 'chat') {",
    "      this.showChatFromMenu(); // 打开对话弹窗（记忆经 host /chat 读写，浏览器/桌面同一实例共享）",
    "      return;",
    "    }",
    "    if (leaf.action === 'voice-mute') {",
    "      this.toggleVoiceMute(); // глобальный voiceEnabled: пишет конфиг, состояние — из ответа",
    "      return;",
    "    }",
)

MENU_METHOD_OLD = "  setPetDisplay(display) {"
MENU_METHOD_NEW = L(
    "  /**",
    "   * 「Звук」: переключает глобальный voiceEnabled (main-config.jsonc), а не громкость плеера.",
    "   * Оптимистично меняем локальное состояние; после ответа берём voiceEnabled из тела.",
    "   * Ошибка — откат и короткий пузырь, чтобы клик не выглядел «ничем».",
    "   */",
    "  async toggleVoiceMute() {",
    "    const before = S.isVoiceEnabled();",
    "    const muted = before; // было включено → выключаем",
    "    S.setVoiceEnabled(!muted);",
    "    try {",
    "      const res = await fetch(BASE + '/voice/mute', {",
    "        method: 'POST',",
    "        headers: { 'content-type': 'application/json' },",
    "        body: JSON.stringify({ muted }),",
    "      });",
    "      if (!res.ok) throw new Error('HTTP ' + res.status);",
    "      const body = await res.json();",
    "      if (!body || body.ok !== true) throw new Error(String((body && body.reason) || 'failed'));",
    "      S.setVoiceEnabled(body.voiceEnabled === true);",
    "      console.info('[dsh-pet] звук: voiceEnabled=' + String(body.voiceEnabled));",
    "    } catch (e) {",
    "      S.setVoiceEnabled(before);",
    "      console.warn('[dsh-pet] переключение звука не удалось', e);",
    "      this.showWhisper('Не удалось переключить звук', undefined, undefined, 8000, false);",
    "    }",
    "  },",
    "",
    "  setPetDisplay(display) {",
)

# (relative path, old, new, check-substring, human description)
EDITS = [
    ("lib/index.js", HOST_IMPORT_OLD, HOST_IMPORT_NEW, 'from "./voice-mute.js"', "импорт модуля маршрута"),
    ("lib/index.js", HOST_ROUTE_OLD, HOST_ROUTE_NEW, 'rest === "voice/mute"', "маршрут POST /voice/mute"),
    ("lib/index.js", HOST_QUEUE_OLD, HOST_QUEUE_NEW, '|| rest === "voice/mute") && method', "очередь записи конфига"),
    ("lib/standalone.js", STANDALONE_IMPORT_OLD, STANDALONE_IMPORT_NEW, 'from "./voice-mute.js"', "standalone: импорт модуля маршрута"),
    ("lib/standalone.js", HOST_ROUTE_OLD, HOST_ROUTE_NEW, 'rest === "voice/mute"', "standalone: маршрут POST /voice/mute"),
    ("lib/standalone.js", HOST_QUEUE_OLD, HOST_QUEUE_NEW, '|| rest === "voice/mute") && method', "standalone: очередь записи конфига"),
    ("lib/client.js", CLIENT_VAR_OLD, CLIENT_VAR_NEW, "let voiceEnabled = false;", "web: состояние озвучки"),
    ("lib/client.js", CLIENT_SETVOICE_OLD, CLIENT_SETVOICE_NEW, "function voiceMuteLabel(enabled) {", "web: setVoiceEnabled/isVoiceEnabled/подпись"),
    ("lib/client.js", CLIENT_LOAD_OLD, CLIENT_LOAD_NEW, "setVoiceEnabled(main?.voiceEnabled === true);", "web: ленивая загрузка конфига"),
    ("lib/client.js", CLIENT_APPLY_OLD, CLIENT_APPLY_NEW, "main.voiceVolume, main.voiceEnabled === true", "web: применение /config"),
    ("lib/client.js", CLIENT_TOOLS_OLD, CLIENT_TOOLS_NEW, 'action: "voice-mute"', "web: пункт меню после «Чат»"),
    ("lib/client.js", CLIENT_ACTION_OLD, CLIENT_ACTION_NEW, 'action === "voice-mute"', "web: обработчик действия"),
    ("lib/client.js", CLIENT_TOGGLE_OLD, CLIENT_TOGGLE_NEW, "async function toggleVoiceMute(deps) {", "web: POST + откат"),
    ("lib/client.js", CLIENT_SLEEP_OLD, CLIENT_SLEEP_NEW, '\t"voice-mute",\n\t"reload"', "web: разрешить во сне"),
    ("runtime/electron-helper/shared-core.js", SHARED_VAR_OLD, SHARED_VAR_NEW, "let voiceEnabled = false;", "desktop: состояние озвучки"),
    ("runtime/electron-helper/shared-core.js", SHARED_SETVOICE_OLD, SHARED_SETVOICE_NEW, "function voiceMuteLabel(enabled) {", "desktop: setVoiceEnabled/isVoiceEnabled/подпись"),
    ("runtime/electron-helper/shared-core.js", SHARED_LOAD_OLD, SHARED_LOAD_NEW, "setVoiceEnabled(main?.voiceEnabled === true);", "desktop: ленивая загрузка конфига"),
    ("runtime/electron-helper/shared-core.js", SHARED_SLEEP_OLD, SHARED_SLEEP_NEW, '\t"voice-mute",\n\t"reload"', "desktop: разрешить во сне"),
    ("runtime/electron-helper/shared-core.js", SHARED_EXPORT_IS_OLD, SHARED_EXPORT_IS_NEW, "exports.isVoiceEnabled = isVoiceEnabled", "desktop: экспорт isVoiceEnabled"),
    ("runtime/electron-helper/shared-core.js", SHARED_EXPORT_SET_OLD, SHARED_EXPORT_SET_NEW, "exports.setVoiceEnabled = setVoiceEnabled", "desktop: экспорт setVoiceEnabled"),
    ("runtime/electron-helper/shared-core.js", SHARED_EXPORT_LABEL_OLD, SHARED_EXPORT_LABEL_NEW, "exports.voiceMuteLabel = voiceMuteLabel", "desktop: экспорт подписи"),
    ("runtime/electron-helper/renderer.js", RENDERER_CONFIG_OLD, RENDERER_CONFIG_NEW, "voiceEnabled: (merged && merged.main", "desktop: voiceEnabled из /config"),
    ("runtime/electron-helper/renderer.js", RENDERER_SETVOICE_OLD, RENDERER_SETVOICE_NEW, "cfg.voiceVolume, cfg.voiceEnabled", "desktop: передать voiceEnabled в shared"),
    ("runtime/electron-helper/sprite/menu.js", MENU_TOOLS_OLD, MENU_TOOLS_NEW, "action: 'voice-mute'", "desktop: пункт меню после «Чат»"),
    ("runtime/electron-helper/sprite/menu.js", MENU_ACTION_OLD, MENU_ACTION_NEW, "action === 'voice-mute'", "desktop: обработчик действия"),
    ("runtime/electron-helper/sprite/menu.js", MENU_METHOD_OLD, MENU_METHOD_NEW, "async toggleVoiceMute() {", "desktop: POST + откат"),
]

# Дополнительные проверки для verify (подписи в обоих бандлах).
VERIFY_CONTAINS = [
    ("lib/index.js", 'rest === "voice/mute"', "маршрут в lib/index.js"),
    ("lib/index.js", 'from "./voice-mute.js"', "импорт lib/voice-mute.js"),
    ("lib/standalone.js", 'rest === "voice/mute"', "маршрут в lib/standalone.js"),
    ("lib/standalone.js", 'from "./voice-mute.js"', "импорт lib/voice-mute.js в standalone"),
    ("lib/client.js", '"Выключить звук"', "подпись «Выключить звук» в web-бандле"),
    ("lib/client.js", '"Включить звук"', "подпись «Включить звук» в web-бандле"),
    ("lib/client.js", 'action: "voice-mute"', "пункт voice-mute в web-бандле"),
    ("runtime/electron-helper/sprite/menu.js", "action: 'voice-mute'", "пункт voice-mute в desktop-бандле"),
    ("runtime/electron-helper/sprite/menu.js", "S.voiceMuteLabel(S.isVoiceEnabled())", "динамическая подпись в desktop-меню"),
    ("runtime/electron-helper/shared-core.js", '"Выключить звук"', "подпись «Выключить звук» в shared-core"),
    ("runtime/electron-helper/shared-core.js", '"Включить звук"', "подпись «Включить звук» в shared-core"),
    ("runtime/electron-helper/renderer.js", "voiceEnabled: (merged && merged.main", "voiceEnabled из /config"),
]


def read(p: Path) -> str:
    return p.read_text(encoding="utf-8")


def check_module(plugin: Path, problems: list[str]) -> None:
    dst = plugin / MODULE_REL
    if not dst.is_file():
        problems.append(f"{MODULE_REL}: файла нет")
        return
    if read(dst) != read(MODULE_SRC):
        problems.append(f"{MODULE_REL}: содержимое отличается от patch/voice-mute.js")


def check_edits(plugin: Path, problems: list[str]) -> None:
    for rel, old, new, marker, desc in EDITS:
        p = plugin / rel
        if not p.is_file():
            problems.append(f"{rel}: файла нет")
            continue
        content = read(p)
        if marker in content:
            continue
        if content.count(old) != 1:
            problems.append(
                f"{rel}: якорь для «{desc}» найден {content.count(old)} раз (ожидался 1) — другая версия плагина?"
            )
            continue
        problems.append(f"{rel}: не применено — {desc}")


def check_verify(plugin: Path, problems: list[str]) -> None:
    for rel, needle, desc in VERIFY_CONTAINS:
        p = plugin / rel
        if not p.is_file() or needle not in read(p):
            problems.append(f"{rel}: нет «{desc}»")


def apply(plugin: Path) -> int:
    problems: list[str] = []
    check_module(plugin, problems)
    check_edits(plugin, problems)
    if not problems:
        print("✓ патч уже применён — ничего не меняю (идемпотентно)")
        return 0

    # Сначала убеждаемся, что все недостающие правки вообще применимы: иначе
    # можно записать половину и упасть на середине (apply.sh откатит, но зачем).
    for rel, old, _new, marker, desc in EDITS:
        content = read(plugin / rel)
        if marker in content:
            continue
        count = content.count(old)
        if count != 1:
            print(f"✗ {rel}: якорь «{desc}» найден {count} раз (ожидался 1) — патч остановлен", file=sys.stderr)
            return 1

    # Новый модуль: создать или перезаписать канонической версией.
    dst = plugin / MODULE_REL
    dst.parent.mkdir(parents=True, exist_ok=True)
    if not dst.is_file() or read(dst) != read(MODULE_SRC):
        dst.write_text(read(MODULE_SRC), encoding="utf-8")
        print(f"✓ создан {MODULE_REL}")

    changed = 0
    for rel, old, new, marker, desc in EDITS:
        p = plugin / rel
        content = read(p)
        if marker in content:
            continue
        p.write_text(content.replace(old, new, 1), encoding="utf-8")
        changed += 1
        print(f"✓ {rel}: {desc}")

    problems = []
    check_module(plugin, problems)
    check_edits(plugin, problems)
    check_verify(plugin, problems)
    if problems:
        for p in problems:
            print(f"✗ {p}", file=sys.stderr)
        return 1
    print(f"✓ применено правок: {changed}; проверка после патча — OK")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Патч меню звука dsh-pet")
    ap.add_argument("--plugin", required=True, help="каталог плагина dsh-pet")
    ap.add_argument("--check", action="store_true", help="только проверить")
    ap.add_argument("--dry-run", action="store_true", help="показать план")
    args = ap.parse_args()

    plugin = Path(args.plugin).expanduser().resolve()
    if not plugin.is_dir():
        print(f"✗ нет каталога плагина: {plugin}", file=sys.stderr)
        return 1
    if not MODULE_SRC.is_file():
        print(f"✗ нет шаблона модуля: {MODULE_SRC}", file=sys.stderr)
        return 1

    if args.check:
        problems: list[str] = []
        check_module(plugin, problems)
        check_edits(plugin, problems)
        check_verify(plugin, problems)
        if problems:
            for p in problems:
                print(f"✗ {p}")
            return 1
        print("✓ маршрут, модуль, web- и desktop-подписи на месте")
        return 0

    if args.dry_run:
        print(f"плагин: {plugin}")
        print(f"новый файл: {MODULE_REL}")
        for rel, _old, _new, marker, desc in EDITS:
            state = "уже есть" if marker in read(plugin / rel) else "будет применено"
            print(f"  {rel}: {desc} — {state}")
        return 0

    return apply(plugin)


if __name__ == "__main__":
    sys.exit(main())
