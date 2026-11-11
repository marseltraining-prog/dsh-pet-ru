// Тесты провайдера Gemini без сети: мок fetch, мок Edge, реальный ffmpeg.
// Проверяем: ротацию ключей при 429/403, откат на Edge, WAV-ветку без ffmpeg,
// форматы файла ключей и перечитывание ключей по mtime.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  parseKeys,
  pickStyle,
  resetGeminiState,
  synthesizeGemini,
} from '../lib/voice-gemini.js';
import {
  ffprobe,
  gemini403Response,
  gemini429Response,
  geminiAudioResponse,
  makePcm,
  makeUserRoot,
  mp3Fixture,
  readWavInfo,
} from './helpers/fixtures.mjs';

/** Лог-заглушка: собираем info/warn в массив. */
function makeLog() {
  const lines = [];
  return {
    lines,
    info: (message) => lines.push(`info ${message}`),
    warn: (message) => lines.push(`warn ${message}`),
    text: () => lines.join('\n'),
  };
}

/** Edge-заглушка: пишет mp3-фикстуру и запоминает аргументы. */
function makeEdgeStub() {
  const calls = [];
  let audio;
  return {
    calls,
    setAudio: (bytes) => {
      audio = bytes;
    },
    synthesizeEdge: async (input) => {
      calls.push(input);
      await writeFile(input.target, audio);
      return input.target;
    },
  };
}

function fetchMock(handler) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : undefined });
    return await handler({ url: String(url), init, call: calls.length - 1 });
  };
  impl.calls = calls;
  return impl;
}

test.beforeEach(() => resetGeminiState());

test('ротация: первый ключ 429 → второй ключ отдаёт PCM, файл создан и валиден', async () => {
  const userRoot = await makeUserRoot();
  await writeFile(join(userRoot, 'gemini.keys'), '# основной\nKEY_ONE\n\nKEY_TWO\n', 'utf8');
  const pcm = makePcm(300);
  const fetchImpl = fetchMock(async ({ url }) =>
    url.includes('KEY_ONE') ? gemini429Response('120s') : geminiAudioResponse(pcm),
  );
  const edge = makeEdgeStub();
  edge.setAudio(await mp3Fixture());
  const log = makeLog();
  const target = join(userRoot, 'voice-cache', 'test.mp3');
  await mkdir(join(userRoot, 'voice-cache'), { recursive: true });

  const file = await synthesizeGemini(
    { text: 'Ура! Печенька!', voice: 'gemini:Aoede', rate: '+0%', target, userRoot, log },
    { synthesizeEdge: edge.synthesizeEdge, fetchImpl },
  );

  assert.equal(file, target);
  assert.equal(fetchImpl.calls.length, 2);
  assert.match(fetchImpl.calls[0].url, /KEY_ONE/u);
  assert.match(fetchImpl.calls[1].url, /KEY_TWO/u);
  assert.equal(edge.calls.length, 0, 'Edge не должен вызываться при успехе');
  assert.match(log.text(), /gemini-key: using 1\/2/u);
  assert.match(log.text(), /gemini-key: index 1\/2 exhausted \(429\), trying next/u);
  assert.match(log.text(), /gemini-key: using 2\/2/u);
  assert.doesNotMatch(log.text(), /gemini-fallback/u);
  assert.doesNotMatch(log.text(), /KEY_ONE|KEY_TWO/u, 'ключи не должны попадать в лог');

  const probe = await ffprobe(file);
  assert.equal(probe.streams[0].codec_name, 'mp3');
  assert.equal(Number(probe.streams[0].sample_rate), 24000);
  assert.ok(Number(probe.format.duration) > 0.2);

  // Второй синтез начинает с рабочего ключа: один запрос, без 429.
  const file2 = await synthesizeGemini(
    { text: 'Как дела?', voice: 'gemini:Aoede', rate: '+0%', target: join(userRoot, 'voice-cache', 'test2.mp3'), userRoot, log },
    { synthesizeEdge: edge.synthesizeEdge, fetchImpl },
  );
  assert.equal(fetchImpl.calls.length, 3);
  assert.match(fetchImpl.calls[2].url, /KEY_TWO/u);
  assert.ok((await stat(file2)).size > 0);
});

