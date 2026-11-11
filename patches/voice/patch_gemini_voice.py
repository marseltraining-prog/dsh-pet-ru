#!/usr/bin/env python3
"""Идемпотентный патч dsh-pet 0.4.7: Gemini TTS (Aoede) + ротация ключей + Edge-фолбэк.

Что делает:
  * `lib/index.js` — добавляет `gemini:Aoede` в VOICES, превращает Edge-синтез в
    `synthesizeEdge()` и ставит диспетчер `synthesize()`; в `speak()` добавляет
    стиль в ключ кэша, путь к wav и возврат фактического файла; в маршруте
    `/voice/speak` выставляет `audio/wav`, если ffmpeg не нашёлся.
  * `src/host/voice/*.ts` и `src/host/routes/voice.ts` — те же правки для консистентности.
  * `lib/voice-gemini.js` и `src/host/voice/gemini.ts` — новые файлы провайдера.
  * `main-config.jsonc` — добавляет `voiceProvider` / `voiceName` / `voiceStyle` /
    `voiceFallback`; `voiceEnabled` не трогает никогда.

Все правки проверяют маркеры и при повторном запуске ничего не меняют.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

MARKER = "gemini-provider"

BUNDLE_VOICE_ENTRY = (
    "\t{\n"
    '\t\tid: "gemini:Aoede",\n'
    '\t\tname: "Аоэде",\n'
    '\t\ttag: "жен. · аниме",\n'
    "\t\tdefault: false\n"
    "\t}"
)

TS_VOICE_ENTRY = (
    "  { id: 'gemini:Aoede', name: 'Аоэде', tag: 'жен. · аниме', default: false },\n"
)

BUNDLE_DISPATCHER = """/**
 * 语音合成入口：`gemini:*` 走 Gemini（PCM→WAV→mp3，失败自动回退 Edge），其余原样走 Edge。
 * Провайдер лежит рядом: lib/voice-gemini.js (кладёт установочный скрипт).
 */
async function synthesize(input) {
\tconst voice = typeof input.voice === "string" ? input.voice : "";
\tif (voice.startsWith("gemini:")) {
\t\tconst mod = await import("./voice-gemini.js");
\t\treturn await mod.synthesizeGemini(input, { synthesizeEdge });
\t}
\tawait synthesizeEdge(input);
\treturn input.target;
}"""

TS_DISPATCHER = """/**
 * 选路：`gemini:*` 交给 Gemini（PCM → WAV → mp3，失败自动回退 Edge），其余原样走 Edge。
 * 返回实际落盘的文件：通常等于 `target`，没有 ffmpeg 时是旁边的 `.wav`。
 */
