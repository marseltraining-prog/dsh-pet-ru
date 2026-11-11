// Загружает голосовые регионы из собранного lib/index.js в vm-контекст и отдаёт
// createVoiceService/synthesize — так тесты гоняют именно пропатченный бандл,
// а не переписанную копию. Edge-модуль подменяется data:-модулем (сеть не нужна).

import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const REGIONS = [
  'src/host/voice/voices.ts',
  'src/host/voice/cache.ts',
  'src/host/voice/edge.ts',
  'src/host/voice/speak.ts',
];

const EDGE_MOCK_SRC = `
export class EdgeTTS {
  async generate(text, voice, opts) {
    const state = globalThis.__dshPetEdgeMock;
    if (!state) throw new Error('edge mock is not configured');
    state.calls.push({ text, voice, rate: opts && opts.rate });
    if (state.fail) throw new Error(state.fail);
    return { audio: state.audio };
  }
}
`;

const EDGE_MOCK_URL = 'data:text/javascript;charset=utf-8,' + encodeURIComponent(EDGE_MOCK_SRC);

/** Вырезать регион бандла (вместе с маркерами не нужно — только код). */
function regionOf(source, name) {
  const start = source.indexOf('//#region ' + name);
  if (start < 0) throw new Error(`region not found: ${name}`);
  const end = source.indexOf('//#endregion', start);
  if (end < 0) throw new Error(`region end not found: ${name}`);
  return source.slice(start, end);
}

/**
 * Загрузить голосовую часть бандла.
 *
 * @param {{ bundlePath: string }} options
 * @returns {Promise<{ createVoiceService: Function, synthesize: Function, synthesizeEdge: Function, VOICES: unknown[] }>}
 */
export async function loadVoiceBundle({ bundlePath }) {
  const source = await readFile(bundlePath, 'utf8');
  const code = REGIONS.map((name) => regionOf(source, name)).join('\n');

  const context = vm.createContext({
    console,
    Buffer,
    process,
    URL,
    AbortSignal,
    setTimeout,
    clearTimeout,
    createHash,
    join,
    mkdir,
    readdir,
    rename,
    rm,
    stat,
    writeFile,
    activeVoiceProvider: () => null,
    BUILTIN_VOICE_ID: 'edge',
  });

  const script = new vm.Script(
    code + '\n;globalThis.__dshPetVoice = { createVoiceService, synthesize, synthesizeEdge, VOICES, DEFAULT_VOICE };',
    {
      filename: bundlePath,
      importModuleDynamically: async (specifier) => {
        if (specifier === '@andresaya/edge-tts') return import(EDGE_MOCK_URL);
        return import(new URL(specifier, pathToFileURL(bundlePath)).href);
      },
    },
  );
  script.runInContext(context);
  return context.__dshPetVoice;
}
