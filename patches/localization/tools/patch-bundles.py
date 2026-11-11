#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Идемпотентный патчер бандлов dsh-pet.

Патчатся:
  • lib/client.js, lib/index.js — браузерная и хостовая половины;
  • runtime/electron-helper/shared-core.js — общие модули настольного окна
    (меню, пузыри, задачи, диалог, баланс) — при display="desktop" рисует именно он;
  • runtime/electron-helper/sprite/menu.js и другие файлы окна — подписи меню,
    заголовок окна, лоток.

Каждая запись спецификации адресуется либо модулем (маркер `//#region src/...`),
либо (для файлов без регионов) всем файлом (module = null) и точной подстрокой.
Поэтому:

  • одинаковые строки в zh-словаре страницы настроек и в отладочных логах
    не затрагиваются (они в других регионах);
  • повторный запуск ничего не дублирует: если искомой подстроки уже нет,
    а замена на месте — запись считается применённой ранее и пропускается;
  • если нет ни того, ни другого — это ошибка, а не «молча ничего».

Запуск:
  python3 tools/patch-bundles.py --plugin ~/.dsh/profiles/desktop/node_modules/dsh-pet
  python3 tools/patch-bundles.py --plugin ... --check     # только проверка
"""
import argparse
import json
import os
import re
import shutil
import sys
import tempfile

REGION_RE = re.compile(r'//#region ([^\n]+)')


def split_regions(text):
    """Текст → (префикс, [(имя модуля, сегмент)]). Префикс — всё до первого //#region."""
    marks = [(m.start(), m.group(1)) for m in REGION_RE.finditer(text)]
    if not marks:
        return '', [[None, text]]
    starts = [m[0] for m in marks]
    prefix = text[: starts[0]]
    segs = []
    for i, (off, name) in enumerate(marks):
        end = starts[i + 1] if i + 1 < len(starts) else len(text)
        segs.append([name, text[off:end]])
    return prefix, segs


def bundle_path(plugin, bundle):
    """Ключ спецификации → путь. Ключи с «/» — путь от корня плагина, иначе lib/<ключ>."""
    if '/' in bundle:
        return os.path.join(plugin, bundle)
    return os.path.join(plugin, 'lib', bundle)


def apply_bundle(path, entries, check, dry_run, backup_dir=None, rel=None):
    with open(path, encoding='utf-8') as f:
        text = f.read()
    prefix, segs = split_regions(text)
    has_regions = any(name for name, _ in segs)

    by_module = {}
    for idx, (name, _seg) in enumerate(segs):
        by_module.setdefault(name, []).append(idx)

    applied = skipped = 0
    problems = []
    for e in entries:
        module = e.get('module')
        key = module if has_regions else None
        targets = by_module.get(key)
        if not targets:
            problems.append(f'нет модуля {module}')
            continue
        if len(targets) > 1:
            problems.append(f'модуль {module} встречается {len(targets)} раз — правка неоднозначна')
            continue
        idx = targets[0]
        seg = segs[idx][1]
        find, repl = e['find'], e['replace']
        n = seg.count(find)
        if n:
            if check:
                problems.append(f'{(module or "(файл)")}: ещё не применено ({find[:40]!r})')
                continue
            segs[idx][1] = seg.replace(find, repl)
            applied += 1
        elif repl in seg:
            skipped += 1
        else:
            problems.append(f'{(module or "(файл)")}: ни исходной строки, ни замены ({find[:40]!r})')

    if not check and not dry_run and applied:
        if backup_dir and rel:
            orig = os.path.join(backup_dir, 'bundles', rel.replace('/', '__') + '.orig')
            os.makedirs(os.path.dirname(orig), exist_ok=True)
            if not os.path.exists(orig):
                shutil.copy2(path, orig)
                with open(os.path.join(backup_dir, 'bundles', 'index.tsv'), 'a', encoding='utf-8') as f:
                    f.write(f'{rel}\t{os.path.basename(orig)}\n')
        new_text = prefix + ''.join(seg for _, seg in segs)
        fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), prefix='.dsh-pet-ru-', suffix='.tmp')
        try:
            with os.fdopen(fd, 'w', encoding='utf-8') as f:
                f.write(new_text)
            shutil.copymode(path, tmp)
            os.replace(tmp, path)
        except BaseException:
            if os.path.exists(tmp):
                os.unlink(tmp)
            raise
    return applied, skipped, problems


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--plugin', required=True, help='каталог установленного dsh-pet')
    ap.add_argument('--spec', default=os.path.join(os.path.dirname(os.path.dirname(
        os.path.abspath(__file__))), 'data', 'ui-strings.json'))
    ap.add_argument('--check', action='store_true', help='только проверить, что всё применено')
    ap.add_argument('--dry-run', action='store_true', help='ничего не писать')
    ap.add_argument('--backup', help='каталог бэкапа (сюда кладутся оригиналы)')
    args = ap.parse_args()

    spec = json.load(open(args.spec, encoding='utf-8'))
    failed = False
    for bundle, entries in spec.items():
        path = bundle_path(args.plugin, bundle)
        rel = bundle if '/' in bundle else 'lib/' + bundle
        if not os.path.exists(path):
            print(f'ОШИБКА: нет файла {path}', file=sys.stderr)
            failed = True
            continue
        applied, skipped, problems = apply_bundle(
            path, entries, args.check, args.dry_run, args.backup, rel)
        state = 'проверка' if args.check else ('план' if args.dry_run else 'патч')
        print(f'{rel}: {state} — заменено {applied}, уже было {skipped}, '
              f'ошибок {len(problems)} (записей в спецификации: {len(entries)})')
        for p in problems:
            print(f'  ! {p}', file=sys.stderr)
        if problems:
            failed = True
    if args.check:
        print('ПРОВЕРКА ПАТЧЕЙ: ' + ('ПРОВАЛ' if failed else 'ОК — все строки переведены'))
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
