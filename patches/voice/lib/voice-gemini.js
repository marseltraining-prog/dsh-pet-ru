// dsh-pet gemini-provider v1 — runtime-модуль Gemini TTS (Aoede) для dsh-pet 0.4.7.
//
// Ставится рядом с lib/index.js и вызывается из патченного `synthesize()` только для
// голосов `gemini:*`. Отвечает за: выбор эмоции по тексту, чтение списка ключей и
// ротацию при 429/403, запрос к Gemini, PCM → WAV → mp3 и откат на Edge.
//
// Ключи никогда не попадают в лог: пишем только индекс и общее число.
// Состояние «ключ исчерпан» живёт только в памяти процесса — на диск не пишется.

import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Модель TTS: `gemini-2.5-flash-tts` отдаёт 404, рабочая — preview-tts. */
const MODEL = 'gemini-2.5-flash-preview-tts';
const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Общий лимит одного запроса к Gemini (мс). */
const REQUEST_TIMEOUT_MS = 15_000;
/** Сколько ключ считается исчерпанным, если ответ не назвал `retryDelay`. */
const KEY_COOLDOWN_MS = 60 * 60 * 1000;
/** Голос Edge-фолбэка по умолчанию (конфигурируется `voiceFallback`). */
const DEFAULT_FALLBACK_VOICE = 'ru-RU-SvetlanaNeural';
/** Префикс голосов, которые обслуживает этот модуль. */
export const GEMINI_VOICE_PREFIX = 'gemini:';
/** Потолок размера ответа/файла: 500 символов текста дают ~3 МБ PCM, берём с запасом. */
const MAX_AUDIO_BYTES = 32 * 1024 * 1024;
/** Лимит ffmpeg на конвертацию (мс). */
const FFMPEG_TIMEOUT_MS = 20_000;
/** Короткая фраза для правила «…» → teasing. */
const SHORT_PHRASE_CHARS = 40;

/**
 * Базовая часть стиль-промпта. Требование ТЗ: всегда «по-русски, аниме-интонация,
 * голос Aoede» — независимо от выбранной эмоции.
 */
const BASE_PROMPT = 'Ты — милая аниме-девочка-китёнок по имени Aoede. Говори по-русски, аниме-интонация, голос Aoede.';

/**
 * Восемь эмоций. Тексты взяты из проверенной лаборатории `voice/gemini-lab`
 * (образцы I1–I8), чтобы не подбирать интонации заново.
 */
export const STYLE_PROMPTS = {
  cute: 'Ты милая и игривая: высокий голос, улыбка в голосе, любопытство и озорство, будто нашла печеньку.',
  pouty: 'Ты цундэрэ: снаружи холодно и надменно, внутри смущение. Говори резко и отрывисто, капризно, с лёгкой обидой, чуть быстрее обычного.',
  sleepy: 'Ты только что проснулась и очень хочешь спать. Говори медленно, вяло и тихо, с зевотой и придыханием, будто вот-вот снова уснёшь.',
  whisper: 'Говори шёпотом, почти без голоса, с придыханием, очень тихо и близко к микрофону, будто делишься секретом.',
  excited: 'Ты в полном восторге. Говори громко, радостно, с визгом и смехом, очень эмоционально и энергично.',
  sad: 'Ты грустишь и робко надеешься. Говори тихо, печально, медленно, с дрожащим голосом и паузой перед вопросом.',
  teasing: 'Ты дразнишь и кокетничаешь. Говори лукаво, с хитрой улыбкой, тяни гласные, сделай игривую паузу и усмехнись.',
  warm: 'Говори спокойно и тепло, мягким голосом, с улыбкой, не спеша, будто разговариваешь с близким другом поздним вечером.',
};

/**
 * Правила выбора эмоции в порядке приоритета: первое совпадение выигрывает.
 * Порядок важен: «Не хочу! Фу!» — обида (pouty), а не восторг из-за «!».
 */