test('403 тоже ротирует ключ', async () => {
  const userRoot = await makeUserRoot();
  await writeFile(join(userRoot, 'gemini.keys'), 'KEY_A\nKEY_B\n', 'utf8');
  const fetchImpl = fetchMock(async ({ url }) =>
    url.includes('KEY_A') ? gemini403Response() : geminiAudioResponse(makePcm(150)),
  );
  const edge = makeEdgeStub();
  edge.setAudio(await mp3Fixture());
  const log = makeLog();
  const target = join(userRoot, 'voice-cache', '403.mp3');
  await mkdir(join(userRoot, 'voice-cache'), { recursive: true });

  const file = await synthesizeGemini(
    { text: 'Доброе утро.', voice: 'gemini:Aoede', rate: '+0%', target, userRoot, log },
    { synthesizeEdge: edge.synthesizeEdge, fetchImpl },
  );
  assert.equal(file, target);
  assert.equal(fetchImpl.calls.length, 2);
  assert.match(log.text(), /exhausted \(403\), trying next/u);
  assert.equal(edge.calls.length, 0);
});

test('все ключи 429 → Edge-фолбэк голосом ru-RU-SvetlanaNeural + warn', async () => {
  const userRoot = await makeUserRoot();
  await writeFile(join(userRoot, 'gemini.keys'), 'KEY_X\nKEY_Y\n', 'utf8');
  const fetchImpl = fetchMock(async () => gemini429Response('60s'));
  const edge = makeEdgeStub();
  const fixture = await mp3Fixture();
  edge.setAudio(fixture);
  const log = makeLog();
  const target = join(userRoot, 'voice-cache', 'fallback.mp3');
  await mkdir(join(userRoot, 'voice-cache'), { recursive: true });

  const file = await synthesizeGemini(
    { text: 'Я хочу спать…', voice: 'gemini:Aoede', rate: '+0%', target, userRoot, log },
    { synthesizeEdge: edge.synthesizeEdge, fetchImpl },
  );

  assert.equal(file, target);
  assert.equal(fetchImpl.calls.length, 2, 'оба ключа попробованы');
  assert.equal(edge.calls.length, 1);
  assert.equal(edge.calls[0].voice, 'ru-RU-SvetlanaNeural');
  assert.equal(edge.calls[0].text, 'Я хочу спать…');
  assert.match(log.text(), /warn gemini-fallback: all-keys-exhausted \(429\)/u);
  assert.deepEqual(await readFile(file), fixture);
});

test('все ключи исчерпаны в памяти → второй синтез сразу идёт в Edge', async () => {
  const userRoot = await makeUserRoot();
  await writeFile(join(userRoot, 'gemini.keys'), 'KEY_ONLY\n', 'utf8');
  const fetchImpl = fetchMock(async () => gemini429Response('600s'));
  const edge = makeEdgeStub();
  edge.setAudio(await mp3Fixture());
  const log = makeLog();
  await mkdir(join(userRoot, 'voice-cache'), { recursive: true });

  await synthesizeGemini(
    { text: 'раз', voice: 'gemini:Aoede', rate: '+0%', target: join(userRoot, 'voice-cache', 'a.mp3'), userRoot, log },
    { synthesizeEdge: edge.synthesizeEdge, fetchImpl },
  );
  const callsAfterFirst = fetchImpl.calls.length;
  await synthesizeGemini(
    { text: 'два', voice: 'gemini:Aoede', rate: '+0%', target: join(userRoot, 'voice-cache', 'b.mp3'), userRoot, log },
    { synthesizeEdge: edge.synthesizeEdge, fetchImpl },
  );
  assert.equal(fetchImpl.calls.length, callsAfterFirst, 'исчерпанный ключ не дёргаем повторно');
  assert.equal(edge.calls.length, 2);
  assert.match(log.text(), /gemini-fallback: all-keys-exhausted/u);
});

test('нет ffmpeg → WAV рядом с target, заголовок и ffprobe валидны', async () => {
  const userRoot = await makeUserRoot();
  await writeFile(join(userRoot, 'gemini.keys'), 'KEY_WAV\n', 'utf8');
  const pcm = makePcm(400);
  const fetchImpl = fetchMock(async () => geminiAudioResponse(pcm));
  const edge = makeEdgeStub();
  edge.setAudio(await mp3Fixture());
  const target = join(userRoot, 'voice-cache', 'wav-target.mp3');
  await mkdir(join(userRoot, 'voice-cache'), { recursive: true });

  const file = await synthesizeGemini(
    { text: 'Печенька, ням-ням.', voice: 'gemini:Aoede', rate: '+0%', target, userRoot },
    { synthesizeEdge: edge.synthesizeEdge, fetchImpl, ffmpeg: null },
  );

  assert.equal(file, join(userRoot, 'voice-cache', 'wav-target.wav'));
  const info = await readWavInfo(file);
  assert.equal(info.riff, 'RIFF');
  assert.equal(info.wave, 'WAVE');
  assert.equal(info.audioFormat, 1);
  assert.equal(info.channels, 1);
  assert.equal(info.sampleRate, 24000);
  assert.equal(info.bitsPerSample, 16);
  assert.equal(info.dataSize, pcm.length);
  assert.ok(info.dataMatches);
  const probe = await ffprobe(file);
  assert.equal(probe.streams[0].codec_name, 'pcm_s16le');
  assert.ok(Number(probe.format.duration) > 0.3);
});

