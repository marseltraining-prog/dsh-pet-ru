#!/usr/bin/env node
/**
 * Юнит-тест подписи и статическая проверка обоих меню.
 *
 * shared-core.js — CJS-IIFE (`var PetShared = (function (exports) {…})({})`), поэтому
 * грузим его в vm и берём PetShared: так тестируется настоящая функция подписи, а не
 * её копия в тесте. Для web-бандла (lib/client.js) проверяем, что та же подпись и
 * действие реально в нём есть, и что пункт стоит после «Чат».
 *
 * Запуск: node tools/test-label.mjs --plugin sandbox/dsh-pet
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const plugin = resolve(arg('--plugin', 'sandbox/dsh-pet'));
const sharedPath = join(plugin, 'runtime', 'electron-helper', 'shared-core.js');
const clientPath = join(plugin, 'lib', 'client.js');
const menuPath = join(plugin, 'runtime', 'electron-helper', 'sprite', 'menu.js');
const rendererPath = join(plugin, 'runtime', 'electron-helper', 'renderer.js');
const hostPath = join(plugin, 'lib', 'index.js');

for (const file of [sharedPath, clientPath, menuPath, rendererPath, hostPath]) {
  if (!existsSync(file)) {
    console.error(`✗ нет ${file}`);
    process.exit(1);
  }
}

const sharedSrc = readFileSync(sharedPath, 'utf8');
const S = vm.runInNewContext(`${sharedSrc}\n;PetShared`, { console });

let passed = 0;
function ok(label, detail = '') {
  passed += 1;
  console.log(`✓ ${label}${detail ? ' — ' + detail : ''}`);
}

// --- подпись ---------------------------------------------------------------
assert.equal(typeof S.voiceMuteLabel, 'function', 'voiceMuteLabel должен быть экспортирован');
assert.equal(S.voiceMuteLabel(true), 'Выключить звук');
assert.equal(S.voiceMuteLabel(false), 'Включить звук');
assert.equal(S.voiceMuteLabel(undefined), 'Включить звук');
ok('подпись: voiceEnabled=true → «Выключить звук», иначе «Включить звук»');

// --- состояние -------------------------------------------------------------
assert.equal(typeof S.setVoiceEnabled, 'function');
assert.equal(typeof S.isVoiceEnabled, 'function');
S.setVoiceEnabled(true);
assert.equal(S.isVoiceEnabled(), true);
S.setVoiceEnabled(false);
assert.equal(S.isVoiceEnabled(), false);
S.setVoiceConfig('gemini:Aoede', 0.5, true);
assert.equal(S.isVoiceEnabled(), true);
S.setVoiceConfig('gemini:Aoede', 0.5);
assert.equal(S.isVoiceEnabled(), true, 'setVoiceConfig без третьего аргумента не должен сбрасывать состояние');
ok('setVoiceEnabled/isVoiceEnabled и третий аргумент setVoiceConfig работают');

// --- сон -------------------------------------------------------------------
assert.equal(S.isSleepAllowedAction('voice-mute'), true, 'тумблер звука должен работать и во сне');
assert.equal(S.isSleepAllowedAction('whisper'), false);
ok('voice-mute разрешён в спящем состоянии (S.isSleepAllowedAction)');

// --- web-бандл -------------------------------------------------------------
const client = readFileSync(clientPath, 'utf8');
assert.ok(client.includes('"Выключить звук"'));
assert.ok(client.includes('"Включить звук"'));
assert.ok(client.includes('voiceMuteLabel(isVoiceEnabled())'));
assert.ok(client.includes('action: "voice-mute"'));
assert.ok(client.includes('async function toggleVoiceMute(deps)'));
assert.ok(client.includes('ROUTE_PATH + "/voice/mute"'));
assert.ok(client.includes('setVoiceEnabled(body.voiceEnabled === true)'));
const chatAt = client.indexOf('action: "chat"');
const muteAt = client.indexOf('action: "voice-mute"');
assert.ok(chatAt !== -1 && muteAt > chatAt, 'пункт должен стоять после «Чат»');
ok('web: динамическая подпись, пункт после «Чат», POST и откат на месте');

// --- desktop-бандл ---------------------------------------------------------
const menu = readFileSync(menuPath, 'utf8');
assert.ok(menu.includes("S.voiceMuteLabel(S.isVoiceEnabled())"));
assert.ok(menu.includes("action: 'voice-mute'"));
assert.ok(menu.includes('async toggleVoiceMute()'));
assert.ok(menu.includes("BASE + '/voice/mute'"));
assert.ok(menu.includes('S.setVoiceEnabled(body.voiceEnabled === true)'));
const dChatAt = menu.indexOf("action: 'chat'");
const dMuteAt = menu.indexOf("action: 'voice-mute'");
assert.ok(dChatAt !== -1 && dMuteAt > dChatAt, 'desktop-пункт должен стоять после «Чат»');
ok('desktop: динамическая подпись, пункт после «Чат», POST и откат на месте');

// --- renderer + host -------------------------------------------------------
const renderer = readFileSync(rendererPath, 'utf8');
assert.ok(renderer.includes('voiceEnabled: (merged && merged.main'));
assert.ok(renderer.includes('S.setVoiceConfig(cfg.voiceName, cfg.voiceVolume, cfg.voiceEnabled)'));
ok('desktop: voiceEnabled приходит из /config и попадает в shared-core');

const standalonePath = join(plugin, 'lib', 'standalone.js');
if (existsSync(standalonePath)) {
  const standalone = readFileSync(standalonePath, 'utf8');
  assert.ok(standalone.includes('rest === "voice/mute"'));
  assert.ok(standalone.includes('from "./voice-mute.js"'));
  ok('standalone: тот же маршрут (общий desktop-helper)');
}

const host = readFileSync(hostPath, 'utf8');
assert.ok(host.includes('rest === "voice/mute"'));
assert.ok(host.includes('from "./voice-mute.js"'));
assert.ok(host.includes('deps.state.writeSection("config", {})'));
assert.ok(host.includes('|| rest === "voice/mute") && method === "POST"'));
ok('host: маршрут, сигнал sections.config и очередь записи конфига');

console.log(`\nPASS: ${passed}/8 проверок подписи и меню`);
