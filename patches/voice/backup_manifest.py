#!/usr/bin/env python3
"""Бэкапы + манифест для apply-gemini-voice.sh.

Читает план патчера (`--dry-run --json`) из stdin, копирует изменяемые файлы в
`<файл>.bak.<TS>`, создаёт `logs/last-apply.json`. Файлы, которых ещё не было
(провайдер), попадают в `created` — rollback их удалит.
"""

from __future__ import annotations

import json
import os
import shutil
import sys
from datetime import datetime


def main() -> int:
    plan = json.load(sys.stdin)
    plugin, config, stamp, manifest = sys.argv[1:5]

    # Манифест накопительный: apply может менять разные файлы в разные запуски,
    # а rollback должен уметь вернуть всё сразу. Новые бэкапы перекрывают старые
    # для того же файла; created — объединение (файл, которого не было до первого apply).
    previous: dict = {}
    if os.path.exists(manifest):
        try:
            with open(manifest, encoding="utf-8") as handle:
                previous = json.load(handle)
        except (OSError, json.JSONDecodeError):
            previous = {}
    merged = {item["file"]: item for item in previous.get("backups", [])}
    created: set[str] = set(previous.get("created", []))
    new_backups: list[dict[str, str]] = []
    for name, item in plan.get("files", {}).items():
        if not item.get("changed"):
            continue
        path = name if os.path.isabs(name) else os.path.join(plugin, name)
        if os.path.exists(path):
            backup = f"{path}.bak.{stamp}"
            shutil.copy2(path, backup)
            merged[path] = {"file": path, "backup": backup}
            new_backups.append(merged[path])
            print(f"backup: {path}")
        else:
            created.add(path)
            print(f"create: {path}")

    data = {
        "appliedAt": datetime.now().isoformat(timespec="seconds"),
        "plugin": plugin,
        "config": config,
        "backups": list(merged.values()),
        "created": sorted(created),
    }
    os.makedirs(os.path.dirname(manifest), exist_ok=True)
    with open(manifest, "w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    print(f"manifest: {manifest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
