// dsh-pet gemini-provider v1 — TypeScript-исходник провайдера (зеркало lib/voice-gemini.js).
//
// Рантайм использует lib/voice-gemini.js; этот файл нужен, чтобы исходники плагина
// оставались консистентными и провайдер можно было собрать штатным `npm run build`.
// Ключи не логируются; состояние ротации живёт только в памяти процесса.

import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Модель TTS: `gemini-2.5-flash-tts` отдаёт 404, рабочая — preview-tts. */
const MODEL = 'gemini-2.5-flash-preview-tts';
const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta/models';
const REQUEST_TIMEOUT_MS = 15_000;
const KEY_COOLDOWN_MS = 60 * 60 * 1000;
const DEFAULT_FALLBACK_VOICE = 'ru-RU-SvetlanaNeural';
const MAX_AUDIO_BYTES = 32 * 1024 * 1024;
const FFMPEG_TIMEOUT_MS = 20_000;
const SHORT_PHRASE_CHARS = 40;

export const GEMINI_VOICE_PREFIX = 'gemini:';

const BASE_PROMPT = 'Ты — милая аниме-девочка-китёнок по имени Aoede. Говори по-русски, аниме-интонация, голос Aoede.';

export const STYLE_PROMPTS = {
  cute: 'Ты милая и игривая: высокий голос, улыбка в голосе, любопытство и озорство, будто нашла печеньку.',
  pouty:
    'Ты цундэрэ: снаружи холодно и надменно, внутри смущение. Говори резко и отрывисто, капризно, с лёгкой обидой, чуть быстрее обычного.',
  sleepy:
    'Ты только что проснулась и очень хочешь спать. Говори медленно, вяло и тихо, с зевотой и придыханием, будто вот-вот снова уснёшь.',
  whisper: 'Говори шёпотом, почти без голоса, с придыханием, очень тихо и близко к микрофону, будто делишься секретом.',
  excited: 'Ты в полном восторге. Говори громко, радостно, с визгом и смехом, очень эмоционально и энергично.',
  sad: 'Ты грустишь и робко надеешься. Говори тихо, печально, медленно, с дрожащим голосом и паузой перед вопросом.',
  teasing: 'Ты дразнишь и кокетничаешь. Говори лукаво, с хитрой улыбкой, тяни гласные, сделай игривую паузу и усмехнись.',
  warm: 'Говори спокойно и тепло, мягким голосом, с улыбкой, не спеша, будто разговариваешь с близким другом поздним вечером.',
} as const;

export type StyleId = keyof typeof STYLE_PROMPTS;

const STYLE_RULES: ReadonlyArray<{ readonly style: StyleId; readonly re: RegExp }> = [
  { style: 'sleepy', re: /(спать|сплю|спит|сон|устал|зева|дремл|выспал|пять минут)/iu },
  { style: 'pouty', re: /(не хочу|не буду|фу\b|обид|дурак|надоел|бесит|противн)/iu },
  { style: 'sad', re: /(груст|плак|жалко|одинок|скучно|тоск|не забыл)/iu },
  { style: 'whisper', re: /(шёпот|шепот|тихо|секрет|по секрету|никому)/iu },
  { style: 'excited', re: /(!|ура|вау|класс|супер|ого|победа)/iu },
  { style: 'teasing', re: /(дразн|хитр|ну-ну|кокет|может быть|забыла|забыл)/iu },
  { style: 'cute', re: /(печень|ням|вкус|мил|обним|кит|люб|пельмен)/iu },
];

/** Стиль-промпт для эмоции; неизвестная эмоция трактуется как `warm`. */
export function stylePrompt(style: string): string {
  const own = Object.hasOwn(STYLE_PROMPTS, style) ? STYLE_PROMPTS[style as StyleId] : STYLE_PROMPTS.warm;
  return `${BASE_PROMPT} ${own}`;
}

/** Подобрать эмоцию под фразу (см. STYLE_RULES; «…» + короткая фраза → teasing, «?» → cute). */
export function pickStyle(text: string): StyleId {
  const value = typeof text === 'string' ? text.trim() : '';
  if (value === '') return 'warm';
  for (const rule of STYLE_RULES) if (rule.re.test(value)) return rule.style;
  if (/(\.\.\.|…)/u.test(value) && value.length <= SHORT_PHRASE_CHARS) return 'teasing';
  if (/[?？]/u.test(value)) return 'cute';
  return 'warm';
}

