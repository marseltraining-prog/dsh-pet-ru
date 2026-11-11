#!/usr/bin/env node
/**
 * Проверка слияния НАСТОЯЩИМ кодом плагина: берём его src/host/config/read.ts,
 * подсовываем наш main-config.jsonc и смотрим, что получилось в готовом конфиге
 * (тот самый объект, который видит рантайм).
 *
 * Node ≥ 22.6 умеет запускать .ts напрямую (type stripping). Если версия старше —
 * скрипт честно скажет, что проверка недоступна, и выйдет с кодом 3.
 *
 *   node tools/check-host-merge.mjs --plugin <dsh-pet> --pet-home <~/.dsh/dsh-pet>
 */
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const HOME = process.env.HOME;
const plugin = resolve(arg('--plugin', join(HOME, '.dsh/profiles/desktop/node_modules/dsh-pet')));
const petHome = resolve(arg('--pet-home', join(HOME, '.dsh/dsh-pet')));

if (!existsSync(join(plugin, 'src/host/config/read.ts'))) {
  console.error('ОШИБКА: нет src/host/config/read.ts — проверка слияния недоступна');
  process.exit(2);
}

let mod;
try {
  mod = await import(pathToFileURL(join(plugin, 'src/host/config/read.ts')).href);
} catch (error) {
  console.error('проверка слияния недоступна (не удалось загрузить TS): ' + error.message);
  process.exit(3);
}

const paths = {
  defaultFile: join(plugin, 'assets/config.jsonc'),
  userFile: join(petHome, 'main-config.jsonc'),
  legacyUserFile: join(petHome, 'main-config.json'),
  petDir: join(petHome, 'pet'),
};

const merged = mod.readAllConfig(paths);
const main = merged.main;
const pets = main.pets ?? [];
const anim = main.animations ?? {};
const cats = anim.categories ?? [];
const actions = cats.flatMap((c) => c.actions ?? []);
const memes = Object.keys(main.memes ?? {});
const total = [
  ...(anim.idle ?? []), ...(anim.turn ?? []), ...(anim.drag ?? []),
  ...(anim.clicks ?? []), ...((anim.moves?.actions ?? []).map((m) => m.name)),
  ...actions,
  ...Object.values(anim.events ?? {}).flatMap((p) => p.flatMap((s) => (Array.isArray(s) ? s : [s]))),
  ...(anim.sleep ?? []).flatMap((s) => [...(s.start ?? []), ...(s.loop ?? []), ...(s.end ?? [])]),
  ...(anim.baifan ?? []),
];

const problems = [];
const cjk = /[\u4e00-\u9fff]/;
const check = (cond, msg) => {
  console.log((cond ? '  OK   ' : '  FAIL ') + msg);
  if (!cond) problems.push(msg);
};

console.log('готовый конфиг глазами самого плагина (readAllConfig):');
check(pets.length === 1, `питомцев после слияния: ${pets.length}`);
check(pets[0]?.id === 'main', `id питомца: ${pets[0]?.id}`);
const petName = pets[0]?.name;
check(typeof petName === 'string' && petName.trim() !== '' && !cjk.test(petName), `имя питомца: ${petName}`);
check(pets[0]?.display === 'desktop', `display: ${pets[0]?.display}`);
check(pets[0]?.size === 462, `size: ${pets[0]?.size}`);
check(total.length === 114, `имён анимаций в готовом конфиге: ${total.length}`);
check(new Set(total).size === total.length, 'имена анимаций не повторяются');
check(cats.map((c) => c.id).join(',') === 'Мелкие движения,Игры,Еда,Праздники,Надписи',
  `категории: ${cats.map((c) => c.id).join(', ')}`);
check(Array.isArray(main.workStatusTexts) && main.workStatusTexts.length === 6,
  `уровней рабочего статуса: ${main.workStatusTexts?.length}`);
check(memes.length === 27, `мемов: ${memes.length}`);
check((main.whisperPrompt ?? '').length > 50 && !cjk.test(main.whisperPrompt ?? ''),
  'характер питомца задан и без китайских иероглифов');

const dump = JSON.stringify(main);
const hits = dump.match(/[\u4e00-\u9fff]/g) ?? [];
check(hits.length === 0, `китайских иероглифов в готовом конфиге: ${hits.length}`);
if (hits.length) {
  // показать, откуда они, чтобы было что чинить
  const walk = (value, path) => {
    if (typeof value === 'string' && cjk.test(value)) console.log(`      ${path} = ${JSON.stringify(value)}`);
    else if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}[${i}]`));
    else if (value && typeof value === 'object') Object.entries(value).forEach(([k, v]) => walk(v, `${path}.${k}`));
  };
  walk(main, 'main');
}

if (problems.length) {
  console.log(`\nИТОГ: ПРОВАЛ — ${problems.length} проблем(ы)`);
  process.exit(1);
}
console.log('\nИТОГ: слияние даёт полностью русский готовый конфиг');
