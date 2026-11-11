// Таблица «фраза → эмоция» для pickStyle + проверка стиль-промптов.
// Сеть не нужна.

import test from 'node:test';
import assert from 'node:assert/strict';
import { pickStyle, resolveStyle, stylePrompt, STYLE_PROMPTS } from '../lib/voice-gemini.js';

/** 12 фраз из ТЗ и ожидаемая эмоция. */
const TABLE = [
  ['Я хочу спать…', 'sleepy'],
  ['Не хочу! Фу!', 'pouty'],
  ['Ура! Печенька!', 'excited'],
  ['Ты меня любишь?', 'cute'],
  ['Ну... не знаю...', 'teasing'],
  ['Печенька, ням-ням.', 'cute'],
  ['Мне грустно...', 'sad'],
  ['Слушай, по секрету...', 'whisper'],
  ['Доброе утро, хозяин.', 'warm'],
  ['Я так устала, зеваю...', 'sleepy'],
  ['Ты дурак!', 'pouty'],
  ['Как дела?', 'cute'],
];

for (const [phrase, expected] of TABLE) {
  test(`pickStyle: ${JSON.stringify(phrase)} → ${expected}`, () => {
    assert.equal(pickStyle(phrase), expected);
  });
}

test('pickStyle: пустая строка → warm', () => {
  assert.equal(pickStyle(''), 'warm');
  assert.equal(pickStyle('   '), 'warm');
  assert.equal(pickStyle(undefined), 'warm');
});

test('pickStyle: приоритет правил — «!» не перебивает обиду', () => {
  assert.equal(pickStyle('Не хочу! Фу!'), 'pouty');
});

test('pickStyle: «…» + длинная фраза не считается teasing', () => {
  const long = 'Сегодня на улице очень тепло и солнечно, а я всё равно...';
  assert.equal(pickStyle(long), 'warm');
});

test('stylePrompt: всегда содержит «по-русски», «аниме-интонация», «Aoede»', () => {
  for (const style of Object.keys(STYLE_PROMPTS)) {
    const prompt = stylePrompt(style);
    assert.match(prompt, /по-русски/iu);
    assert.match(prompt, /аниме-интонация/iu);
    assert.match(prompt, /Aoede/u);
    assert.ok(prompt.length > 80, `prompt too short for ${style}`);
  }
});

test('stylePrompt: неизвестная эмоция → warm', () => {
  assert.equal(stylePrompt('constructor'), stylePrompt('warm'));
  assert.equal(stylePrompt('nope'), stylePrompt('warm'));
});

test('resolveStyle: auto подбирает по тексту, явный стиль принудительный', () => {
  assert.equal(resolveStyle('auto', 'Я хочу спать…'), 'sleepy');
  assert.equal(resolveStyle('excited', 'Я хочу спать…'), 'excited');
  assert.equal(resolveStyle('мусор', 'Как дела?'), 'cute');
  assert.equal(resolveStyle(undefined, 'Мне грустно...'), 'sad');
});

test('все 8 эмоций покрыты стиль-промптами', () => {
  assert.deepEqual(Object.keys(STYLE_PROMPTS).sort(), [
    'cute',
    'excited',
    'pouty',
    'sad',
    'sleepy',
    'teasing',
    'warm',
    'whisper',
  ]);
});