/** Итоговая эмоция: `voiceStyle` может принудительно задать стиль, `auto` — подбор по тексту. */
export function resolveStyle(configured: string | undefined, text: string): StyleId {
  if (configured && configured !== 'auto' && Object.hasOwn(STYLE_PROMPTS, configured)) return configured as StyleId;
  return pickStyle(text);
}

class GeminiHttpError extends Error {
  readonly status: number;
  readonly retryAfterMs?: number;

  constructor(status: number, retryAfterMs: number | undefined, detail: string) {
    super(`gemini http ${status}${detail ? `: ${detail.slice(0, 160)}` : ''}`);
    this.name = 'GeminiHttpError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

interface VoiceConfig {
  readonly voiceStyle: string;
  readonly voiceFallback: string;
}

export interface GeminiInput {
  readonly text: string;
  readonly voice: string;
  readonly rate: string;
  readonly target: string;
  readonly signal?: AbortSignal;
  readonly userRoot?: string;
  readonly log?: { info?(message: string): void; warn?(message: string): void };
}

export interface GeminiDeps {
  synthesizeEdge(input: {
    readonly text: string;
    readonly voice: string;
    readonly rate: string;
    readonly target: string;
    readonly signal?: AbortSignal;
  }): Promise<string | void>;
  fetchImpl?: typeof fetch;
  ffmpeg?: string | null;
  config?: VoiceConfig;
}

const configCache = new Map<string, { mtimeMs: number; size: number; value: VoiceConfig }>();
const keyFileCache = new Map<string, { mtimeMs: number; size: number; keys: string[] }>();
const exhaustedUntil = new Map<string, number>();
let preferredKeyIndex = 0;
let ffmpegResolved: string | null | undefined;

/** Сбросить внутрипроцессное состояние (тесты). @internal */
export function resetGeminiState(): void {
  configCache.clear();
  keyFileCache.clear();
  exhaustedUntil.clear();
  preferredKeyIndex = 0;
  ffmpegResolved = undefined;
}

function stripJsonc(src: string): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inString) {
      out += ch;
      if (ch === '\\' && i + 1 < src.length) out += src[(i += 1)];
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch === '/' && src[i + 1] === '/') {
      out += ' ';
      while (i + 1 < src.length && src[i + 1] !== '\r' && src[i + 1] !== '\n') i += 1;
    } else if (ch === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? src.length : end + 1;
      out += ' ';
    } else out += ch;
  }
  return out;
}

