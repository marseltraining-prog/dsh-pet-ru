#!/usr/bin/env python3
"""Идемпотентный патч шрифта и метрик речевого пузыря dsh-pet.

Меняет только шрифтовые строки (font-family / @font-face) и метрики бабла,
не трогая остальную логику плагина и локализацию. Каждая замена — точная
строка; если её нет и новой строки тоже нет, скрипт падает, а не «патчит
наугад» (защита от другой версии бандла).

  python3 patch-font.py --plugin DIR [--check|--dry-run]

--check   только проверить, что патч уже применён (ничего не пишет)
--dry-run показать план, ничего не писать
"""
from __future__ import annotations

import argparse
import hashlib
import re
import sys
from pathlib import Path

NEW_FONTS = ("BalsamiqSans", "Pangolin")
FONT_FILES = ("BalsamiqSans-Regular.ttf", "BalsamiqSans-Bold.ttf", "Pangolin-Regular.ttf")

# ── точные строки ────────────────────────────────────────────────────────────
# 1) стек --dsh-pet-font-family: двойные кавычки внутри JS-строки экранированы
STACK_DQ_OLD = 'var(--dsh-pet-font-family,\\"ShangshouSoftCandy\\"'
STACK_DQ_NEW = 'var(--dsh-pet-font-family,\\"BalsamiqSans\\",\\"Pangolin\\",\\"ShangshouSoftCandy\\"'
# 2) то же в одинарных кавычках
STACK_SQ_OLD = "var(--dsh-pet-font-family,'ShangshouSoftCandy'"
STACK_SQ_NEW = "var(--dsh-pet-font-family,'BalsamiqSans','Pangolin','ShangshouSoftCandy'"
# 3) FONT_PRESETS: id "candy" — дефолтный стек, который получает конфиг
CANDY_OLD = 'stack: "\\"ShangshouSoftCandy\\",'
CANDY_NEW = 'stack: "\\"BalsamiqSans\\",\\"Pangolin\\",\\"ShangshouSoftCandy\\",'

# 4) метрики бабла в web-бандле
WEB_PAD_OLD = "padding:calc(var(--f)*0.4835) calc(var(--f)*0.6593)"
WEB_PAD_NEW = "padding:calc(var(--f)*0.36) calc(var(--f)*0.55)"
WEB_LH_OLD = "font-size:var(--f);line-height:1.6;z-index:3;"
WEB_LH_NEW = "font-size:var(--f);line-height:1.3;letter-spacing:0;font-weight:700;text-transform:none;z-index:3;"
WEB_WHISPER_OLD = '".dsh-pet-bubble.dsh-pet-whisper{font-size:calc(var(--f)*0.7473);min-width:calc(var(--f)*2.1978);max-width:min(calc(var(--f)*10.989),100%)}"'
WEB_WHISPER_NEW = '".dsh-pet-bubble.dsh-pet-whisper{font-size:calc(var(--f)*0.7473);min-width:calc(var(--f)*2.1978);max-width:min(calc(var(--f)*10.989),100%);font-weight:400}"'

# 5) desktop: index.html (форматированный CSS)
HTML_PAD_OLD = "padding: calc(var(--f) * 0.4835) calc(var(--f) * 0.6593);"
HTML_PAD_NEW = "padding: calc(var(--f) * 0.36) calc(var(--f) * 0.55);"
HTML_LH_OLD = "        line-height: 1.6;"
HTML_LH_NEW = ("        line-height: 1.3;\n"
               "        letter-spacing: 0;\n"
               "        font-weight: 700;\n"
               "        text-transform: none;")
HTML_STACK_OLD = "          --dsh-pet-font-family,\n          'ShangshouSoftCandy',"
HTML_STACK_NEW = ("          --dsh-pet-font-family,\n"
                  "          'BalsamiqSans',\n"
                  "          'Pangolin',\n"
                  "          'ShangshouSoftCandy',")
HTML_WHISPER_OLD = """      .pet-bubble.is-whisper {
        font-size: calc(var(--f) * 0.7473);
        min-width: calc(var(--f) * 2.1978);
        max-width: min(calc(var(--f) * 10.989), 100%);
      }"""
HTML_WHISPER_NEW = """      .pet-bubble.is-whisper {
        font-size: calc(var(--f) * 0.7473);
        min-width: calc(var(--f) * 2.1978);
        max-width: min(calc(var(--f) * 10.989), 100%);
        font-weight: 400;
      }"""

# 6) desktop: BUBBLE_METRICS (высота бабла считается по этим числам)
METRICS_LH_OLD = "lineHeight: 1.6,"
METRICS_LH_NEW = "lineHeight: 1.3,"
METRICS_PAD_OLD = "padY: .4835,"
METRICS_PAD_NEW = "padY: .36,"

