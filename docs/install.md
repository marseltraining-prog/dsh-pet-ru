# Установка на чистый dsh-pet 0.4.7

Проект — это **набор патчей**, а не форк плагина. Он не заменяет `dsh-pet`, а
аккуратно дописывает русский язык в установленную версию **0.4.7**: копирует
ассеты под русскими именами, пишет конфиг и патчит бандлы. Все патчи
идемпотентны и умеют откатываться.

---

## 0. Что нужно

* macOS или Linux, `bash` (системный 3.2 подходит);
* `python3` (на macOS — Command Line Tools);
* Node.js ≥ 22.6 — только для `node --check` и проверки слияния конфига;
* `ffmpeg` — необязательно, нужен голосу для mp3 (без него Gemini отдаст `.wav`);
* установленный DSH и плагин `dsh-pet@0.4.7`;
* ~65 МБ свободного места в `~/.dsh/dsh-pet` (копии 114 клипов и 27 PNG).

---

## 1. Поставить плагин

GUI: «Плагины» → установить `dsh-pet`.

Или из терминала (профиль — тот, которым пользуетесь):

```bash
dsh plugin --profile desktop add dsh-pet@0.4.7   # desktop-приложение
dsh plugin --profile web add dsh-pet@0.4.7       # dsh web
```

Проверьте, что появились `lib/client.js`, `lib/index.js`,
`runtime/electron-helper/`, `assets/config.jsonc`, `src/` (для патча голоса
нужны исходники — они есть в npm-пакете).

Перезапустите DSH один раз, чтобы плагин создал `~/.dsh/dsh-pet/`.

---

## 2. Забрать проект

```bash
git clone <URL-вашего-репозитория> dsh-pet-ru
cd dsh-pet-ru
```

Дальше все команды — из корня проекта. Если профиль не `desktop` или плагин
лежит в другом месте, добавьте `--plugin` / `--pet-home` (у каждого скрипта
есть `--help`).

---

## 3. Применить патчи по порядку

```bash
# 1. Локализация: 369 строк интерфейса, 114 анимаций, 27 мемов, конфиг
./patches/localization/apply.sh

# 2. Мемы: 27 перерисованных PNG (если localization уже их скопировал — no-op)
./patches/memes/apply-memes.sh

# 3. Шрифт: Balsamiq Sans + метрики пузыря
./patches/font/apply-font.sh

# 4. Видео: 2 клипа с русскими облачками
./patches/video/install.sh

# 5. Голос: Gemini Aoede + Edge-фолбэк
./patches/voice/apply-gemini-voice.sh

# 6. Кнопка mute в меню
./patches/menu-mute/apply-mute-menu.sh
```

Скрипты показывают план и спрашивают подтверждение; `--yes` — без вопросов,
`--dry-run` — только план, `--check` (где есть) — только проверка.

`localization/apply.sh` пишет `~/.dsh/dsh-pet/main-config.jsonc` из
`config/main-config.jsonc`. Имя питомца сохраняется из текущего конфига, если
оно там уже есть; иначе подставляется **«Бетси»**. Переопределить:
`./patches/localization/apply.sh --name "Китёнок"`.

Порядок важен: `voice` патчит `lib/index.js`, который до этого патчит
`localization`; `menu-mute` патчит те же бандлы последним.

---

## 4. Ключ Gemini (необязательно)

Без ключа всё работает, но каждая фраза синтезируется Edge-голосом
`ru-RU-SvetlanaNeural`. Чтобы включить Aoede:

```bash
mkdir -p ~/.dsh/dsh-pet
printf '%s\n' 'ВАШ_КЛЮЧ' > ~/.dsh/dsh-pet/gemini.keys
chmod 600 ~/.dsh/dsh-pet/gemini.keys
```

Несколько ключей — по одному на строку. Файл перечитывается без рестарта.
Подробности и квоты — [`voice.md`](voice.md).

---

## 5. Перезапуск

```bash
# закройте и откройте DSH (или обновите страницу для web-половины)
```

Питомец должен появиться в правом верхнем углу (размер 462, `display:
"desktop"` — только плавающее окно, без копии внутри страницы). Если интерфейс
плагина остался китайским, проверьте язык хоста: **Настройки DSH → Общие →
Язык → Русский**, затем обновите страницу. Плагин слушает `ctx.locale`.

---

## 6. Проверка

```bash
./patches/localization/apply.sh --check     # 25 проверок + слияние конфига
./patches/memes/apply-memes.sh --dry-run
./patches/font/apply-font.sh --check
./patches/video/install.sh --check
./patches/menu-mute/apply-mute-menu.sh --check
```

Ожидаемо: `ИТОГ: ВСЁ ХОРОШО — 25 проверок пройдено` и `слияние даёт полностью
русский готовый конфиг`.

---

## 7. Откат

В обратном порядке:

```bash
./patches/menu-mute/rollback-mute-menu.sh
./patches/voice/rollback-gemini-voice.sh
./patches/video/rollback.sh
./patches/font/rollback-font.sh
./patches/memes/rollback-memes.sh
./patches/localization/rollback.sh
```

Каждый скрипт восстанавливает файлы из своего бэкапа в `backups/` и проверяет
sha256. Бэкапы создаются при первом применении и не перезаписываются.

---

## 8. Если что-то пошло не так

| Симптом | Что делать |
| --- | --- |
| `apply.sh` остановился на «ни исходной строки, ни замены» | версия плагина не 0.4.7 или бандл уже пропатчен другим способом. Откатитесь и проверьте версию |
| Питомцев двое | в конфиге был `display: "both"`; комплект ставит `"desktop"`. Перезапишите конфиг `apply.sh` |
| Пункт меню есть, анимация не играет | нет файла в `~/.dsh/dsh-pet/main-animation/webm/`; запустите `apply.sh --check` |
| Голос молчит | нет ключа/квоты → должен сработать Edge; проверьте `voiceFallback` и наличие `edge-tts` |
| После обновления плагина всё по-китайски | обновление заменило бандлы; запустите патчи заново |
