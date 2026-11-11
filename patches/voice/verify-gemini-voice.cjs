#!/usr/bin/env node
// Проверка установленного патча Gemini TTS (без сети и без запуска DSH).
//
//   node verify-gemini-voice.cjs --plugin DIR --config FILE
//
// Проверяет: запись gemini:Aoede в VOICES, неизменный DEFAULT_VOICE, диспетчер
// synthesize(), маршрут audio/wav, наличие провайдера и поля конфига. Печатает
// ok/FAIL по каждому пункту; exit 1 при любом FAIL.

'use strict';

const { readFile, stat } = require('node:fs/promises');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--plugin') out.plugin = argv[++i];
    else if (argv[i] === '--config') out.config = argv[++i];
  }
  return out;
}

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

function region(source, name) {
  const start = source.indexOf('//#region ' + name);
  if (start < 0) throw new Error(`region not found: ${name}`);
  const end = source.indexOf('//#endregion', start);
  if (end < 0) throw new Error(`region end not found: ${name}`);
  return source.slice(start, end);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.plugin) {
    console.error('usage: node verify-gemini-voice.cjs --plugin DIR --config FILE');
    process.exit(2);
  }
  const plugin = args.plugin;
  let failures = 0;
  const ok = (message) => console.log(`ok   ${message}`);
  const fail = (message) => {
    failures += 1;
    console.error(`FAIL ${message}`);
  };

  const bundle = await readFile(join(plugin, 'lib', 'index.js'), 'utf8');
  const voices = region(bundle, 'src/host/voice/voices.ts');
  const edge = region(bundle, 'src/host/voice/edge.ts');
  const speak = region(bundle, 'src/host/voice/speak.ts');
  const cache = region(bundle, 'src/host/voice/cache.ts');

  if (voices.includes('gemini:Aoede') && voices.includes('Аоэде') && voices.includes('жен. · аниме')) {
    ok('VOICES: gemini:Aoede («Аоэде», «жен. · аниме»)');
  } else {
    fail('VOICES: запись gemini:Aoede не найдена или неполная');
  }
  if (voices.includes('const DEFAULT_VOICE = "zh-CN-XiaoyiNeural";')) {
    ok('DEFAULT_VOICE не изменён (zh-CN-XiaoyiNeural)');
  } else {
    fail('DEFAULT_VOICE изменён');
  }

  if (edge.includes('async function synthesizeEdge({ signal, text, voice, rate, target })')) {
    ok('edge: synthesizeEdge() сохранён');
  } else {
    fail('edge: synthesizeEdge() не найден');
  }
  if (edge.includes('async function synthesize(input)') && edge.includes('voice-gemini.js') && edge.includes('startsWith("gemini:")')) {
    ok('диспетчер: gemini:* → voice-gemini.js, иначе Edge');
  } else {
    fail('диспетчер synthesize() не найден');
  }

  if (
    speak.includes('geminiVoice') &&
    speak.includes('resolveStyle') &&
    speak.includes('file: produced') &&
    speak.includes('userRoot,')
  ) {
    ok('speak: эффективный стиль в ключе кэша, фактический файл, userRoot в синтезе');
  } else {
    fail('speak: патч кэша/файла не найден');
  }
  if (cache.includes('endsWith(".wav")')) {
    ok('cache: prune учитывает .wav');
  } else {
    fail('cache: prune не видит .wav');
  }

  if (bundle.includes('contentType: result.file.endsWith(".wav") ? "audio/wav" : "audio/mpeg"')) {
    ok('маршрут /voice/speak: audio/wav для .wav');
  } else {
    fail('маршрут /voice/speak: content-type не пропатчен');
  }

  try {
    await stat(join(plugin, 'lib', 'voice-gemini.js'));
    ok('lib/voice-gemini.js установлен');
  } catch {
    fail('lib/voice-gemini.js отсутствует');
  }
  try {
    await stat(join(plugin, 'src', 'host', 'voice', 'gemini.ts'));
    ok('src/host/voice/gemini.ts установлен');
  } catch {
    fail('src/host/voice/gemini.ts отсутствует');
  }

  try {
    const mod = await import(pathToFileURL(join(plugin, 'lib', 'voice-gemini.js')).href);
    const style = mod.pickStyle('Я хочу спать…');
    if (style === 'sleepy' && typeof mod.synthesizeGemini === 'function') {
      ok(`провайдер: pickStyle("Я хочу спать…") = ${style}, synthesizeGemini экспортирован`);
    } else {
      fail(`провайдер: неожиданный pickStyle=${style}`);
    }
  } catch (error) {
    fail(`провайдер не импортируется: ${error.message}`);
  }

  if (args.config) {
    const raw = await readFile(args.config, 'utf8');
    let parsed;
    try {
      parsed = JSON.parse(stripJsonc(raw));
    } catch (error) {
      fail(`конфиг не парсится: ${error.message}`);
      parsed = {};
    }
    const styles = ['auto', 'cute', 'pouty', 'sleepy', 'whisper', 'excited', 'sad', 'teasing', 'warm'];
    if (parsed.voiceProvider === 'gemini') ok('config: voiceProvider = "gemini"');
    else fail(`config: voiceProvider = ${JSON.stringify(parsed.voiceProvider)}, ожидалось "gemini"`);

    if (parsed.voiceName === 'gemini:Aoede') ok('config: voiceName = "gemini:Aoede"');
    else fail(`config: voiceName = ${JSON.stringify(parsed.voiceName)}, ожидалось "gemini:Aoede"`);

    if (styles.includes(parsed.voiceStyle)) ok(`config: voiceStyle = ${JSON.stringify(parsed.voiceStyle)}`);
    else fail(`config: voiceStyle = ${JSON.stringify(parsed.voiceStyle)}, ожидалось auto или id стиля`);

    if (typeof parsed.voiceFallback === 'string' && parsed.voiceFallback.trim() !== '') {
      ok(`config: voiceFallback = ${JSON.stringify(parsed.voiceFallback)}`);
    } else {
      fail('config: voiceFallback пуст');
    }
    if (parsed.voiceEnabled === false) ok('config: voiceEnabled=false (озвучка не включена)');
    else if (parsed.voiceEnabled === true) console.log('warn config: voiceEnabled=true — озвучка уже включена (скрипт её не менял)');
    else fail('config: voiceEnabled отсутствует');
  }

  if (failures > 0) {
    console.error(`\n${failures} проверок провалено`);
    process.exit(1);
  }
  console.log('\nвсе проверки пройдены');
}

main().catch((error) => {
  console.error('verify error:', error);
  process.exit(1);
});