test('файла ключей нет → env GEMINI_API_KEY', async () => {
  const userRoot = await makeUserRoot();
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'ENV_KEY';
  try {
    resetGeminiState();
    const fetchImpl = fetchMock(async () => geminiAudioResponse(makePcm(120)));
    const edge = makeEdgeStub();
    edge.setAudio(await mp3Fixture());
    await mkdir(join(userRoot, 'voice-cache'), { recursive: true });
    const file = await synthesizeGemini(
      { text: 'привет', voice: 'gemini:Aoede', rate: '+0%', target: join(userRoot, 'voice-cache', 'env.mp3'), userRoot },
      { synthesizeEdge: edge.synthesizeEdge, fetchImpl },
    );
    assert.match(fetchImpl.calls[0].url, /ENV_KEY/u);
    assert.ok((await stat(file)).size > 0);
  } finally {
    if (previous === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previous;
  }
});

test('старый gemini.key читается, если gemini.keys нет', async () => {
  const userRoot = await makeUserRoot();
  await writeFile(join(userRoot, 'gemini.key'), 'LEGACY_KEY\n', 'utf8');
  const fetchImpl = fetchMock(async () => geminiAudioResponse(makePcm(120)));
  const edge = makeEdgeStub();
  edge.setAudio(await mp3Fixture());
  await mkdir(join(userRoot, 'voice-cache'), { recursive: true });
  await synthesizeGemini(
    { text: 'привет', voice: 'gemini:Aoede', rate: '+0%', target: join(userRoot, 'voice-cache', 'legacy.mp3'), userRoot },
    { synthesizeEdge: edge.synthesizeEdge, fetchImpl },
  );
  assert.match(fetchImpl.calls[0].url, /LEGACY_KEY/u);
});

test('добавленный ключ подхватывается без рестарта (перечитывание по mtime)', async () => {
  const userRoot = await makeUserRoot();
  const keysFile = join(userRoot, 'gemini.keys');
  await writeFile(keysFile, 'KEY_DEAD\n', 'utf8');
  const fetchImpl = fetchMock(async ({ url }) =>
    url.includes('KEY_DEAD') ? gemini429Response('30s') : geminiAudioResponse(makePcm(120)),
  );
  const edge = makeEdgeStub();
  edge.setAudio(await mp3Fixture());
  await mkdir(join(userRoot, 'voice-cache'), { recursive: true });
  const log = makeLog();

  await synthesizeGemini(
    { text: 'раз', voice: 'gemini:Aoede', rate: '+0%', target: join(userRoot, 'voice-cache', 'one.mp3'), userRoot, log },
    { synthesizeEdge: edge.synthesizeEdge, fetchImpl },
  );
  assert.equal(edge.calls.length, 1, 'единственный ключ исчерпан → Edge');

  // Пользователь дописал второй ключ — без рестарта процесса.
  await new Promise((resolve) => setTimeout(resolve, 20));
  await writeFile(keysFile, 'KEY_DEAD\nKEY_FRESH\n', 'utf8');
  const file = await synthesizeGemini(
    { text: 'два', voice: 'gemini:Aoede', rate: '+0%', target: join(userRoot, 'voice-cache', 'two.mp3'), userRoot, log },
    { synthesizeEdge: edge.synthesizeEdge, fetchImpl },
  );
  assert.match(fetchImpl.calls.at(-1).url, /KEY_FRESH/u);
  assert.ok((await stat(file)).size > 0);
  assert.equal(edge.calls.length, 1, 'новый ключ сработал, Edge больше не нужен');
});

test('сетевой сбой и таймаут → Edge-фолбэк с причиной', async () => {
  const userRoot = await makeUserRoot();
  await writeFile(join(userRoot, 'gemini.keys'), 'KEY_NET\n', 'utf8');
  const edge = makeEdgeStub();
  edge.setAudio(await mp3Fixture());
  await mkdir(join(userRoot, 'voice-cache'), { recursive: true });

  const networkLog = makeLog();
  const networkFetch = fetchMock(async () => {
    throw new TypeError('fetch failed');
  });
  await synthesizeGemini(
    { text: 'раз', voice: 'gemini:Aoede', rate: '+0%', target: join(userRoot, 'voice-cache', 'net.mp3'), userRoot, log: networkLog },
    { synthesizeEdge: edge.synthesizeEdge, fetchImpl: networkFetch },
  );
  assert.match(networkLog.text(), /gemini-fallback: error: fetch failed/u);

  resetGeminiState();
  const timeoutLog = makeLog();
  const timeoutFetch = fetchMock(async () => {
    const error = new Error('The operation was aborted due to timeout');
    error.name = 'TimeoutError';
    throw error;
  });
  await synthesizeGemini(
    { text: 'два', voice: 'gemini:Aoede', rate: '+0%', target: join(userRoot, 'voice-cache', 'timeout.mp3'), userRoot, log: timeoutLog },
    { synthesizeEdge: edge.synthesizeEdge, fetchImpl: timeoutFetch },
  );
  assert.match(timeoutLog.text(), /gemini-fallback: timeout/u);
});

test('нет ключей вообще → Edge-фолбэк no-api-key', async () => {
  const userRoot = await makeUserRoot();
  const previous = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    resetGeminiState();
    const edge = makeEdgeStub();
    edge.setAudio(await mp3Fixture());
    const log = makeLog();
    await mkdir(join(userRoot, 'voice-cache'), { recursive: true });
    await synthesizeGemini(
      { text: 'привет', voice: 'gemini:Aoede', rate: '+0%', target: join(userRoot, 'voice-cache', 'nokey.mp3'), userRoot, log },
      { synthesizeEdge: edge.synthesizeEdge, fetchImpl: fetchMock(async () => assert.fail('сеть не должна вызываться')) },
    );
    assert.equal(edge.calls.length, 1);
    assert.match(log.text(), /gemini-fallback: no-api-key/u);
  } finally {
    if (previous !== undefined) process.env.GEMINI_API_KEY = previous;
  }
});