const STYLE_RULES = [
  { style: 'sleepy', re: /(спать|сплю|спит|сон|устал|зева|дремл|выспал|пять минут)/iu },
  { style: 'pouty', re: /(не хочу|не буду|фу\b|обид|дурак|надоел|бесит|противн)/iu },
  { style: 'sad', re: /(груст|плак|жалко|одинок|скучно|тоск|не забыл)/iu },
  { style: 'whisper', re: /(шёпот|шепот|тихо|секрет|по секрету|никому)/iu },
  { style: 'excited', re: /(!|ура|вау|класс|супер|ого|победа)/iu },
  { style: 'teasing', re: /(дразн|хитр|ну-ну|кокет|может быть|забыла|забыл)/iu },
  { style: 'cute', re: /(печень|ням|вкус|мил|обним|кит|люб|пельмен)/iu },
];

/** Стиль-промпт для эмоции; неизвестная эмоция трактуется как `warm`. */
export function stylePrompt(style) {
  const own = Object.hasOwn(STYLE_PROMPTS, style) ? STYLE_PROMPTS[style] : STYLE_PROMPTS.warm;
  return `${BASE_PROMPT} ${own}`;
}

/**
 * Подобрать эмоцию под фразу.
 *
 * Приоритет: ключевые слова (sleepy → pouty → sad → whisper → excited → teasing → cute),
 * затем «…» + короткая фраза → teasing, затем «?» → cute, иначе warm.
 *
 * @param {string} text - фраза питомца.
 * @returns {keyof typeof STYLE_PROMPTS} id эмоции.
 */
export function pickStyle(text) {
  const value = typeof text === 'string' ? text.trim() : '';
  if (value === '') return 'warm';
  for (const rule of STYLE_RULES) if (rule.re.test(value)) return rule.style;
  if (/(\.\.\.|…)/u.test(value) && value.length <= SHORT_PHRASE_CHARS) return 'teasing';
  if (/[?？]/u.test(value)) return 'cute';
  return 'warm';
}

/**
 * Итоговая эмоция: `voiceStyle` из конфига может принудительно задать стиль,
 * `auto` (или мусор) — обычный подбор по тексту.
 */
export function resolveStyle(configured, text) {
  if (typeof configured === 'string' && configured !== 'auto' && Object.hasOwn(STYLE_PROMPTS, configured)) return configured;
  return pickStyle(text);
}

