#!/usr/bin/env node
/**
 * Песочница маршрута POST /dsh-pet-7340/voice/mute.
 *
 * Импортирует НАСТОЯЩИЙ `lib/voice-mute.js` из пропатченной копии плагина и гоняет
 * его на временном main-config.jsonc: проверяет ответ, смену voiceEnabled, сохранность
 * pets и остальных полей, создание отсутствующего поля, отказ на битом конфиге.
 *
 * Запуск: node tools/test-route.mjs --plugin sandbox/dsh-pet
 */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const plugin = resolve(arg('--plugin', 'sandbox/dsh-pet'));
const modulePath = join(plugin, 'lib', 'voice-mute.js');
if (!existsSync(modulePath)) {
  console.error(`✗ нет ${modulePath} — сначала примените патч`);
  process.exit(1);
}
const { voiceMuteRoute, stripJsonc } = await import(pathToFileURL(modulePath).href);

const root = await mkdtemp(join(tmpdir(), 'dsh-pet-mute-'));
const petHome = join(root, 'dsh-pet');
const userFile = join(petHome, 'main-config.jsonc');
const legacyFile = join(petHome, 'main-config.json');
const configPaths = { userFile, legacyUserFile: legacyFile, petDir: join(petHome, 'pet') };
const deps = { configPaths, userConfigPath: userFile };