# 7) @font-face
SHANGSHOU_CLIENT = ('`@font-face{font-family:"ShangshouSoftCandy";src:url("${ROUTE_PATH}/font/上首软糖体.ttf")'
                    ' format("truetype");font-display:swap;font-weight:400}`,')
FACES_CLIENT = "\n\t".join([
    '`@font-face{font-family:"BalsamiqSans";src:url("${ROUTE_PATH}/font/BalsamiqSans-Regular.ttf")'
    ' format("truetype");font-display:swap;font-weight:400}`,',
    '`@font-face{font-family:"BalsamiqSans";src:url("${ROUTE_PATH}/font/BalsamiqSans-Bold.ttf")'
    ' format("truetype");font-display:swap;font-weight:700}`,',
    '`@font-face{font-family:"Pangolin";src:url("${ROUTE_PATH}/font/Pangolin-Regular.ttf")'
    ' format("truetype");font-display:swap;font-weight:400}`,',
])
FACE_CLIENT_NEW = SHANGSHOU_CLIENT + "\n\t" + FACES_CLIENT
SHANGSHOU_RENDERER = ("'@font-face{font-family:\"ShangshouSoftCandy\";src:url(\"' +\n"
                      "    BASE +\n"
                      "    '/font/' +\n"
                      "    encodeURIComponent('上首软糖体') +\n"
                      "    '.ttf\") format(\"truetype\");font-display:swap;font-weight:400}' +")
FACES_RENDERER = "\n    ".join([
    "'@font-face{font-family:\"BalsamiqSans\";src:url(\"' + BASE + '/font/BalsamiqSans-Regular.ttf\") format(\"truetype\");font-display:swap;font-weight:400}' +",
    "'@font-face{font-family:\"BalsamiqSans\";src:url(\"' + BASE + '/font/BalsamiqSans-Bold.ttf\") format(\"truetype\");font-display:swap;font-weight:700}' +",
    "'@font-face{font-family:\"Pangolin\";src:url(\"' + BASE + '/font/Pangolin-Regular.ttf\") format(\"truetype\");font-display:swap;font-weight:400}' +",
])
FACE_RENDERER_NEW = SHANGSHOU_RENDERER + "\n    " + FACES_RENDERER

