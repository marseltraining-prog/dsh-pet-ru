#!/usr/bin/env node
// ЖИВОЙ запрос к Gemini TTS: один ключ, одна фраза, ровно один HTTP-запрос.
// Тратит 1 из 10 дневных запросов Free Tier — запускать только после сброса квоты
// и только осознанно. Ключи не печатаются; Edge-фолбэк в этом режиме запрещён,
// чтобы «успех» нельзя было спутать с откатом.
//
//   node tests/live-check.mjs --live [--text "Печенька?"]

import assert from 'node:assert/strict';
import { mkdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { ffprobe } from './helpers/fixtures.mjs';
import { synthesizeGemini } from '../lib/voice-gemini.js';

if (!process.argv.includes('--live')) {
  console.error('Это живой запрос и он тратит квоту. Запуск: node tests/live-check.mjs --live');
  process.exit(2);
}

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const userRoot = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'dsh-pet');
const text = arg('--text', 'Привет! Я Бетси, твой питомец. Печенька?');
const target = join('/tmp', `dsh-pet-gemini-live-${Date.now()}.mp3`);

const log = {
  info: (message) => console.log(`info ${message}`),
  warn: (message) => console.warn(`warn ${message}`),
};

console.log(`userRoot: ${userRoot}`);
console.log(`text:     ${text}`);
console.log('запрос:   1 (при 429/403 скрипт завершится ошибкой, Edge-фолбэк отключён)');

const started = Date.now();
const file = await synthesizeGemini(
  { text, voice: 'gemini:Aoede', rate: '+0%', target, userRoot, log },
  {
    synthesizeEdge: async () => {
      throw new Error('live-check: Edge-фолбэк запрещён — Gemini не ответил');
    },
  },
);

assert.ok(file === target || file === target.replace(/\.mp3$/u, '.wav'), `ожидался ${target} или .wav, получен ${file}`);
assert.ok((await stat(file)).size > 1000, 'файл пустой');
const probe = await ffprobe(file);
console.log(`\nOK: ${file}`);
console.log(`codec=${probe.streams[0].codec_name} rate=${probe.streams[0].sample_rate} duration=${probe.format.duration}s`);
console.log(`ms=${Date.now() - started}`);