let passed = 0;
function ok(label, detail = '') {
  passed += 1;
  console.log(`✓ ${label}${detail ? ' — ' + detail : ''}`);
}
async function readJson(file) {
  return JSON.parse(stripJsonc(await readFile(file, 'utf8')));
}
function extractFunction(src, header) {
  const start = src.indexOf(header);
  assert.notEqual(start, -1, `не найдена функция: ${header}`);
  let depth = 0;
  let inStr = null;
  let lineComment = false;
  let blockComment = false;
  for (let i = src.indexOf('{', start); i < src.length; i += 1) {
    const c = src[i];
    const n = src[i + 1];
    if (lineComment) {
      if (c === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (c === '*' && n === '/') {
        blockComment = false;
        i += 1;
      }
      continue;
    }
    if (inStr) {
      if (c === '\\') {
        i += 1;
        continue;
      }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      inStr = c;
      continue;
    }
    if (c === '/' && n === '/') {
      lineComment = true;
      i += 1;
      continue;
    }
    if (c === '/' && n === '*') {
      blockComment = true;
      i += 1;
      continue;
    }
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`не закрыта функция: ${header}`);
}

async function reset(contents) {
  await rm(petHome, { recursive: true, force: true });
  await import('node:fs/promises').then(({ mkdir }) => mkdir(petHome, { recursive: true }));
  await writeFile(userFile, contents, 'utf8');
}

const FULL_CONFIG = `// dsh-pet test config (JSONC: комментарии разрешены)
{
  // один питомец, все поля на месте
  "voiceEnabled": true,
  "voiceName": "gemini:Aoede",
  "voiceProvider": "gemini",
  "voiceStyle": "auto",
  "voiceFallback": "ru-RU-SvetlanaNeural",
  "voiceVolume": 1,
  "voiceWhisperEnabled": false,
  "chatMemoryRounds": 10,
  "memes": { "Толстая рыба на рисе": "лень", "Большое на подходе": "новости" },
  "pets": [
    {
      "id": "main",
      "name": "Китёнок",
      "size": 462,
      "balanceEnabled": true,
      "whisperEnabled": true,
      "workStatusEnabled": true,
      "fixedEnabled": false,
      "display": "desktop",
      "position": { "corner": "top-right", "marginX": 24, "marginY": 24 }
    }
  ]
}
`;

try {
  // 1. muted:true → voiceEnabled:false, всё остальное цело
  await reset(FULL_CONFIG);
  const before = await readJson(userFile);
  const r1 = await voiceMuteRoute({ method: 'POST', body: JSON.stringify({ muted: true }) }, deps);
  assert.equal(r1.status, 200);
  assert.deepEqual(r1.obj, { ok: true, muted: true, voiceEnabled: false });
  const after1 = await readJson(userFile);
  assert.equal(after1.voiceEnabled, false);
  assert.deepEqual(after1.pets, before.pets);
  for (const key of Object.keys(before)) {
    if (key === 'voiceEnabled') continue;
    assert.deepEqual(after1[key], before[key], `поле ${key} изменилось`);
  }
  assert.deepEqual(Object.keys(after1).sort(), Object.keys(before).sort());
  ok('muted:true → voiceEnabled:false, pets и прочие поля целы', 'ответ {ok:true,muted:true,voiceEnabled:false}');

  // 2. muted:false → voiceEnabled:true (обратная сторона)
  const r2 = await voiceMuteRoute({ method: 'POST', body: JSON.stringify({ muted: false }) }, deps);
  assert.equal(r2.status, 200);
  assert.deepEqual(r2.obj, { ok: true, muted: false, voiceEnabled: true });
  const after2 = await readJson(userFile);
  assert.equal(after2.voiceEnabled, true);
  assert.deepEqual(after2.pets, before.pets);
  assert.equal(after2.voiceProvider, 'gemini');
  ok('muted:false → voiceEnabled:true, provider не тронут');

  // 3. поля voiceEnabled не было — создаётся
  const without = FULL_CONFIG.replace(/^\s*"voiceEnabled": true,\s*$/m, '');
  assert.ok(!without.includes('"voiceEnabled"'), 'фикстура должна быть без voiceEnabled');
  await reset(without);
  const r3 = await voiceMuteRoute({ method: 'POST', body: JSON.stringify({ muted: true }) }, deps);
  assert.equal(r3.obj.ok, true);
  const after3 = await readJson(userFile);
  assert.equal(after3.voiceEnabled, false);
  assert.deepEqual(after3.pets, before.pets);
  ok('отсутствующее поле voiceEnabled создано (false)');

  // 4. битый JSON в теле → 400 invalid-json, файл не тронут
  const snapshot = await readFile(userFile, 'utf8');
  const r4 = await voiceMuteRoute({ method: 'POST', body: '{oops' }, deps);
  assert.equal(r4.status, 400);
  assert.equal(r4.obj.reason, 'invalid-json');
  assert.equal(await readFile(userFile, 'utf8'), snapshot);
  ok('битый JSON → 400 invalid-json, конфиг не перезаписан');

  // 5. muted не булев → bad-request, файл не тронут
  const r5 = await voiceMuteRoute({ method: 'POST', body: JSON.stringify({ muted: 'true' }) }, deps);
  assert.equal(r5.status, 200);
  assert.equal(r5.obj.ok, false);
  assert.equal(r5.obj.reason, 'bad-request');
  assert.equal(await readFile(userFile, 'utf8'), snapshot);
  ok('muted:"true" → ok:false bad-request, конфиг не перезаписан');

  // 6. не POST → 405
  const r6 = await voiceMuteRoute({ method: 'GET', body: '' }, deps);
  assert.equal(r6.status, 405);
  assert.equal(r6.obj.reason, 'method-not-allowed');
  ok('GET → 405 method-not-allowed');

  // 7. битый пользовательский конфиг не перезаписывается
  const broken = '{ "pets": [ // комментарий не закрыт\n';
  await reset(broken);
  const r7 = await voiceMuteRoute({ method: 'POST', body: JSON.stringify({ muted: true }) }, deps);
  assert.equal(r7.status, 200);
  assert.equal(r7.obj.ok, false);
  assert.equal(r7.obj.reason, 'user-config-unparsable');
  assert.equal(await readFile(userFile, 'utf8'), broken);
  ok('битый конфиг → user-config-unparsable, файл не перезаписан');

  // 8. legacy main-config.json: читаем его, пишем в .jsonc (как PUT /config)
  await rm(petHome, { recursive: true, force: true });
  await import('node:fs/promises').then(({ mkdir }) => mkdir(petHome, { recursive: true }));
  await writeFile(legacyFile, FULL_CONFIG, 'utf8');
  const r8 = await voiceMuteRoute({ method: 'POST', body: JSON.stringify({ muted: true }) }, deps);
  assert.equal(r8.obj.ok, true);
  assert.equal(await readFile(legacyFile, 'utf8'), FULL_CONFIG, 'legacy-файл не должен меняться');
  const after8 = await readJson(userFile);
  assert.equal(after8.voiceEnabled, false);
  assert.deepEqual(after8.pets, before.pets);
  ok('legacy main-config.json прочитан, запись ушла в main-config.jsonc');

  // 9. реальная обёртка из lib/index.js: маршрут доходит до модуля и шлёт sections.config
  await reset(FULL_CONFIG);
  const writes = [];
  const wrapperDeps = { ...deps, state: { writeSection: (...args) => writes.push(args) } };
  for (const hostRel of ['lib/index.js', 'lib/standalone.js']) {
    const hostFile = join(plugin, hostRel);
    if (!existsSync(hostFile)) continue;
    const hostSrc = await readFile(hostFile, 'utf8');
    const wrapperSrc = extractFunction(hostSrc, 'async function handleVoiceRoutes(deps, input) {');
    const handleVoiceRoutes = new Function('voiceMuteRoute', `${wrapperSrc}; return handleVoiceRoutes;`)(voiceMuteRoute);
    writes.length = 0;
    const w1 = await handleVoiceRoutes(wrapperDeps, {
      url: new URL('http://127.0.0.1/dsh-pet-7340/voice/mute'),
      rest: 'voice/mute',
      method: 'POST',
      body: JSON.stringify({ muted: true })
    });
    assert.equal(w1.kind, 'json');
    assert.equal(w1.status, 200);
    assert.deepEqual(w1.obj, { ok: true, muted: true, voiceEnabled: false });
    assert.deepEqual(writes, [['config', {}]], `${hostRel}: после записи должен уйти sections.config`);
    writes.length = 0;
    const w2 = await handleVoiceRoutes(wrapperDeps, { rest: 'voice/mute', method: 'POST', body: '{}' });
    assert.equal(w2.obj.ok, false);
    assert.equal(writes.length, 0, `${hostRel}: при ошибке сигнал не шлётся`);
    ok(`обёртка handleVoiceRoutes (${hostRel}): маршрут + sections.config`, 'writeSection("config", {})');
  }

  // 9. stripJsonc не трогает // внутри строк
  const tricky = '{ "a": "http://x//y", "b": "/* not a comment */" } // tail';
  assert.deepEqual(JSON.parse(stripJsonc(tricky)), { a: 'http://x//y', b: '/* not a comment */' });
  ok('stripJsonc: // и /* */ внутри строк сохранены');

  console.log(`\nPASS: ${passed} сценариев маршрута`);
} finally {
  await rm(root, { recursive: true, force: true });
}
