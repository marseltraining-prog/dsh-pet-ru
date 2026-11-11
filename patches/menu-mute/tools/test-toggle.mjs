#!/usr/bin/env node
/**
 * Юнит-тест действий-переключателей: оптимистичное состояние и откат при ошибке.
 *
 * Из бандлов достаются НАСТОЯЩИЕ функции:
 *   lib/client.js                            → async function toggleVoiceMute(deps)
 *   runtime/electron-helper/sprite/menu.js   → PetSprite.prototype.toggleVoiceMute
 *
 * Они исполняются в `new Function` со стабами fetch/состояния: проверяется, что
 * оптимистичное переключение происходит сразу, успех берёт voiceEnabled из ответа,
 * а ошибка возвращает прежнее значение и показывает сообщение.
 *
 * Запуск: node tools/test-toggle.mjs --plugin sandbox/dsh-pet
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const plugin = resolve(arg('--plugin', 'sandbox/dsh-pet'));
const clientPath = join(plugin, 'lib', 'client.js');
const menuPath = join(plugin, 'runtime', 'electron-helper', 'sprite', 'menu.js');
for (const file of [clientPath, menuPath]) {
  if (!existsSync(file)) {
    console.error(`✗ нет ${file}`);
    process.exit(1);
  }
}

/** Вырезать функцию по заголовку и парной скобке (строки/комментарии не считаются). */
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

const okResponse = (body) => ({
  ok: true,
  status: 200,
  json: async () => body
});

let passed = 0;
function ok(label, detail = '') {
  passed += 1;
  console.log(`✓ ${label}${detail ? ' — ' + detail : ''}`);
}

// ---------------------------------------------------------------------------
// Web: toggleVoiceMute(deps)
// ---------------------------------------------------------------------------
const client = readFileSync(clientPath, 'utf8');
const webSrc = extractFunction(client, 'async function toggleVoiceMute(deps) {');
const makeWebToggle = () =>
  new Function('isVoiceEnabled', 'setVoiceEnabled', 'ROUTE_PATH', 'fetch', `${webSrc}; return toggleVoiceMute;`);

{
  let state = true;
  let said = 0;
  let warns = 0;
  const deps = { warn: () => { warns += 1; }, say: () => { said += 1; } };
  const fetchOk = async (url, opts) => {
    assert.equal(url, '/dsh-pet-7340/voice/mute');
    assert.deepEqual(JSON.parse(opts.body), { muted: true }, 'текущее true → просим muted:true');
    return okResponse({ ok: true, muted: true, voiceEnabled: false });
  };
  const toggle = makeWebToggle()(() => state, (v) => { state = v; }, '/dsh-pet-7340', fetchOk);
  await toggle(deps);
  assert.equal(state, false, 'успех: состояние из ответа (false)');
  assert.equal(said, 0);
  ok('web: успех — POST {muted:true}, состояние false из ответа');

  state = false;
  said = 0;
  const fetchOk2 = async (_url, opts) => {
    assert.deepEqual(JSON.parse(opts.body), { muted: false }, 'текущее false → просим muted:false');
    return okResponse({ ok: true, muted: false, voiceEnabled: true });
  };
  const toggle2 = makeWebToggle()(() => state, (v) => { state = v; }, '/dsh-pet-7340', fetchOk2);
  await toggle2(deps);
  assert.equal(state, true);
  ok('web: успех — POST {muted:false}, состояние true из ответа');

  state = true;
  said = 0;
  warns = 0;
  const fetchFail = async () => {
    throw new Error('network down');
  };
  const toggle3 = makeWebToggle()(() => state, (v) => { state = v; }, '/dsh-pet-7340', fetchFail);
  await toggle3(deps);
  assert.equal(state, true, 'ошибка: откат к прежнему true');
  assert.equal(said, 1, 'ошибка: короткая реплика');
  assert.equal(warns, 1, 'ошибка: warn');
  ok('web: ошибка — откат и сообщение пользователю');
}

// ---------------------------------------------------------------------------
// Desktop: PetSprite.prototype.toggleVoiceMute()
// ---------------------------------------------------------------------------
const menu = readFileSync(menuPath, 'utf8');
const methodSrc = extractFunction(menu, 'async toggleVoiceMute() {').replace(
  'async toggleVoiceMute() {',
  'async function toggleVoiceMute() {'
);
const makeDesktopToggle = () =>
  new Function('S', 'BASE', 'fetch', 'console', `${methodSrc}; return toggleVoiceMute;`);

{
  let state = true;
  const bubbles = [];
  const S = { isVoiceEnabled: () => state, setVoiceEnabled: (v) => { state = v; } };
  const ctx = { showWhisper: (...args) => bubbles.push(args) };
  const fetchOk = async (url, opts) => {
    assert.equal(url, 'http://host/dsh-pet-7340/voice/mute');
    assert.deepEqual(JSON.parse(opts.body), { muted: true });
    return okResponse({ ok: true, muted: true, voiceEnabled: false });
  };
  const quiet = { info() {}, warn() {} };
  const toggle = makeDesktopToggle()(S, 'http://host/dsh-pet-7340', fetchOk, quiet);
  await toggle.call(ctx);
  assert.equal(state, false);
  assert.equal(bubbles.length, 0);
  ok('desktop: успех — POST {muted:true}, состояние false из ответа');

  state = true;
  bubbles.length = 0;
  const fetchFail = async () => {
    throw new Error('host unreachable');
  };
  const toggle2 = makeDesktopToggle()(S, 'http://host/dsh-pet-7340', fetchFail, quiet);
  await toggle2.call(ctx);
  assert.equal(state, true, 'ошибка: откат к прежнему true');
  assert.equal(bubbles.length, 1, 'ошибка: пузырь с сообщением');
  assert.equal(bubbles[0][0], 'Не удалось переключить звук');
  ok('desktop: ошибка — откат и пузырь');
}

console.log(`\nPASS: ${passed}/5 сценариев переключателя`);