function parseJsonc(raw: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(stripJsonc(raw));
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Прочитать `voiceStyle`/`voiceFallback` из main-config.jsonc (кэш по mtime+size). */
export async function readVoiceConfig(userRoot: string): Promise<VoiceConfig> {
  const file = join(userRoot, 'main-config.jsonc');
  try {
    const info = await stat(file);
    const hit = configCache.get(file);
    if (hit && hit.mtimeMs === info.mtimeMs && hit.size === info.size) return hit.value;
    const parsed = parseJsonc(await readFile(file, 'utf8'));
    const value: VoiceConfig = {
      voiceStyle: typeof parsed.voiceStyle === 'string' && parsed.voiceStyle.trim() ? parsed.voiceStyle.trim() : 'auto',
      voiceFallback:
        typeof parsed.voiceFallback === 'string' && parsed.voiceFallback.trim()
          ? parsed.voiceFallback.trim()
          : DEFAULT_FALLBACK_VOICE,
    };
    configCache.set(file, { mtimeMs: info.mtimeMs, size: info.size, value });
    return value;
  } catch {
    return { voiceStyle: 'auto', voiceFallback: DEFAULT_FALLBACK_VOICE };
  }
}

/** Разобрать файл ключей: `#`-комментарии и пустые строки игнорируются. */
export function parseKeys(raw: string): string[] {
  const out: string[] = [];
  for (const line of String(raw).replace(/^\uFEFF/u, '').split(/\r?\n/u)) {
    const value = line.replace(/\s+#.*$/u, '').trim();
    if (value === '' || value.startsWith('#')) continue;
    out.push(value.replace(/^["']|["']$/gu, ''));
  }
  return out;
}

/** Ключи: gemini.keys → gemini.key → env GEMINI_API_KEY; кэш по mtime+size. */
export async function readKeys(userRoot: string): Promise<string[]> {
  for (const name of ['gemini.keys', 'gemini.key']) {
    const file = join(userRoot, name);
    try {
      const info = await stat(file);
      const hit = keyFileCache.get(file);
      if (hit && hit.mtimeMs === info.mtimeMs && hit.size === info.size) return hit.keys;
      const keys = parseKeys(await readFile(file, 'utf8'));
      keyFileCache.set(file, { mtimeMs: info.mtimeMs, size: info.size, keys });
      // Пустой файл (только комментарии) — не повод игнорировать следующий источник.
      if (keys.length === 0) continue;
      return keys;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
  }
  const env = (process.env.GEMINI_API_KEY ?? '').trim();
  return env ? [env] : [];
}

function keyHash(key: string): string {
  return createHash('sha1').update(key).digest('hex');
}

function orderedKeys(keys: readonly string[], now: number): Array<{ key: string; index: number }> {
  const out: Array<{ key: string; index: number }> = [];
  for (let step = 0; step < keys.length; step += 1) {
    const index = (preferredKeyIndex + step) % keys.length;
    const key = keys[index];
    if ((exhaustedUntil.get(keyHash(key)) ?? 0) > now) continue;
    out.push({ key, index });
  }
  return out;
}

function parseRetryDelay(rawBody: string, headers: Headers): number | undefined {
  const header = headers.get('retry-after');
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  }
  const retryDelay = /"retryDelay"\s*:\s*"([\d.]+)s"/u.exec(rawBody);
  if (retryDelay) {
    const seconds = Number(retryDelay[1]);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  }
  const retryIn = /retry in\s+(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:([\d.]+)s)?/iu.exec(rawBody);
  if (retryIn) {
    const ms = (Number(retryIn[1] ?? 0) * 3600 + Number(retryIn[2] ?? 0) * 60 + Number(retryIn[3] ?? 0)) * 1000;
    if (ms > 0) return Math.round(ms);
  }
  return undefined;
}

function decodeAudio(json: unknown): { pcm: Buffer; sampleRate: number } {
  const root = json as { candidates?: Array<{ content?: { parts?: Array<Record<string, unknown>> }; finishReason?: string }> };
  const candidate = root.candidates?.[0];
  for (const part of candidate?.content?.parts ?? []) {
    const inline = (part.inlineData ?? part.inline_data) as { data?: string; mimeType?: string; mime_type?: string } | undefined;
    if (!inline || typeof inline.data !== 'string' || inline.data === '') continue;
    const mime = inline.mimeType ?? inline.mime_type ?? '';
    const rateMatch = /rate=(\d+)/iu.exec(mime);
    const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000;
    const pcm = Buffer.from(inline.data, 'base64');
    if (pcm.length === 0) throw new Error('gemini: empty audio payload');
    if (pcm.length % 2 !== 0) throw new Error('gemini: odd PCM payload length');
    return { pcm, sampleRate };
  }
  const finish = candidate?.finishReason ? ` (finishReason=${candidate.finishReason})` : '';
  throw new Error(`gemini: response has no audio${finish}`);
}

async function requestGemini(options: {
  key: string;
  prompt: string;
  text: string;
  signal?: AbortSignal;
  fetchImpl: typeof fetch;
}): Promise<{ pcm: Buffer; sampleRate: number }> {
  const url = `${API_ROOT}/${MODEL}:generateContent?key=${encodeURIComponent(options.key)}`;
  const body = {
    contents: [{ parts: [{ text: `${options.prompt}\n\nСкажи это: ${options.text}` }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } } },
    },
  };
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const merged = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  const response = await options.fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: merged,
  });
  if (!response.ok) {
    const raw = await response.text().catch(() => '');
    throw new GeminiHttpError(response.status, parseRetryDelay(raw, response.headers), raw);
  }
  return decodeAudio(await response.json());
}

/** Обернуть сырой PCM (L16, моно, 16 бит) в WAV. */
export function pcmToWav(pcm: Buffer, sampleRate = 24000, channels = 1, bits = 16): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = (sampleRate * channels * bits) / 8;
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE((channels * bits) / 8, 32);
  header.writeUInt16LE(bits, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function resolveFfmpeg(): string | null {
  const candidates = [process.env.DSH_PET_FFMPEG, '/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg', 'ffmpeg'];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      execFileSync(candidate, ['-version'], { stdio: 'ignore', timeout: 5000 });
      return candidate;
    } catch {
      /* пробуем следующий */
    }
  }
  return null;
}

function ffmpegPath(): string | null {
  if (ffmpegResolved === undefined) ffmpegResolved = resolveFfmpeg();
  return ffmpegResolved;
}

async function encodeMp3(wav: Buffer, ffmpeg: string): Promise<Buffer> {
  return await new Promise((resolve, reject) => {
    const child = execFile(
      ffmpeg,
      ['-hide_banner', '-loglevel', 'error', '-f', 'wav', '-i', 'pipe:0', '-codec:a', 'libmp3lame', '-b:a', '64k', '-f', 'mp3', 'pipe:1'],
      { encoding: 'buffer', maxBuffer: MAX_AUDIO_BYTES, timeout: FFMPEG_TIMEOUT_MS },
      (error, stdout) => {
        if (error) {
          reject(new Error(`ffmpeg: ${error.message}`));
          return;
        }
        const bytes = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout ?? '');
        if (bytes.length === 0) {
          reject(new Error('ffmpeg: empty output'));
          return;
        }
        resolve(bytes);
      },
    );
    child.stdin?.on('error', () => undefined);
    child.stdin?.end(wav);
  });
}

