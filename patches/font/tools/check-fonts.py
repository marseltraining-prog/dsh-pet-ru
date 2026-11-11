#!/usr/bin/env python3
"""Доказательство покрытия кириллицы и метрик кандидатов (fontTools).

  python3 tools/check-fonts.py [--old PATH] [--json OUT]

Проверяет:
  * наличие всех 64 букв 0x0410–0x044F (А–я) + Ё/ё;
  * пропорциональность: advance кириллицы (у «上首软糖体» каждая буква = 0.879em,
    поэтому слова выглядят как моноширинный набор с дырами);
  * ширину контрольной фразы в px при font-size 21px (как в бабле 462px).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from fontTools.ttLib import TTFont

HERE = Path(__file__).resolve().parent.parent
PHRASE = "М-м... забыла, зачем к кружке подплыла. Ладно, хоть печеньку утащу."
CYR = [chr(c) for c in range(0x0410, 0x0450)]


def probe(path: Path) -> dict:
    ft = TTFont(path, lazy=True)
    cmap = ft.getBestCmap()
    hmtx = ft["hmtx"]
    upm = ft["head"].unitsPerEm
    os2 = ft["OS/2"]

    def adv(ch: str) -> float | None:
        g = cmap.get(ord(ch))
        return hmtx[g][0] / upm if g else None

    missing = [ch for ch in CYR if ord(ch) not in cmap]
    have = [ch for ch in CYR if ord(ch) in cmap]
    cyr_widths = [adv(ch) for ch in have]
    phrase_em = 0.0
    for ch in PHRASE:
        w = adv(ch)
        if w is None:
            # пробел/дефис/точка тоже в cmap; если нет — считаем 0.5em
            w = 0.5
        phrase_em += w
    return {
        "file": path.name,
        "family": ft["name"].getDebugName(1),
        "style": ft["name"].getDebugName(2),
        "weight": os2.usWeightClass,
        "unitsPerEm": upm,
        "glyphs": len(ft.getGlyphOrder()),
        "cyrillic": f"{len(have)}/{len(CYR)}",
        "cyrillic_missing": "".join(missing) or None,
        "yo_yo": (0x0401 in cmap, 0x0451 in cmap),
        "avg_cyr_advance_em": round(sum(cyr_widths) / len(cyr_widths), 3) if cyr_widths else None,
        "distinct_cyr_advances": len({round(w, 4) for w in cyr_widths}),
        "phrase_em": round(phrase_em, 2),
        "phrase_px_at_21": round(phrase_em * 21, 1),
        "cap_height": getattr(os2, "sCapHeight", None),
        "x_height": getattr(os2, "sxHeight", None),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--old", default=str(Path.home() / ".dsh/profiles/desktop/node_modules/dsh-pet/assets/fonts/上首软糖体.ttf"))
    ap.add_argument("--json", default=str(HERE / "coverage.json"))
    args = ap.parse_args()

    rows = [probe(p) for p in sorted((HERE / "src").glob("*.ttf"))]
    old_path = Path(args.old)
    if old_path.is_file():
        rows.append(probe(old_path))

    print(f"{'файл':38} {'weight':>6} {'кир.':>7} {'ср.adv':>7} {'разных':>7} {'фраза,px':>9}")
    for r in rows:
        print(f"{r['file'][:38]:38} {r['weight']:>6} {r['cyrillic']:>7} "
              f"{str(r['avg_cyr_advance_em']):>7} {r['distinct_cyr_advances']:>7} {r['phrase_px_at_21']:>9}")

    Path(args.json).write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nJSON: {args.json}")
    bad = [r for r in rows if r["cyrillic"] != f"{len(CYR)}/{len(CYR)}"]
    if bad:
        print("БЕЗ ПОЛНОЙ КИРИЛЛИЦЫ: " + ", ".join(r["file"] for r in bad))
    return 0


if __name__ == "__main__":
    sys.exit(main())