/** Ошибка HTTP от Gemini: нужен статус и, для 429, подсказка `retryDelay`. */
class GeminiHttpError extends Error {
  constructor(status, retryAfterMs, detail) {
    super(`gemini http ${status}${detail ? `: ${String(detail).slice(0, 160)}` : ''}`);
    this.name = 'GeminiHttpError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

/** Кэши чтения с диска: путь → { mtimeMs, size, value }. */
const configCache = new Map();
const keyFileCache = new Map();
/** hash(key) → timestamp, до которого ключ считается исчерпанным. Только память. */
const exhaustedUntil = new Map();
/** Индекс последнего успешного ключа: следующий синтез начинает с него. */
let preferredKeyIndex = 0;
/** Разрешённый путь ffmpeg: undefined = ещё не искали, null = не нашли. */
let ffmpegResolved;

/**
 * Сбросить всё внутрипроцессное состояние (нужно тестам; в бою не вызывается).
 * @internal
 */
export function resetGeminiState() {
  configCache.clear();
  keyFileCache.clear();
  exhaustedUntil.clear();
  preferredKeyIndex = 0;
  ffmpegResolved = undefined;
}

/** Убрать JSONC-комментарии вне строк, чтобы прочитать main-config.jsonc. */
function stripJsonc(src) {
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

function parseJsonc(raw) {
  try {
    const value = JSON.parse(stripJsonc(raw));
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

/**
 * Прочитать голосовые настройки из `<userRoot>/main-config.jsonc` (кэш по mtime+size).
 * Эти поля не входят в схему плагина, поэтому читаем файл напрямую.
 *
 * @param {string} userRoot - `$DSH_HOME/dsh-pet`.
 * @returns {Promise<{ voiceStyle: string, voiceFallback: string }>}
 */
export async function readVoiceConfig(userRoot) {
  const file = join(userRoot, 'main-config.jsonc');
  try {
    const info = await stat(file);
    const hit = configCache.get(file);
    if (hit && hit.mtimeMs === info.mtimeMs && hit.size === info.size) return hit.value;
    const parsed = parseJsonc(await readFile(file, 'utf8'));
    const value = {
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

/** Разобрать файл ключей: строки, `#`-комментарии и пустые строки игнорируются. */
export function parseKeys(raw) {
  const out = [];
  for (const line of String(raw).replace(/^\uFEFF/u, '').split(/\r?\n/u)) {
    const value = line.replace(/\s+#.*$/u, '').trim();
    if (value === '' || value.startsWith('#')) continue;
    out.push(value.replace(/^["']|["']$/gu, ''));
  }
  return out;
}

/**
 * Ключи Gemini: сначала `gemini.keys` (список), потом старый `gemini.key` (одна строка),
 * и только если файлов нет — env `GEMINI_API_KEY`. Файл перечитывается при смене mtime+size,
 * поэтому добавленный ключ подхватывается без рестарта.
 *
 * @param {string} userRoot - `$DSH_HOME/dsh-pet`.
 * @returns {Promise<string[]>}
 */
export async function readKeys(userRoot) {
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
      if (error && error.code === 'ENOENT') continue;
      throw error;
    }
  }
  const env = (process.env.GEMINI_API_KEY ?? '').trim();
  return env ? [env] : [];
}

function keyHash(key) {
  return createHash('sha1').update(key).digest('hex');
}

/** Порядок перебора: с последнего успешного, по кругу, без исчерпанных. */
function orderedKeys(keys, now) {
  const out = [];
  for (let step = 0; step < keys.length; step += 1) {
    const index = (preferredKeyIndex + step) % keys.length;
    const key = keys[index];
    if ((exhaustedUntil.get(keyHash(key)) ?? 0) > now) continue;
    out.push({ key, index });
  }
  return out;
}

/** Сколько ждать по ответу: `Retry-After`, `retryDelay` из RetryInfo или «retry in 17h42m». */
function parseRetryDelay(rawBody, headers) {
  const header = headers && typeof headers.get === 'function' ? headers.get('retry-after') : null;
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  }
  const text = typeof rawBody === 'string' ? rawBody : '';
  const retryDelay = /"retryDelay"\s*:\s*"([\d.]+)s"/u.exec(text);
  if (retryDelay) {
    const seconds = Number(retryDelay[1]);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  }
  const retryIn = /retry in\s+(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:([\d.]+)s)?/iu.exec(text);
  if (retryIn) {
    const ms =
      (Number(retryIn[1] ?? 0) * 3600 + Number(retryIn[2] ?? 0) * 60 + Number(retryIn[3] ?? 0)) * 1000;
    if (ms > 0) return Math.round(ms);
  }
  return undefined;
}

/** Достать PCM из ответа Gemini; `inlineData` бывает и в snake_case. */
function decodeAudio(json) {
  const candidate = json && Array.isArray(json.candidates) ? json.candidates[0] : undefined;
  const parts = candidate && candidate.content && Array.isArray(candidate.content.parts) ? candidate.content.parts : [];
  for (const part of parts) {
    const inline = part && (part.inlineData ?? part.inline_data);
    if (!inline || typeof inline.data !== 'string' || inline.data === '') continue;
    const mime = inline.mimeType ?? inline.mime_type ?? '';
    const rateMatch = /rate=(\d+)/iu.exec(mime);
    const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000;
    const pcm = Buffer.from(inline.data, 'base64');
    if (pcm.length === 0) throw new Error('gemini: empty audio payload');
    if (pcm.length % 2 !== 0) throw new Error('gemini: odd PCM payload length');
    return { pcm, sampleRate };
  }
  const finish = candidate && candidate.finishReason ? ` (finishReason=${candidate.finishReason})` : '';
  throw new Error(`gemini: response has no audio${finish}`);
}

/** Один запрос к Gemini выбранным ключом. */
async function requestGemini({ key, prompt, text, signal, fetchImpl }) {
  const url = `${API_ROOT}/${MODEL}:generateContent?key=${encodeURIComponent(key)}`;
  const body = {
    contents: [{ parts: [{ text: `${prompt}\n\nСкажи это: ${text}` }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } } },
    },
  };
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const merged = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const response = await fetchImpl(url, {
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
export function pcmToWav(pcm, sampleRate = 24000, channels = 1, bits = 16) {
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

/** Найти ffmpeg: env `DSH_PET_FFMPEG` → homebrew → /usr/local → PATH. */
function resolveFfmpeg() {
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

function ffmpegPath() {
  if (ffmpegResolved === undefined) ffmpegResolved = resolveFfmpeg();
  return ffmpegResolved;
}

/** WAV → mp3 через ffmpeg (stdin/stdout, без временных файлов). */
async function encodeMp3(wav, ffmpeg) {
  return await new Promise((resolve, reject) => {
    const child = execFile(
      ffmpeg,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'wav',
        '-i',
        'pipe:0',
        '-codec:a',
        'libmp3lame',
        '-b:a',
        '64k',
        '-f',
        'mp3',
        'pipe:1',
      ],
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
    child.stdin.on('error', () => undefined);
    child.stdin.end(wav);
  });
}

/** Атомарная запись: `<file>.part` → rename, чтобы кэш не увидел половину файла. */
async function writeAtomic(file, bytes) {
  const staging = `${file}.part`;
  try {
    await writeFile(staging, bytes);
    await rename(staging, file);
  } catch (error) {
    await rm(staging, { force: true }).catch(() => undefined);
    throw error;
  }
}

/** Откат на Edge: единственный путь, когда Gemini недоступен. */
async function fallbackToEdge(input, synthesizeEdge, fallbackVoice, reason, log) {
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

/**
 * Синтез Gemini с ротацией ключей и откатом на Edge.
 *
 * @param {{ signal?: AbortSignal, text: string, voice: string, rate: string, target: string, userRoot?: string, log?: { info?(m: string): void, warn?(m: string): void } }} input
 * @param {{ synthesizeEdge: Function, fetchImpl?: Function, ffmpeg?: string | null, config?: { voiceStyle: string, voiceFallback: string } }} deps
 * @returns {Promise<string>} путь к готовому mp3 (или wav, если ffmpeg не найден).
 */
export async function synthesizeGemini(input, deps = {}) {
  const log = input.log;
  const synthesizeEdge = deps.synthesizeEdge;
  if (typeof synthesizeEdge !== 'function') throw new Error('gemini: edge fallback is unavailable');

  const userRoot = input.userRoot;
  if (!userRoot) return await fallbackToEdge(input, synthesizeEdge, DEFAULT_FALLBACK_VOICE, 'no-user-root', log);

  const config = deps.config ?? (await readVoiceConfig(userRoot));
  const style = resolveStyle(config.voiceStyle, input.text);
  const prompt = stylePrompt(style);
  let keys;
  try {
    keys = await readKeys(userRoot);
  } catch (error) {
    return await fallbackToEdge(
      input,
      synthesizeEdge,
      config.voiceFallback,
      `keys-error: ${error instanceof Error ? error.message : String(error)}`,
      log,
    );
  }
  if (keys.length === 0) return await fallbackToEdge(input, synthesizeEdge, config.voiceFallback, 'no-api-key', log);

  const now = Date.now();
  const order = orderedKeys(keys, now);
  if (order.length === 0) {
    return await fallbackToEdge(input, synthesizeEdge, config.voiceFallback, 'all-keys-exhausted', log);
  }

  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('gemini: fetch is unavailable');
  const ffmpeg = deps.ffmpeg === undefined ? ffmpegPath() : deps.ffmpeg;
  let lastStatus;

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
      // ffmpeg нет: кладём WAV рядом и возвращаем фактический путь (маршрут выставит audio/wav).
      const wavFile = input.target.replace(/\.mp3$/u, '.wav');
      await writeAtomic(wavFile, wav);
      return wavFile;
    } catch (error) {
      if (error instanceof GeminiHttpError && (error.status === 429 || error.status === 403)) {
        lastStatus = error.status;
        const until = now + (error.retryAfterMs ?? KEY_COOLDOWN_MS);
        exhaustedUntil.set(keyHash(key), until);
        log?.warn?.(`gemini-key: index ${index + 1}/${keys.length} exhausted (${error.status}), trying next`);
        continue;
      }
      const reason =
        error && (error.name === 'TimeoutError' || error.name === 'AbortError')
          ? 'timeout'
          : error instanceof GeminiHttpError
            ? `http-${error.status}`
            : `error: ${error instanceof Error ? error.message : String(error)}`;
      return await fallbackToEdge(input, synthesizeEdge, config.voiceFallback, reason, log);
    }
  }

  return await fallbackToEdge(
    input,
    synthesizeEdge,
    config.voiceFallback,
    `all-keys-exhausted${lastStatus ? ` (${lastStatus})` : ''}`,
    log,
  );
}
