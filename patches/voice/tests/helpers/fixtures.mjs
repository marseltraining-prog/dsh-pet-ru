// Общие фикстуры тестов: PCM, ответы Gemini, WAV-разбор, ffprobe, временные каталоги.

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const SAMPLES = join(HERE, '..', '..', '..', 'samples');

export const SAMPLE_RATE = 24000;

/** Синусоида 440 Гц, 16 бит моно — валидный PCM для «ответа» Gemini. */
export function makePcm(durationMs = 250, sampleRate = SAMPLE_RATE) {
  const samples = Math.round((sampleRate * durationMs) / 1000);
  const pcm = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i += 1) {
    pcm.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 12000), i * 2);
  }
  return pcm;
}

/** Успешный ответ Gemini TTS с inlineData PCM. */
export function geminiAudioResponse(pcm = makePcm(), sampleRate = SAMPLE_RATE) {
  const body = {
    candidates: [
      {
        content: {
          parts: [
            {
              inlineData: {
                mimeType: `audio/L16;codec=pcm;rate=${sampleRate}`,
                data: pcm.toString('base64'),
              },
            },
          ],
        },
        finishReason: 'STOP',
      },
    ],
  };
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

/** Ответ 429 с RetryInfo, как у реального Gemini. */
export function gemini429Response(retryDelay = '120s') {
  const body = {
    error: {
      code: 429,
      message: 'Quota exceeded for metric: generate_content_free_tier_requests, limit: 10',
      status: 'RESOURCE_EXHAUSTED',
      details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay }],
    },
  };
  return new Response(JSON.stringify(body), { status: 429, headers: { 'content-type': 'application/json' } });
}

/** Ответ 403 (permission) — тоже повод ротировать ключ. */
export function gemini403Response() {
  return new Response(JSON.stringify({ error: { code: 403, status: 'PERMISSION_DENIED' } }), {
    status: 403,
    headers: { 'content-type': 'application/json' },
  });
}

/** Разобрать WAV-заголовок и проверить, что файл действительно валиден. */
export async function readWavInfo(file) {
  const bytes = await readFile(file);
  if (bytes.length < 44) throw new Error('wav: file is too short');
  const riff = bytes.toString('ascii', 0, 4);
  const wave = bytes.toString('ascii', 8, 12);
  const fmt = bytes.toString('ascii', 12, 16);
  const audioFormat = bytes.readUInt16LE(20);
  const channels = bytes.readUInt16LE(22);
  const sampleRate = bytes.readUInt32LE(24);
  const bitsPerSample = bytes.readUInt16LE(34);
  const dataSize = bytes.readUInt32LE(40);
  return {
    riff,
    wave,
    fmt,
    audioFormat,
    channels,
    sampleRate,
    bitsPerSample,
    dataSize,
    fileSize: bytes.length,
    dataOffset: 44,
    dataMatches: bytes.length === 44 + dataSize,
  };
}

/** Длительность/кодек через ffprobe (системный, /opt/homebrew/bin/ffprobe). */
export async function ffprobe(file) {
  const { stdout } = await execFileAsync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration,format_name', '-show_entries', 'stream=codec_name,sample_rate,channels', '-of', 'json', file],
    { timeout: 15000 },
  );
  return JSON.parse(stdout);
}

/** Временный userRoot с main-config.jsonc. */
export async function makeUserRoot(overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-pet-gemini-'));
  const config = {
    voiceEnabled: false,
    voiceName: 'gemini:Aoede',
    voiceProvider: 'gemini',
    voiceStyle: 'auto',
    voiceFallback: 'ru-RU-SvetlanaNeural',
    ...overrides,
  };
  const lines = Object.entries(config)
    .map(([key, value]) => `  "${key}": ${JSON.stringify(value)}`)
    .join(',\n');
  await writeFile(join(root, 'main-config.jsonc'), `{\n${lines}\n}\n`, 'utf8');
  return root;
}

/** mp3-заглушка Edge: берём реальный образец из voice/samples, иначе синтезируем ffmpeg'ом. */
export async function mp3Fixture() {
  const sample = join(SAMPLES, 'ru-svetlana.mp3');
  if (existsSync(sample)) return await readFile(sample);
  const wav = join(tmpdir(), `dsh-pet-fixture-${process.pid}.wav`);
  const pcm = makePcm(250);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);
  await writeFile(wav, Buffer.concat([header, pcm]));
  const mp3 = wav.replace(/\.wav$/u, '.mp3');
  await execFileAsync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '64k', mp3]);
  return await readFile(mp3);
}
