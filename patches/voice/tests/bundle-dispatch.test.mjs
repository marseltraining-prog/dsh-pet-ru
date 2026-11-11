// Интеграционный тест на СОБРАННОМ пропатченном бандле (песочница):
// голос gemini:Aoede проходит через speak() → dispatcher → voice-gemini.js → mp3,
// а при 429 на всех ключах срабатывает Edge-фолбэк. Сеть подменена, Edge — заглушка.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homedir } from 'node:os';

import { loadVoiceBundle } from './helpers/bundle-harness.mjs';
import {
  ffprobe,
  gemini429Response,
  geminiAudioResponse,
  makePcm,
  makeUserRoot,
  mp3Fixture,
} from './helpers/fixtures.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BUNDLE = process.env.DSH_PET_BUNDLE
  ?? join(homedir(), '.dsh', 'profiles', 'desktop', 'node_modules', 'dsh-pet', 'lib', 'index.js');
const PROVIDER = join(dirname(BUNDLE), 'voice-gemini.js');

/** Сбросить состояние ротации в том же экземпляре модуля, который грузит vm-бандл. */
async function resetProvider() {
  const mod = await import(pathToFileURL(PROVIDER).href);
  mod.resetGeminiState();
}

/** Собрать userRoot с ключами и конфигом. */
async function prepareRoot(keys) {
  const root = await makeUserRoot();
  await writeFile(join(root, 'gemini.keys'), keys, 'utf8');
  await mkdir(join(root, 'voice-cache'), { recursive: true });
  return root;
}

function makeLog() {
  const lines = [];
  return { lines, info: (m) => lines.push(`info ${m}`), warn: (m) => lines.push(`warn ${m}`), text: () => lines.join('\n') };
}

test('бандл: gemini:Aoede → mp3, ключ 1 получает 429, ключ 2 синтезирует, второй вызов из кэша', async () => {
  await resetProvider();
  const userRoot = await prepareRoot('BUNDLE_KEY_1\nBUNDLE_KEY_2\n');
  globalThis.__dshPetEdgeMock = { calls: [], audio: await mp3Fixture() };
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return String(url).includes('BUNDLE_KEY_1') ? gemini429Response('120s') : geminiAudioResponse(makePcm(300));
  };
  try {
    const { createVoiceService } = await loadVoiceBundle({ bundlePath: BUNDLE });
    const log = makeLog();
    const service = createVoiceService({ userRoot, log });
    const result = await service.speak({ text: 'Ура! Печенька!', voice: 'gemini:Aoede' });
    assert.equal(result.ok, true);
    assert.ok(result.file.endsWith('.mp3'));
    assert.ok((await stat(result.file)).size > 1000);
    assert.equal(calls.length, 2);
    assert.match(calls[0], /BUNDLE_KEY_1/u);
    assert.match(calls[1], /BUNDLE_KEY_2/u);
    assert.match(log.text(), /gemini-key: index 1\/2 exhausted \(429\), trying next/u);
    assert.match(log.text(), /gemini-key: using 2\/2/u);
    assert.doesNotMatch(log.text(), /BUNDLE_KEY_/u);
    assert.equal(globalThis.__dshPetEdgeMock.calls.length, 0);

    const probe = await ffprobe(result.file);
    assert.equal(probe.streams[0].codec_name, 'mp3');

    // Кэш: тот же текст → новый синтез не нужен.
    const cached = await service.speak({ text: 'Ура! Печенька!', voice: 'gemini:Aoede' });
    assert.equal(cached.ok, true);
    assert.equal(cached.file, result.file);
    assert.equal(calls.length, 2, 'кэш должен исключить повторный запрос');
    assert.match(log.text(), /cache=hit/u);
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.__dshPetEdgeMock;
  }
});

test('бандл: все ключи 429 → Edge-фолбэк ru-RU-SvetlanaNeural, mp3 на месте, warn в логе', async () => {
  await resetProvider();
  const userRoot = await prepareRoot('DEAD_KEY_1\nDEAD_KEY_2\n');
  const fixture = await mp3Fixture();
  globalThis.__dshPetEdgeMock = { calls: [], audio: fixture };
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return gemini429Response('60s');
  };
  try {
    const { createVoiceService } = await loadVoiceBundle({ bundlePath: BUNDLE });
    const log = makeLog();
    const service = createVoiceService({ userRoot, log });
    const result = await service.speak({ text: 'Я хочу спать…', voice: 'gemini:Aoede' });
    assert.equal(result.ok, true);
    assert.ok(result.file.endsWith('.mp3'));
    assert.equal(calls.length, 2, 'оба ключа попробованы');
    assert.equal(globalThis.__dshPetEdgeMock.calls.length, 1);
    assert.equal(globalThis.__dshPetEdgeMock.calls[0].voice, 'ru-RU-SvetlanaNeural');
    assert.match(log.text(), /warn gemini-fallback: all-keys-exhausted \(429\)/u);
    assert.deepEqual(await readFile(result.file), fixture);
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.__dshPetEdgeMock;
  }
});

test('бандл: смена voiceStyle меняет ключ кэша (нет чужого аудио из auto)', async () => {
  await resetProvider();
  const userRoot = await prepareRoot('STYLE_KEY\n');
  globalThis.__dshPetEdgeMock = { calls: [], audio: await mp3Fixture() };
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return geminiAudioResponse(makePcm(200));
  };
  try {
    const { createVoiceService } = await loadVoiceBundle({ bundlePath: BUNDLE });
    const service = createVoiceService({ userRoot, log: makeLog() });
    const first = await service.speak({ text: 'Ура! Печенька!', voice: 'gemini:Aoede' });
    assert.equal(first.ok, true);

    // Меняем стиль в конфиге: тот же текст должен дать другой файл кэша.
    await writeFile(
      join(userRoot, 'main-config.jsonc'),
      '{"voiceStyle":"sleepy","voiceFallback":"ru-RU-SvetlanaNeural"}\n',
      'utf8',
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    const second = await service.speak({ text: 'Ура! Печенька!', voice: 'gemini:Aoede' });
    assert.equal(second.ok, true);
    assert.notEqual(second.file, first.file, 'кэш не должен переиспользовать аудио другого стиля');
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.__dshPetEdgeMock;
  }
});