async function writeAtomic(file: string, bytes: Buffer): Promise<void> {
  const staging = `${file}.part`;
  try {
    await writeFile(staging, bytes);
    await rename(staging, file);
  } catch (error) {
    await rm(staging, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function fallbackToEdge(
  input: GeminiInput,
  synthesizeEdge: GeminiDeps['synthesizeEdge'],
  fallbackVoice: string,
  reason: string,
  log: GeminiInput['log'],
): Promise<string> {
  log?.warn?.(`gemini-fallback: ${reason}`);
  const startedMs = Date.now();
  const file = await synthesizeEdge({
    signal: input.signal,
    text: input.text,
    voice: fallbackVoice,
    rate: input.rate,
    target: input.target,
  });
  log?.info?.(`gemini-fallback: edge ok voice=${fallbackVoice} ms=${Date.now() - startedMs}`);
  return file ?? input.target;
}

/** Синтез Gemini с ротацией ключей и откатом на Edge. */
export async function synthesizeGemini(input: GeminiInput, deps: GeminiDeps): Promise<string> {
  const log = input.log;
  const userRoot = input.userRoot;
  if (!userRoot) return await fallbackToEdge(input, deps.synthesizeEdge, DEFAULT_FALLBACK_VOICE, 'no-user-root', log);

  const config = deps.config ?? (await readVoiceConfig(userRoot));
  const style = resolveStyle(config.voiceStyle, input.text);
  const prompt = stylePrompt(style);

  let keys: string[];
  try {
    keys = await readKeys(userRoot);
  } catch (error) {
    const reason = `keys-error: ${error instanceof Error ? error.message : String(error)}`;
    return await fallbackToEdge(input, deps.synthesizeEdge, config.voiceFallback, reason, log);
  }
  if (keys.length === 0) return await fallbackToEdge(input, deps.synthesizeEdge, config.voiceFallback, 'no-api-key', log);

  const now = Date.now();
  const order = orderedKeys(keys, now);
  if (order.length === 0) {
    return await fallbackToEdge(input, deps.synthesizeEdge, config.voiceFallback, 'all-keys-exhausted', log);
  }

  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  const ffmpeg = deps.ffmpeg === undefined ? ffmpegPath() : deps.ffmpeg;
  let lastStatus: number | undefined;

  for (const { key, index } of order) {
    log?.info?.(`gemini-key: using ${index + 1}/${keys.length}`);
    try {
      const { pcm, sampleRate } = await requestGemini({ key, prompt, text: input.text, signal: input.signal, fetchImpl });
      preferredKeyIndex = index;
      const wav = pcmToWav(pcm, sampleRate);
      if (ffmpeg) {
        await writeAtomic(input.target, await encodeMp3(wav, ffmpeg));
        return input.target;
      }
      const wavFile = input.target.replace(/\.mp3$/u, '.wav');
      await writeAtomic(wavFile, wav);
      return wavFile;
    } catch (error) {
      if (error instanceof GeminiHttpError && (error.status === 429 || error.status === 403)) {
        lastStatus = error.status;
        exhaustedUntil.set(keyHash(key), now + (error.retryAfterMs ?? KEY_COOLDOWN_MS));
        log?.warn?.(`gemini-key: index ${index + 1}/${keys.length} exhausted (${error.status}), trying next`);
        continue;
      }
      const reason =
        error && ((error as Error).name === 'TimeoutError' || (error as Error).name === 'AbortError')
          ? 'timeout'
          : error instanceof GeminiHttpError
            ? `http-${error.status}`
            : `error: ${error instanceof Error ? error.message : String(error)}`;
      return await fallbackToEdge(input, deps.synthesizeEdge, config.voiceFallback, reason, log);
    }
  }

  return await fallbackToEdge(
    input,
    deps.synthesizeEdge,
    config.voiceFallback,
    `all-keys-exhausted${lastStatus ? ` (${lastStatus})` : ''}`,
    log,
  );
}