export async function synthesize(input: SynthInput): Promise<string> {
  if (input.voice.startsWith('gemini:')) {
    const { synthesizeGemini } = await import('./gemini.ts');
    return await synthesizeGemini(input, { synthesizeEdge });
  }
  await synthesizeEdge(input);
  return input.target;
}"""


class PatchError(RuntimeError):
    pass


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write(path: Path, text: str) -> None:
    path.write_text(text, encoding="utf-8")


def region_bounds(text: str, region: str) -> tuple[int, int]:
    start = text.find("//#region " + region)
    if start < 0:
        raise PatchError(f"region not found: {region}")
    end = text.find("//#endregion", start)
    if end < 0:
        raise PatchError(f"region end not found: {region}")
    return start, end


def patch_bundle(path: Path, dry: bool) -> dict:
    text = read(path)
    notes: list[str] = []

    # 1. VOICES += gemini:Aoede
    start, end = region_bounds(text, "src/host/voice/voices.ts")
    region = text[start:end]
    if "gemini:Aoede" not in region:
        idx = region.rindex("\n];")
        region = region[:idx] + ",\n" + BUNDLE_VOICE_ENTRY + region[idx:]
        text = text[:start] + region + text[end:]
        notes.append("voices:+gemini:Aoede")

    # 2. edge: synthesize → synthesizeEdge + диспетчер
    start, end = region_bounds(text, "src/host/voice/edge.ts")
    region = text[start:end]
    old_sig = "async function synthesize({ signal, text, voice, rate, target }) {"
    if "async function synthesizeEdge(" not in region:
        if old_sig not in region:
            raise PatchError("edge: synthesize signature not found")
        region = region.replace(old_sig, "async function synthesizeEdge({ signal, text, voice, rate, target }) {", 1)
        notes.append("edge:renamed")
    if "async function synthesize(input)" not in region:
        region = region.rstrip() + "\n\n" + BUNDLE_DISPATCHER + "\n\n"
        notes.append("edge:+dispatcher")
    text = text[:start] + region + text[end:]

    # 2b. cache: prune должен видеть и .wav (ветка без ffmpeg)
    start, end = region_bounds(text, "src/host/voice/cache.ts")
    region = text[start:end]
    old_prune = '\t\tif (!name$1.endsWith(".mp3")) continue;'
    new_prune = '\t\tif (!name$1.endsWith(".mp3") && !name$1.endsWith(".wav")) continue;'
    if new_prune not in region:
        if old_prune not in region:
            raise PatchError("cache: prune anchor not found")
        region = region.replace(old_prune, new_prune, 1)
        text = text[:start] + region + text[end:]
        notes.append("cache:wav-prune")

    # 3. speak: стиль в кэше, wav-путь, фактический файл
    start, end = region_bounds(text, "src/host/voice/speak.ts")
    region = text[start:end]
    if "geminiVoice" not in region:
        replacements = [
            (
                "\t\tconst target = cachePath(userRoot, cacheKey(source, provider ? \"\" : voice, rate, text));\n"
                "\t\tconst startedMs = Date.now();\n"
                "\t\tconst cached = await findCached(target);",
                "\t\t// gemini 的情绪由文本决定：风格并进缓存键，换情绪不会命中旧音频\n"
                "\t\tconst geminiVoice = !provider && voice.startsWith(\"gemini:\");\n"
                "\t\tconst gem = geminiVoice ? await import(\"./voice-gemini.js\") : void 0;\n"
                "\t\tconst style = gem ? gem.resolveStyle((await gem.readVoiceConfig(userRoot)).voiceStyle, text) : \"\";\n"
                "\t\tconst cacheVoice = provider ? \"\" : geminiVoice ? `${voice}|${style}` : voice;\n"
                "\t\tconst target = cachePath(userRoot, cacheKey(source, cacheVoice, rate, text));\n"
                "\t\tconst wavTarget = geminiVoice ? target.replace(/\\.mp3$/, \".wav\") : \"\";\n"
                "\t\tconst startedMs = Date.now();\n"
                "\t\tconst cached = (await findCached(target)) ?? (wavTarget ? await findCached(wavTarget) : void 0);",
            ),
            (
                "\t\tconst queue = { dropped: false };\n\t\tconst queuedMs = Date.now();\n\t\ttry {",
                "\t\tconst queue = { dropped: false };\n\t\tconst queuedMs = Date.now();\n\t\tlet produced = target;\n\t\ttry {",
            ),
            (
                "\t\t\t\telse await synthesizeImpl({\n"
                "\t\t\t\t\tsignal: AbortSignal.timeout(BUILTIN_TIMEOUT_MS),\n"
                "\t\t\t\t\ttarget,\n"
                "\t\t\t\t\ttext,\n"
                "\t\t\t\t\tvoice,\n"
                "\t\t\t\t\trate\n"
                "\t\t\t\t});",
                "\t\t\t\telse produced = (await synthesizeImpl({\n"
                "\t\t\t\t\tsignal: AbortSignal.timeout(BUILTIN_TIMEOUT_MS),\n"
                "\t\t\t\t\ttarget,\n"
                "\t\t\t\t\ttext,\n"
                "\t\t\t\t\tvoice,\n"
                "\t\t\t\t\trate,\n"
                "\t\t\t\t\tuserRoot,\n"
                "\t\t\t\t\tlog\n"
                "\t\t\t\t})) ?? target;",
            ),
            ("\t\t\tfile: target\n", "\t\t\tfile: produced\n"),
        ]
        for old, new in replacements:
            if old not in region:
                raise PatchError("speak: anchor not found: " + old.strip().splitlines()[0][:60])
            region = region.replace(old, new, 1)
        text = text[:start] + region + text[end:]
        notes.append("speak:gemini-cache")

    # 4. маршрут: content-type по фактическому расширению
    old_route = '\t\t\tcontentType: "audio/mpeg"'
    new_route = '\t\t\tcontentType: result.file.endsWith(".wav") ? "audio/wav" : "audio/mpeg"'
    if new_route not in text:
        if text.count(old_route) != 1:
            raise PatchError("route: contentType anchor is not unique")
        text = text.replace(old_route, new_route, 1)
        notes.append("route:content-type")

    changed = text != read(path)
    if changed and not dry:
        write(path, text)
    return {"changed": changed, "notes": notes}


def patch_ts_voices(path: Path, dry: bool) -> dict:
    text = read(path)
    notes: list[str] = []
    # Комментарии: список больше не «четыре китайских», id бывает и gemini:Name.
    old_doc = "/** 允许请求的四个中文音色；标记 `default` 的那个是缺省值。 */"
    new_doc = "/** 允许请求的中文、俄语与 Gemini 音色；标记 `default` 的那个是缺省值。 */"
    if old_doc in text:
        text = text.replace(old_doc, new_doc, 1)
        notes.append("voices.ts:doc")
    old_id_doc = "/** 一个可选音色；`id` 是 edge 服务端的 short name，其余字段只用于展示。 */"
    new_id_doc = "/** 一个可选音色；`id` 是服务端音色 id（edge short name 或 `gemini:Name`），其余字段只用于展示。 */"
    if old_id_doc in text:
        text = text.replace(old_id_doc, new_id_doc, 1)
        notes.append("voices.ts:id-doc")
    if "gemini:Aoede" in text:
        changed = text != read(path)
        if changed and not dry:
            write(path, text)
        return {"changed": changed, "notes": notes}
    anchor = "  { id: 'zh-CN-YunjianNeural', name: '云健', tag: '男 · 沉稳', default: false },\n];"
    if anchor not in text:
        raise PatchError("voices.ts: anchor not found")
    text = text.replace(anchor, anchor[:-3] + "\n" + TS_VOICE_ENTRY + "];", 1)
    if not dry:
        write(path, text)
    return {"changed": True, "notes": ["voices.ts:+gemini:Aoede"]}


def patch_ts_edge(path: Path, dry: bool) -> dict:
    text = read(path)
    notes: list[str] = []
    if "synthesizeEdge" not in text:
        old = "export async function synthesize({ signal, text, voice, rate, target }: SynthInput): Promise<void> {"
        if old not in text:
            raise PatchError("edge.ts: signature not found")
        text = text.replace(old, "export async function synthesizeEdge({ signal, text, voice, rate, target }: SynthInput): Promise<string> {", 1)
        notes.append("edge.ts:renamed")
    if "readonly userRoot?: string;" not in text:
        anchor = "  /** 总时限：依赖自带的 timeout 只是「静默」超时（每帧重置），真正的总上限要靠这个信号。 */\n  readonly signal?: AbortSignal;"
        if anchor not in text:
            raise PatchError("edge.ts: SynthInput anchor not found")
        text = text.replace(
            anchor,
            anchor
            + "\n  /** Корень данных пользователя: отсюда Gemini читает ключи (gemini.keys) и main-config.jsonc. */\n  readonly userRoot?: string;"
            + "\n  /** Для логов: ротация и фолбэк Gemini пишут сюда; ключи не печатаются. */\n  readonly log?: { info?(message: string): void; warn?(message: string): void };",
            1,
        )
        notes.append("edge.ts:+input-fields")
    if "export async function synthesize(input: SynthInput)" not in text:
        text = text.rstrip() + "\n\n" + TS_DISPATCHER + "\n"
        notes.append("edge.ts:+dispatcher")
    changed = text != read(path)
    if changed and not dry:
        write(path, text)
    return {"changed": changed, "notes": notes}


def patch_ts_speak(path: Path, dry: bool) -> dict:
    text = read(path)
    if "geminiVoice" in text:
        return {"changed": False, "notes": []}
    replacements = [
        (
            "    const target = cachePath(userRoot, cacheKey(source, provider ? '' : voice, rate, text));\n"
            "    const startedMs = Date.now();\n"
            "    const cached = await findCached(target);",
            "    // gemini 的情绪由文本决定：风格并进缓存键，换情绪不会命中旧音频\n"
            "    const geminiVoice = !provider && voice.startsWith('gemini:');\n"
            "    const gem = geminiVoice ? await import('./gemini.ts') : undefined;\n"
            "    const style = gem ? gem.resolveStyle((await gem.readVoiceConfig(userRoot)).voiceStyle, text) : '';\n"
            "    const cacheVoice = provider ? '' : geminiVoice ? `${voice}|${style}` : voice;\n"
            "    const target = cachePath(userRoot, cacheKey(source, cacheVoice, rate, text));\n"
            "    const wavTarget = geminiVoice ? target.replace(/\\.mp3$/, '.wav') : '';\n"
            "    const startedMs = Date.now();\n"
            "    const cached = (await findCached(target)) ?? (wavTarget ? await findCached(wavTarget) : undefined);",
        ),
        (
            "    const queue = { dropped: false };\n    const queuedMs = Date.now();\n    try {",
            "    const queue = { dropped: false };\n    const queuedMs = Date.now();\n    let produced = target;\n    try {",
        ),
        (
            "        else await synthesizeImpl({ signal: AbortSignal.timeout(BUILTIN_TIMEOUT_MS), target, text, voice, rate });",
            "        else\n"
            "          produced =\n"
            "            (await synthesizeImpl({\n"
            "              signal: AbortSignal.timeout(BUILTIN_TIMEOUT_MS),\n"
            "              target,\n"
            "              text,\n"
            "              voice,\n"
            "              rate,\n"
            "              userRoot,\n"
            "              log,\n"
            "            })) ?? target;",
        ),
        ("    return { ok: true, file: target };", "    return { ok: true, file: produced };"),
        (
            "  synthesize?: (input: SynthInput) => Promise<void>;",
            "  synthesize?: (input: SynthInput) => Promise<string | void>;",
        ),
    ]
    for old, new in replacements:
        if old not in text:
            raise PatchError("speak.ts: anchor not found: " + old.strip().splitlines()[0][:60])
        text = text.replace(old, new, 1)
    if not dry:
        write(path, text)
    return {"changed": True, "notes": ["speak.ts:gemini-cache"]}


def patch_ts_cache(path: Path, dry: bool) -> dict:
    text = read(path)
    old = "    if (!name.endsWith('.mp3')) continue;"
    new = "    if (!name.endsWith('.mp3') && !name.endsWith('.wav')) continue;"
    if new in text:
        return {"changed": False, "notes": []}
    if old not in text:
        raise PatchError("cache.ts: prune anchor not found")
    text = text.replace(old, new, 1)
    if not dry:
        write(path, text)
    return {"changed": True, "notes": ["cache.ts:wav-prune"]}


def patch_ts_route(path: Path, dry: bool) -> dict:
    text = read(path)
    old = "    return { kind: 'file', file: result.file, contentType: 'audio/mpeg' };"
    new = "    return { kind: 'file', file: result.file, contentType: result.file.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg' };"
    if new in text:
        return {"changed": False, "notes": []}
    if old not in text:
        raise PatchError("routes/voice.ts: anchor not found")
    text = text.replace(old, new, 1)
    if not dry:
        write(path, text)
    return {"changed": True, "notes": ["routes/voice.ts:content-type"]}


def strip_jsonc(src: str) -> str:
    out: list[str] = []
    in_string = False
    i = 0
    while i < len(src):
        ch = src[i]
        if in_string:
            out.append(ch)
            if ch == "\\" and i + 1 < len(src):
                i += 1
                out.append(src[i])
            elif ch == '"':
                in_string = False
        elif ch == '"':
            in_string = True
            out.append(ch)
        elif ch == "/" and i + 1 < len(src) and src[i + 1] == "/":
            out.append(" ")
            while i + 1 < len(src) and src[i + 1] not in "\r\n":
                i += 1
        elif ch == "/" and i + 1 < len(src) and src[i + 1] == "*":
            end = src.find("*/", i + 2)
            i = len(src) if end < 0 else end + 1
            out.append(" ")
        else:
            out.append(ch)
        i += 1
    return "".join(out)


CONFIG_DEFAULTS = {
    "voiceProvider": "gemini",
    "voiceName": "gemini:Aoede",
    "voiceStyle": "auto",
    "voiceFallback": "ru-RU-SvetlanaNeural",
}


def patch_config(path: Path, dry: bool) -> dict:
    text = read(path)
    original = text
    notes: list[str] = []

    # 1. voiceName всегда ведём на gemini:Aoede — это смысл apply.
    name_match = re.search(r'(?m)^(\s*)"voiceName"\s*:\s*"[^"]*"', text)
    if name_match and '"gemini:Aoede"' not in name_match.group(0):
        text = text[: name_match.start()] + f'{name_match.group(1)}"voiceName": "gemini:Aoede"' + text[name_match.end():]
        notes.append("config:voiceName=gemini:Aoede")

    # 2. Остальные поля добавляем, только если их нет (значения пользователя не перетираем).
    missing = [key for key in CONFIG_DEFAULTS if not re.search(r'(?m)^\s*"' + re.escape(key) + r'"\s*:', text)]
    if missing:
        anchor = re.search(r'(?m)^(\s*)"voiceName"\s*:\s*"[^"]*"\s*,?\s*$', text)
        if not anchor:
            anchor = re.search(r'(?m)^(\s*)"voiceEnabled"\s*:\s*(?:true|false)\s*,?\s*$', text)
        if anchor:
            indent = anchor.group(1)
            line_end = text.find("\n", anchor.end())
            line_end = len(text) if line_end < 0 else line_end
            if not text[anchor.start():line_end].rstrip().endswith(","):
                text = text[:line_end] + "," + text[line_end:]
                line_end += 1
            lines = "".join(f'{indent}"{key}": "{CONFIG_DEFAULTS[key]}",\n' for key in missing)
            text = text[: line_end + 1] + lines + text[line_end + 1:]
        else:
            close = text.rfind("\n}")
            if close < 0:
                raise PatchError("config: cannot find insertion point")
            lines = "".join(f'  "{key}": "{CONFIG_DEFAULTS[key]}",\n' for key in missing)
            text = text[:close] + "\n" + lines.rstrip("\n") + text[close:]
        notes.extend(f"config:+{key}" for key in missing)

    # Проверка: файл должен остаться валидным JSONC, voiceEnabled не включаем.
    try:
        parsed = json.loads(strip_jsonc(text))
    except json.JSONDecodeError as error:
        raise PatchError(f"config: result is not valid JSONC: {error}") from error
    if parsed.get("voiceEnabled") is True:
        notes.append("config:voiceEnabled=true (не трогаем, но озвучка уже включена)")

    changed = text != original
    if changed and not dry:
        write(path, text)
    return {"changed": changed, "notes": notes}


def install_file(template: Path, target: Path, dry: bool) -> dict:
    content = read(template)
    if target.exists() and read(target) == content:
        return {"changed": False, "notes": []}
    if not dry:
        target.parent.mkdir(parents=True, exist_ok=True)
        write(target, content)
    return {"changed": True, "notes": [f"installed:{target.name}"]}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plugin", required=True, help="каталог плагина dsh-pet")
    parser.add_argument("--config", help="main-config.jsonc (необязательно)")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--json", action="store_true", help="машинный вывод")
    args = parser.parse_args()

    root = Path(args.plugin).expanduser().resolve()
    here = Path(__file__).resolve().parent
    report: dict[str, dict] = {}

    try:
        targets = [
            ("lib/index.js", patch_bundle, root / "lib/index.js"),
            ("src/host/voice/voices.ts", patch_ts_voices, root / "src/host/voice/voices.ts"),
            ("src/host/voice/edge.ts", patch_ts_edge, root / "src/host/voice/edge.ts"),
            ("src/host/voice/speak.ts", patch_ts_speak, root / "src/host/voice/speak.ts"),
            ("src/host/voice/cache.ts", patch_ts_cache, root / "src/host/voice/cache.ts"),
            ("src/host/routes/voice.ts", patch_ts_route, root / "src/host/routes/voice.ts"),
        ]
        for label, fn, path in targets:
            if not path.exists():
                raise PatchError(f"missing file: {path}")
            report[label] = fn(path, args.dry_run)

        report["lib/voice-gemini.js"] = install_file(here / "lib" / "voice-gemini.js", root / "lib/voice-gemini.js", args.dry_run)
        report["src/host/voice/gemini.ts"] = install_file(here / "src" / "gemini.ts", root / "src/host/voice/gemini.ts", args.dry_run)

        if args.config:
            config = Path(args.config).expanduser().resolve()
            if not config.exists():
                raise PatchError(f"missing config: {config}")
            report[str(config)] = patch_config(config, args.dry_run)
    except PatchError as error:
        print(f"patch error: {error}", file=sys.stderr)
        return 2

    changed = any(item["changed"] for item in report.values())
    if args.json:
        print(json.dumps({"dryRun": args.dry_run, "changed": changed, "files": report}, ensure_ascii=False, indent=2))
    else:
        for label, item in report.items():
            status = "patched" if item["changed"] else "already-ok"
            extra = (" (" + ", ".join(item["notes"]) + ")") if item["notes"] else ""
            print(f"{status:10} {label}{extra}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
