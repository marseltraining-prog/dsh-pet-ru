#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Пишет main-config.jsonc из шаблона, подставляя имя питомца.

Шаблон — обычный JSONC с комментариями; заменяется первое поле
`"name": "..."` (имя первого питомца), комментарии и форматирование сохраняются.

  python3 tools/write-config.py config/main-config.jsonc ~/.dsh/dsh-pet/main-config.jsonc "Бетси"
"""
import json
import re
import sys


def main():
    src, dst, name = sys.argv[1], sys.argv[2], sys.argv[3]
    text = open(src, encoding='utf-8').read()
    pattern = re.compile(r'"name":\s*"[^"]*"')
    if not pattern.search(text):
        raise SystemExit('в шаблоне нет поля с именем питомца')
    text = pattern.sub('"name": ' + json.dumps(name, ensure_ascii=False), text, count=1)
    with open(dst, 'w', encoding='utf-8') as f:
        f.write(text)


if __name__ == '__main__':
    main()