test('стиль попадает в промпт: auto → по тексту, voiceStyle → принудительно', async () => {
  const userRoot = await makeUserRoot({ voiceStyle: 'sleepy' });
  await writeFile(join(userRoot, 'gemini.keys'), 'KEY_STYLE\n', 'utf8');
  const fetchImpl = fetchMock(async () => geminiAudioResponse(makePcm(120)));
  const edge = makeEdgeStub();
  edge.setAudio(await mp3Fixture());
  await mkdir(join(userRoot, 'voice-cache'), { recursive: true });

  await synthesizeGemini(
    { text: 'Ура! Печенька!', voice: 'gemini:Aoede', rate: '+0%', target: join(userRoot, 'voice-cache', 'style.mp3'), userRoot },
    { synthesizeEdge: edge.synthesizeEdge, fetchImpl },
  );
  const prompt = fetchImpl.calls[0].body.contents[0].parts[0].text;
  assert.match(prompt, /хочешь спать/u);
  assert.match(prompt, /Скажи это: Ура! Печенька!/u);
  assert.equal(fetchImpl.calls[0].body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Aoede');
  assert.deepEqual(fetchImpl.calls[0].body.generationConfig.responseModalities, ['AUDIO']);

  // auto: тот же текст должен дать excited.
  await writeFile(join(userRoot, 'main-config.jsonc'), '{"voiceStyle":"auto"}\n', 'utf8');
  await new Promise((resolve) => setTimeout(resolve, 20));
  resetGeminiState();
  await synthesizeGemini(
    { text: 'Ура! Печенька!', voice: 'gemini:Aoede', rate: '+0%', target: join(userRoot, 'voice-cache', 'style2.mp3'), userRoot },
    { synthesizeEdge: edge.synthesizeEdge, fetchImpl },
  );
  const promptAuto = fetchImpl.calls.at(-1).body.contents[0].parts[0].text;
  assert.match(promptAuto, /восторге/u);
  assert.equal(pickStyle('Ура! Печенька!'), 'excited');
});

test('parseKeys: комментарии, пустые строки, BOM, кавычки', () => {
  const raw = '\uFEFF# комментарий\nKEY_1\n\n  KEY_2  # хвостовой комментарий\n"KEY_3"\n';
  assert.deepEqual(parseKeys(raw), ['KEY_1', 'KEY_2', 'KEY_3']);
});

test('пустой gemini.keys (только комментарии) → читается legacy gemini.key', async () => {
  const userRoot = await makeUserRoot();
  await writeFile(join(userRoot, 'gemini.keys'), '# пока нет ключей\n\n', 'utf8');
  await writeFile(join(userRoot, 'gemini.key'), 'FALLBACK_LEGACY\n', 'utf8');
  const fetchImpl = fetchMock(async () => geminiAudioResponse(makePcm(120)));
  const edge = makeEdgeStub();
  edge.setAudio(await mp3Fixture());
  await mkdir(join(userRoot, 'voice-cache'), { recursive: true });
  await synthesizeGemini(
    { text: 'привет', voice: 'gemini:Aoede', rate: '+0%', target: join(userRoot, 'voice-cache', 'empty.mp3'), userRoot },
    { synthesizeEdge: edge.synthesizeEdge, fetchImpl },
  );
  assert.match(fetchImpl.calls[0].url, /FALLBACK_LEGACY/u);
});