TARGETS = {
    "lib/client.js": [
        ("font-face", SHANGSHOU_CLIENT, FACE_CLIENT_NEW),
        ("candy preset", CANDY_OLD, CANDY_NEW),
        ("bubble padding", WEB_PAD_OLD, WEB_PAD_NEW),
        ("bubble metrics", WEB_LH_OLD, WEB_LH_NEW),
        ("whisper weight", WEB_WHISPER_OLD, WEB_WHISPER_NEW),
        ("stack dq", STACK_DQ_OLD, STACK_DQ_NEW),
        ("stack sq", STACK_SQ_OLD, STACK_SQ_NEW),
    ],
    "runtime/electron-helper/shared-core.js": [
        ("candy preset", CANDY_OLD, CANDY_NEW),
        ("bubble height metrics", METRICS_LH_OLD, METRICS_LH_NEW),
        ("bubble height padding", METRICS_PAD_OLD, METRICS_PAD_NEW),
        ("stack dq", STACK_DQ_OLD, STACK_DQ_NEW),
        ("stack sq", STACK_SQ_OLD, STACK_SQ_NEW),
    ],
    "runtime/electron-helper/index.html": [
        ("bubble padding", HTML_PAD_OLD, HTML_PAD_NEW),
        ("bubble metrics", HTML_LH_OLD, HTML_LH_NEW),
        ("bubble stack", HTML_STACK_OLD, HTML_STACK_NEW),
        ("whisper weight", HTML_WHISPER_OLD, HTML_WHISPER_NEW),
    ],
    "runtime/electron-helper/renderer.js": [
        ("font-face", SHANGSHOU_RENDERER, FACE_RENDERER_NEW),
    ],
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def apply_replacements(text: str, rules, rel: str, problems: list[str]):
    """Возвращает (новый текст, список выполненных замен).

    Идемпотентность: если в тексте уже есть итоговая строка `new` — правило
    считается применённым и повторно не вставляется (важно для @font-face:
    якорь старого шрифта остаётся на месте).
    """
    done: list[str] = []
    for name, old, new in rules:
        if new in text:
            done.append(name + " (already)")
        elif old in text:
            text = text.replace(old, new)
            done.append(name)
        else:
            problems.append(f"{rel}: {name}: не найдена ни старая, ни новая строка")
    return text, done


def check_state(plugin: Path) -> list[str]:
    """Проверяет, что патч на месте. Возвращает список ошибок."""
    errs: list[str] = []
    client = (plugin / "lib/client.js").read_text(encoding="utf-8")
    core = (plugin / "runtime/electron-helper/shared-core.js").read_text(encoding="utf-8")
    html = (plugin / "runtime/electron-helper/index.html").read_text(encoding="utf-8")
    renderer = (plugin / "runtime/electron-helper/renderer.js").read_text(encoding="utf-8")

    for rel, text, needles in [
        ("lib/client.js", client, [
            'font-family:"BalsamiqSans"', 'font-family:"Pangolin"',
            '\\"BalsamiqSans\\",\\"Pangolin\\",\\"ShangshouSoftCandy\\"',
            "padding:calc(var(--f)*0.36) calc(var(--f)*0.55)",
            "line-height:1.3;letter-spacing:0;font-weight:700;text-transform:none",
        ]),
        ("runtime/electron-helper/shared-core.js", core, [
            '\\"BalsamiqSans\\",\\"Pangolin\\",\\"ShangshouSoftCandy\\"',
            "lineHeight: 1.3,", "padY: .36,",
        ]),
        ("runtime/electron-helper/index.html", html, [
            "'BalsamiqSans',", "'Pangolin',",
            "padding: calc(var(--f) * 0.36) calc(var(--f) * 0.55);",
            "line-height: 1.3;", "letter-spacing: 0;", "font-weight: 700;",
            "text-transform: none;",
        ]),
        ("runtime/electron-helper/renderer.js", renderer, [
            'font-family:"BalsamiqSans"', 'font-family:"Pangolin"',
        ]),
    ]:
        for n in needles:
            if n not in text:
                errs.append(f"{rel}: нет «{n}»")

    # Balsamiq должен стоять в стеке ПЕРВЫМ, до старого шрифта
    for rel, text in (("lib/client.js", client), ("runtime/electron-helper/shared-core.js", core)):
        for m in re.finditer(r"var\(--dsh-pet-font-family,(.*?)\)", text):
            stack = m.group(1)
            if "ShangshouSoftCandy" not in stack:
                continue
            if stack.find("BalsamiqSans") == -1 or stack.find("BalsamiqSans") > stack.find("ShangshouSoftCandy"):
                errs.append(f"{rel}: BalsamiqSans не первый в стеке: {stack[:90]}")
    # ...и в форматированном CSS desktop-окна
    start = html.find("font-family: var(")
    i_b = html.find("'BalsamiqSans'", start)
    i_s = html.find("'ShangshouSoftCandy'", start)
    if start == -1 or i_b == -1 or i_s == -1 or not (start < i_b < i_s):
        errs.append("runtime/electron-helper/index.html: BalsamiqSans не первый в font-family бабла")
    # шрифты на месте
    for f in FONT_FILES:
        p = plugin / "assets/fonts" / f
        if not p.is_file() or p.stat().st_size < 50_000:
            errs.append(f"assets/fonts/{f}: нет файла или он подозрительно мал")
    return errs


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--plugin", default=str(Path.home() / ".dsh/profiles/desktop/node_modules/dsh-pet"))
    ap.add_argument("--check", action="store_true", help="только проверить состояние")
    ap.add_argument("--dry-run", action="store_true", help="показать план, ничего не писать")
    args = ap.parse_args()
    plugin = Path(args.plugin).expanduser().resolve()
    if not (plugin / "package.json").is_file() or not (plugin / "lib/client.js").is_file():
        print(f"не похоже на dsh-pet: {plugin}", file=sys.stderr)
        return 2

    if args.check:
        errs = check_state(plugin)
        if errs:
            print("ПРОВЕРКА: патч НЕ применён целиком:")
            for e in errs:
                print("  ✗", e)
            return 1
        print(f"ПРОВЕРКА OK: шрифт и метрики бабла на месте ({plugin})")
        return 0

    problems: list[str] = []
    plan: list[tuple[Path, str, str]] = []
    for rel, rules in TARGETS.items():
        path = plugin / rel
        if not path.is_file():
            problems.append(f"{rel}: файл не найден")
            continue
        before = path.read_text(encoding="utf-8")
        after, done = apply_replacements(before, rules, rel, problems)
        if after != before:
            plan.append((path, before, after))
        print(f"{rel}: {', '.join(done) if done else 'изменений нет'}")

    if problems:
        print("\nОШИБКИ:", file=sys.stderr)
        for p in problems:
            print("  ✗", p, file=sys.stderr)
        print("\nПатч не применён: строки-якоря не совпали. Проверьте версию dsh-pet.", file=sys.stderr)
        return 1

    if args.dry_run:
        print(f"\n[dry-run] изменений: {len(plan)} файл(ов)")
        return 0

    for path, _before, after in plan:
        path.write_text(after, encoding="utf-8")
        print(f"записан {path}")

    errs = check_state(plugin)
    if errs:
        print("\nПОСЛЕ ПАТЧА ПРОВЕРКА НЕ ПРОШЛА:", file=sys.stderr)
        for e in errs:
            print("  ✗", e, file=sys.stderr)
        return 1
    print("\nOK: @font-face добавлены, BalsamiqSans первый в стеке, метрики 1.3/.36em")
    return 0


if __name__ == "__main__":
    sys.exit(main())
