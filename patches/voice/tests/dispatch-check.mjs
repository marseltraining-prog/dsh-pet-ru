#!/usr/bin/env node
// Быстрая проверка «провайдер реально выбирается» на установленном бандле.
// Сеть не нужна: fetch и @andresaya/edge-tts подменены. Пишет только в temp.
//
//   node --experimental-vm-modules tests/dispatch-check.mjs --plugin DIR

import assert from 'node:assert/strict';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { loadVoiceBundle } from './helpers/bundle-harness.mjs';
import { ffprobe, gemini429Response, geminiAudioResponse, makePcm, makeUserRoot, mp3Fixture } from './helpers/fixtures.mjs';

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const plugin = arg('--plugin');
if (!plugin) {
  console.error('usage: node --experimental-vm-modules tests/dispatch-check.mjs --plugin DIR');
  process.exit(2);
}

const bundlePath = join(plugin, 'lib', 'index.js');
const userRoot = await makeUserRoot();
await writeFile(join(userRoot, 'gemini.keys'), 'CHECK_KEY_1\nCHECK_KEY_2\n', 'utf8');
await mkdir(join(userRoot, 'voice-cache'), { recursive: true });

globalThis.__dshPetEdgeMock = { calls: [], audio: await mp3Fixture() };

const calls = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  calls.push(String(url));
  return String(url).includes('CHECK_KEY_1') ? gemini429Response('90s') : geminiAudioResponse(makePcm(300));
};

try {
  const { createVoiceService, VOICES } = await loadVoiceBundle({ bundlePath });
  assert.ok(VOICES.some((voice) => voice.id === 'gemini:Aoede'), 'gemini:Aoede отсутствует в VOICES');

  const lines = [];
  const service = createVoiceService({
    userRoot,
    log: { info: (message) => lines.push(`info ${message}`), warn: (message) => lines.push(`warn ${message}`) },
  });

  const result = await service.speak({ text: 'Ура! Печенька!', voice: 'gemini:Aoede' });
  assert.equal(result.ok, true, 'speak вернул ошибку');
  assert.ok(result.file.endsWith('.mp3'), `ожидался mp3, получен ${result.file}`);
  assert.ok((await stat(result.file)).size > 1000, 'файл пустой');

  assert.equal(calls.length, 2, `ожидалось 2 запроса (429 + успех), было ${calls.length}`);
  assert.match(calls[0], /CHECK_KEY_1/u);
  assert.match(calls[1], /CHECK_KEY_2/u);
  assert.match(lines.join('\n'), /gemini-key: index 1\/2 exhausted \(429\), trying next/u);
  assert.match(lines.join('\n'), /gemini-key: using 2\/2/u);
  assert.doesNotMatch(lines.join('\n'), /CHECK_KEY_/u, 'ключ попал в лог');
  assert.equal(globalThis.__dshPetEdgeMock.calls.length, 0, 'Edge не должен вызываться');

  const probe = await ffprobe(result.file);
  assert.equal(probe.streams[0].codec_name, 'mp3');
  assert.ok(Number(probe.format.duration) > 0.2);

  console.log(`dispatch-check: OK — gemini:Aoede → mp3 (${result.file}), ротация ключей 1→2, Edge не вызывался`);
} finally {
  globalThis.fetch = originalFetch;
  delete globalThis.__dshPetEdgeMock;
}
