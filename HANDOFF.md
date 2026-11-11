# HANDOFF — питомец Бетси (dsh-pet, русская локализация)

Дата: 2026-11-11. Репозиторий: https://github.com/marseltraining-prog/dsh-pet-ru

## Что это
Локализация плагина dsh-pet 0.4.7 для DeepSeek Harness: интерфейс, меню, промпты, 27 мемов,
шрифт, два видео-клипа, голос Gemini Aoede с эмоциями и Edge-фолбэком. Оригинал:
https://github.com/PC2005-cloud/dsh-pet (MIT; образ — CC BY-NC-SA 4.0, некоммерческий).

## Что уже установлено в живом DSH
- Плагин `dsh-pet@0.4.7`, профиль `desktop`; питомец — Бетси, `display: desktop` (плавающее окно).
- Локализация: 369 строк бандлов + 554 замены промптов/таблиц; меню, статусы, сон, уведомления — русские.
- Шрифт Balsamiq Sans Bold в пузырях (line-height 1.3, плотные паддинги).
- 27 мемов перерисованы по-русски; два видео-клипа переведены и лежат под русскими именами
  (`Ну и что поесть.webm`, `Раздумывает вслух.webm`).
- Голос: провайдер `gemini:Aoede`, `voiceStyle: auto` (эмоция под фразу), `voiceEnabled: true`,
  `voiceWhisperEnabled: true` (период бормотания 1800 с), фолбэк Edge `ru-RU-SvetlanaNeural`.
- Ключи Gemini: `~/.dsh/dsh-pet/gemini.keys` (4 шт., НЕ публиковать), ротация при 429.
- Меню: пункт «Выключить звук / Включить звук» (web + desktop), меняет `voiceEnabled`.
- Банк фраз: `voice-bank/` (84 фразы), готово 8/84; хост сначала ищет фразу в банке, потом Gemini.

## Незавершённое
1. **Перезапустить DSH** — подхватить патч банка, русские видео и `display: desktop`.
2. Догенерация банка: ежедневно в 13:05 (schedule `schedule-634c6a20`), `python3 voice-bank/bake.py --once --limit 40`.
   Квота free tier: 10 запросов/день на ключ; `resume_after` — 2026-11-12 13:00 (+05:00).
3. Проверить 2–3 эмоции Aoede после рестарта; при желании включить/выключить `voiceWhisperEnabled`.
4. Репозиторий можно обновлять: `git add -A && git commit && git push`.

## Полезные пути
- Проект: `/Users/macbookmarsel/Documents/TEMPCLAUDE/ПИТОМЕЦ`
- Живой профиль: `~/.dsh/profiles/desktop/node_modules/dsh-pet`
- Данные питомца: `~/.dsh/dsh-pet/` (config, memes, voice-cache, voice-bank, gemini.keys)
- Комплекты-исходники: `~/Documents/deepseek-harness/default-workspace/dsh-pet-ru/`
- Голосовые лаборатории: `voice/lab`, `voice/gemini-lab`, `voice/aoede-lab` (HTML, file://)

## Правила
- Ключи, `~/.dsh/.credentials.yaml` и токены — никогда не коммитить и не печатать.
- Арт — CC BY-NC-SA 4.0: только некоммерческое использование, атрибуция обязательна.
- Перед установкой патчей — бэкап; у каждого комплекта есть `rollback-*.sh`.

## С чего начать в новом чате
Прочитай этот файл и `README.md`, проверь `voice-bank/bake.py --status`, затем продолжай с
«Незавершённое». Текущий чат-архив содержит историю решений, но всё нужное — здесь.
