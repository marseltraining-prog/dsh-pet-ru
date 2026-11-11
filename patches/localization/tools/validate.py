#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Проверка русской установки dsh-pet без запуска приложения.

Проверяет:
  1. main-config.jsonc разбирается как JSONC и имеет ожидаемую форму
     (один питомец, display=desktop, size=462, 6 уровней статуса, 6+3+6 событий, сон, baifan);
  2. в конфиге нет ни одного китайского иероглифа (ни в текстах, ни в комментариях);
  3. каждому имени анимации соответствует файл в <PET_HOME>/main-animation/webm/;
  4. каждому мему соответствует файл в <PET_HOME>/memes/, описание непустое;
  5. набор имён совпадает с data/anim-map.tsv (в обе стороны), имена уникальны;
  6. патчи бандлов применены (tools/patch-bundles.py --check);
  7. русские словари страницы настроек и панели чата в бандле не содержат
     китайских строк и совпадают по числу ключей с китайскими.

Запуск:
  python3 tools/validate.py --plugin <dsh-pet> --pet-home <~/.dsh/dsh-pet> \
      [--config <main-config.jsonc>]
Код возврата 0 = всё сошлось.
"""
import argparse
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CJK = re.compile(r'[\u4e00-\u9fff]')

problems = []
ok_count = 0


def ok(msg):
    global ok_count
    ok_count += 1
    print('  OK   ' + msg)


def bad(msg):
    problems.append(msg)
    print('  FAIL ' + msg)


def strip_jsonc(src):
    """Тот же алгоритм, что в плагине (config/jsonc.ts): убрать комментарии вне строк."""
    out = []
    i, n = 0, len(src)
    in_str = False
    while i < n:
        ch = src[i]
        if in_str:
            out.append(ch)
            if ch == '\\' and i + 1 < n:
                out.append(src[i + 1])
                i += 2
                continue
            if ch == '"':
                in_str = False
            i += 1
            continue
        if ch == '"':
            in_str = True
            out.append(ch)
            i += 1
            continue
        if ch == '/' and i + 1 < n and src[i + 1] == '/':
            while i < n and src[i] not in '\r\n':
                i += 1
            continue
        if ch == '/' and i + 1 < n and src[i + 1] == '*':
            end = src.find('*/', i + 2)
            if end < 0:
                raise SyntaxError('незакрытый блочный комментарий')
            out.append(src[i:end + 2].replace('\r', ' ').replace('\n', ' '))
            i = end + 2
            continue
        out.append(ch)
        i += 1
    return ''.join(out)


def read_tsv(path, min_cols=2):
    """TSV с комментариями (#). Возвращает строки, дополненные до 3 колонок."""
    rows = []
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.rstrip('\n')
            if not line or line.startswith('#'):
                continue
            parts = line.split('\t')
            if len(parts) < min_cols:
                raise SystemExit(f'битая строка в {path}: {line!r}')
            parts = (parts + ['', '', ''])[:3]
            rows.append(parts)
    return rows


def regions(text):
    marks = [(m.start(), m.group(1)) for m in re.finditer(r'//#region ([^\n]+)', text)]
    out = {}
    for i, (off, name) in enumerate(marks):
        end = marks[i + 1][0] if i + 1 < len(marks) else len(text)
        out.setdefault(name, []).append((off, end))
    return out, marks


def collect_names(anim):
    names = []
    for key in ('idle', 'turn', 'drag', 'clicks'):
        names += list(anim.get(key) or [])
    for m in (anim.get('moves') or {}).get('actions') or []:
        names.append(m.get('name'))
    for c in anim.get('categories') or []:
        names += list(c.get('actions') or [])
    for pool in (anim.get('events') or {}).values():
        for slot in pool:
            names += [slot] if isinstance(slot, str) else list(slot)
    for s in anim.get('sleep') or []:
        for ph in ('start', 'loop', 'end'):
            names += list(s.get(ph) or [])
    names += list(anim.get('baifan') or [])
    return [n for n in names if isinstance(n, str)]


def check_config(path):
    print('[1] конфигурация')
    raw = open(path, encoding='utf-8').read()
    try:
        cfg = json.loads(strip_jsonc(raw))
    except Exception as exc:  # noqa: BLE001
        bad(f'{path}: не разбирается как JSONC — {exc}')
        return None
    ok(f'{path}: JSONC разбирается')

    hits = CJK.findall(raw)
    if hits:
        bad(f'в конфиге остались китайские иероглифы: {len(hits)} шт., например {hits[:5]}')
    else:
        ok('в конфиге нет китайских иероглифов (включая комментарии)')

    pets = cfg.get('pets')
    if not isinstance(pets, list) or len(pets) != 1:
        bad(f'ожидался ровно один питомец, найдено {len(pets) if isinstance(pets, list) else pets!r}')
    else:
        p = pets[0]
        pid = p.get('id')
        ok(f'питомец: id={pid!r}, имя={p.get("name")!r}, size={p.get("size")!r}, display={p.get("display")!r}')
        if p.get('display') != 'desktop':
            bad('display должен быть "desktop" (только плавающее окно, без копии в странице)')
        else:
            ok('display="desktop" — одно плавающее окно, внутриоконной копии нет')
        if p.get('size') != 462:
            bad(f'size={p.get("size")!r}, ожидалось 462')
        pos = p.get('position') or {}
        if pos.get('corner') != 'top-right':
            bad(f'position.corner={pos.get("corner")!r}, ожидалось top-right')
        else:
            ok(f'позиция: top-right, отступы {pos.get("marginX")}x{pos.get("marginY")}')

    texts = cfg.get('workStatusTexts')
    if not isinstance(texts, list) or len(texts) != 6:
        bad(f'workStatusTexts: ожидалось 6 уровней, получено {texts!r}' if not isinstance(texts, list) else
            f'workStatusTexts: ожидалось 6 уровней, получено {len(texts)}')
    elif any(not isinstance(t, list) or not (2 <= len(t) <= 3) or any(not isinstance(s, str) or not s.strip() for s in t)
             for t in texts):
        bad('workStatusTexts: в каждом уровне должно быть 2–3 непустые строки')
    else:
        ok(f'workStatusTexts: 6 уровней, вариантов {[len(t) for t in texts]}')

    for key, n in (('sleepStartTexts', 2), ('sleepEndTexts', 2), ('sleepRefuseTexts', 3)):
        v = cfg.get(key)
        if not isinstance(v, list) or not v or any(not isinstance(s, str) or not s.strip() for s in v):
            bad(f'{key}: нужен непустой массив непустых строк')
        else:
            ok(f'{key}: {len(v)} строки')

    prompt = cfg.get('whisperPrompt')
    if not isinstance(prompt, str) or len(prompt) < 40:
        bad('whisperPrompt: пустой или слишком короткий')
    else:
        ok(f'whisperPrompt: {len(prompt)} символов')

    anim = cfg.get('animations')
    if not isinstance(anim, dict):
        bad('нет секции animations')
        return cfg
    ev = anim.get('events') or {}
    if len(ev.get('balance') or []) != 6:
        bad('events.balance: ожидалось 6 уровней')
    if len(ev.get('workStatus') or []) != 6:
        bad('events.workStatus: ожидалось 6 уровней')
    if not (ev.get('whisper') or []):
        bad('events.whisper: пусто')
    if not isinstance(anim.get('sleep'), list) or not anim['sleep']:
        bad('animations.sleep: пусто (не будет пункта «Спать»)')
    if not isinstance(anim.get('baifan'), list) or len(anim['baifan']) != 5:
        bad('animations.baifan: должно быть ровно 5 имён')
    cats = anim.get('categories') or []
    weights = sum(int(c.get('weight') or 0) for c in cats)
    w = cfg.get('animationWeights') or {}
    total = int(w.get('idle', 0)) + int(w.get('turn', 0)) + int(w.get('move', 0)) + weights
    if total != 100:
        bad(f'веса: idle+turn+move+категории = {total}, ожидалось 100')
    else:
        ok(f'веса: 10 + 5 + 5 + {weights} = 100')

    memes = cfg.get('memes')
    if not isinstance(memes, dict) or len(memes) != 27:
        bad(f'memes: ожидалось 27 записей, получено {len(memes) if isinstance(memes, dict) else memes!r}')
    return cfg


def check_assets(cfg, pet_home, plugin):
    print('[2] файлы анимаций и мемов')
    anim = cfg['animations']
    names = collect_names(anim)
    dup = {n for n in names if names.count(n) > 1}
    if dup:
        bad(f'имена анимаций повторяются: {sorted(dup)[:5]}')
    else:
        ok(f'имена анимаций уникальны: {len(names)}')

    bad_names = [n for n in names if CJK.search(n) or '/' in n or '\\' in n or '"' in n or n != n.strip()]
    if bad_names:
        bad(f'недопустимые имена анимаций: {bad_names[:5]}')
    else:
        ok('в именах анимаций нет китайских символов и разделителей пути')

    user_dir = os.path.join(pet_home, 'main-animation', 'webm')
    pkg_dir = os.path.join(plugin, 'assets', 'webm')
    missing = []
    for n in names:
        if os.path.exists(os.path.join(user_dir, n + '.webm')):
            continue
        missing.append(n)
    if missing:
        bad(f'нет файлов в {user_dir}: {len(missing)} шт., например {missing[:5]}')
    else:
        ok(f'каждому из {len(names)} имён соответствует {user_dir}/<имя>.webm')

    rows = read_tsv(os.path.join(ROOT, 'data', 'anim-map.tsv'))
    map_new = [r[2] for r in rows]
    if len(map_new) != len(set(map_new)):
        bad('в anim-map.tsv повторяются русские имена')
    elif set(map_new) != set(names):
        only_cfg = sorted(set(names) - set(map_new))[:5]
        only_map = sorted(set(map_new) - set(names))[:5]
        bad(f'конфиг и anim-map.tsv расходятся: только в конфиге {only_cfg}, только в карте {only_map}')
    else:
        ok(f'anim-map.tsv покрывает все {len(rows)} имён и совпадает с конфигом')

    src_missing = [r[1] for r in rows if not os.path.exists(os.path.join(pkg_dir, r[1] + '.webm'))]
    if src_missing:
        bad(f'в пакете нет исходных webm: {src_missing[:5]}')
    else:
        ok(f'исходные webm на месте в пакете: {len(rows)}')

    memes = cfg['memes']
    mrows = read_tsv(os.path.join(ROOT, 'data', 'meme-map.tsv'))
    mnew = [r[1] for r in mrows]
    if len(mnew) != len(set(mnew)):
        bad('в meme-map.tsv повторяются русские имена')
    elif set(mnew) != set(memes.keys()):
        only_cfg = sorted(set(memes) - set(mnew))[:5]
        only_map = sorted(set(mnew) - set(memes))[:5]
        bad(f'мемы: конфиг и meme-map.tsv расходятся: {only_cfg} / {only_map}')
    else:
        ok(f'meme-map.tsv покрывает все {len(mrows)} мемов и совпадает с конфигом')

    memes_dir = os.path.join(pet_home, 'memes')
    mmissing = [n for n in memes if not os.path.exists(os.path.join(memes_dir, n + '.png'))]
    if mmissing:
        bad(f'нет картинок в {memes_dir}: {len(mmissing)} шт., например {mmissing[:5]}')
    else:
        ok(f'каждому из {len(memes)} мемов соответствует {memes_dir}/<имя>.png')
    empty = [n for n, d in memes.items() if not isinstance(d, str) or not d.strip()]
    if empty:
        bad(f'пустые описания мемов: {empty[:5]}')
    else:
        ok('у всех мемов непустые описания')

    pkg_missing = [r[0] for r in mrows if not os.path.exists(os.path.join(plugin, 'assets', 'memes', r[0] + '.png'))]
    if pkg_missing:
        bad(f'в пакете нет исходных png: {pkg_missing[:5]}')
    else:
        ok(f'исходные png на месте в пакете: {len(mrows)}')


def check_bundles(plugin):
    print('[3] патчи бандлов')
    proc = subprocess.run([sys.executable, os.path.join(HERE, 'patch-bundles.py'),
                           '--plugin', plugin, '--check'],
                          capture_output=True, text=True)
    for line in (proc.stdout or '').strip().splitlines():
        print('  ' + line)
    if proc.returncode != 0:
        bad('не все строки интерфейса переведены (см. вывод выше)')
        for line in (proc.stderr or '').strip().splitlines():
            print('  ' + line)
    else:
        ok('все записи спецификации применены, китайских подписей меню не осталось')


def check_locales(plugin):
    print('[4] русские словари в бандле')
    path = os.path.join(plugin, 'lib', 'client.js')
    text = open(path, encoding='utf-8').read()
    regs, _ = regions(text)
    for pair in (('src/client/settings/locales/ru.ts', 'src/client/settings/locales/zh.ts',
                  'страница настроек'),
                 ('src/client/chat/locales/ru.ts', 'src/client/chat/locales/zh.ts',
                  'панель чата')):
        ru_name, zh_name, label = pair
        ru_reg = regs.get(ru_name)
        zh_reg = regs.get(zh_name)
        if not ru_reg or not zh_reg:
            bad(f'{label}: в бандле нет региона {ru_name} или {zh_name}')
            continue
        a, b = ru_reg[0]
        ru_txt = text[a:b]
        za, zb = zh_reg[0]
        zh_txt = text[za:zb]
        ru_keys = len(re.findall(r'(?m)^\t(?:[A-Za-z_$][\w$]*|"[^"]+"):', ru_txt))
        zh_keys = len(re.findall(r'(?m)^\t(?:[A-Za-z_$][\w$]*|"[^"]+"):', zh_txt))
        ru_cjk = [l for l in ru_txt.splitlines() if CJK.search(l) and not l.lstrip().startswith(('//', '*', '/*'))]
        if ru_keys != zh_keys:
            bad(f'{label}: ключей в ru {ru_keys}, в zh {zh_keys} — словарь неполный')
        else:
            ok(f'{label}: ru и zh совпадают по числу ключей ({ru_keys})')
        if ru_cjk:
            bad(f'{label}: в ru-словаре остались китайские строки: {ru_cjk[:2]}')
        else:
            ok(f'{label}: в ru-словаре нет китайских строк')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--plugin', default=os.environ.get(
        'PET_PLUGIN', os.path.expanduser('~/.dsh/profiles/desktop/node_modules/dsh-pet')))
    ap.add_argument('--pet-home', default=os.environ.get(
        'PET_HOME', os.path.expanduser('~/.dsh/dsh-pet')))
    ap.add_argument('--config', default=None)
    args = ap.parse_args()
    config = args.config or os.path.join(args.pet_home, 'main-config.jsonc')

    print(f'плагин:   {args.plugin}')
    print(f'данные:   {args.pet_home}')
    print(f'конфиг:   {config}')
    print()

    if not os.path.isdir(args.plugin):
        print('FAIL: нет каталога плагина', file=sys.stderr)
        return 2
    if not os.path.exists(config):
        bad(f'нет файла конфигурации {config}')

    cfg = check_config(config) if os.path.exists(config) else None
    if cfg is not None:
        check_assets(cfg, args.pet_home, args.plugin)
    check_bundles(args.plugin)
    check_locales(args.plugin)

    print()
    if problems:
        print(f'ИТОГ: ПРОВАЛ — {len(problems)} проблем(ы), успешных проверок {ok_count}')
        return 1
    print(f'ИТОГ: ВСЁ ХОРОШО — {ok_count} проверок пройдено')
    return 0


if __name__ == '__main__':
    sys.exit(main())
