#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Печатает имя первого питомца из JSONC-конфига; пустая строка при любой ошибке.

Нужен apply.sh, чтобы не переименовывать питомца при установке:
если пользователь уже назвал его по-своему, имя сохраняется.

  python3 tools/read-name.py ~/.dsh/dsh-pet/main-config.jsonc
"""
import json
import sys


def strip_jsonc(src):
    out, i, n, in_str = [], 0, len(src), False
    while i < n:
        ch = src[i]
        if in_str:
            out.append(ch)
            if ch == '\\' and i + 1 < n:
                out.append(src[i + 1]); i += 2; continue
            if ch == '"':
                in_str = False
            i += 1; continue
        if ch == '"':
            in_str = True; out.append(ch); i += 1; continue
        if ch == '/' and i + 1 < n and src[i + 1] == '/':
            while i < n and src[i] not in '\r\n':
                i += 1
            continue
        if ch == '/' and i + 1 < n and src[i + 1] == '*':
            end = src.find('*/', i + 2)
            i = (end + 2) if end >= 0 else n
            continue
        out.append(ch); i += 1
    return ''.join(out)


def main():
    try:
        cfg = json.loads(strip_jsonc(open(sys.argv[1], encoding='utf-8').read()))
        name = cfg['pets'][0]['name']
        print(name.strip() if isinstance(name, str) else '')
    except Exception:
        print('')


if __name__ == '__main__':
    main()
