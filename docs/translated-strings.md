# Все переведённые строки бандлов

Файл сгенерирован `tools/build-patch-spec.py` из таблицы переводов;
каждая строка адресуется модулем бандла, поэтому zh-словарь и логи не задеваются.

## lib/client.js

| Модуль | Было | Стало |
| --- | --- | --- |
| `src/shared/menu/tree.ts` | `"仅网页"` | `"Только в браузере"` |
| `src/shared/menu/tree.ts` | `"仅桌面"` | `"Только на столе"` |
| `src/shared/menu/tree.ts` | `"两者"` | `"Везде"` |
| `src/shared/menu/tree.ts` | `"都不"` | `"Нигде"` |
| `src/shared/menu/tree.ts` | `"显示位置"` | `"Где показывать"` |
| `src/shared/menu/tree.ts` | `"更多"` | `"Ещё"` |
| `src/shared/menu/tree.ts` | `"余额档位"` | `"Уровни баланса"` |
| `src/shared/menu/tree.ts` | `"碎碎念"` | `"Бормотание"` |
| `src/shared/menu/tree.ts` | `"工作状态"` | `"Рабочий статус"` |
| `src/shared/menu/tree.ts` | `["待机", animations.idle]` | `["Ожидание", animations.idle]` |
| `src/shared/menu/tree.ts` | `["转向", animations.turn]` | `["Повороты", animations.turn]` |
| `src/shared/menu/tree.ts` | `["拖拽", animations.drag]` | `["Перетаскивание", animations.drag]` |
| `src/shared/menu/tree.ts` | `["点击回应", animations.clicks]` | `["Реакция на клик", animations.clicks]` |
| `src/shared/menu/tree.ts` | `["移动", animations.moves.actions.map((m) => m.name)]` | `["Передвижение", animations.moves.actions.map((m) => m.name)]` |
| `src/shared/menu/tree.ts` | `label: "动作"` | `label: "Действия"` |
| `src/shared/menu/memes.ts` | `"纳入对话的配图"` | `"Картинки для чата"` |
| `src/shared/menu/memes.ts` | `"其他"` | `"Другое"` |
| `src/shared/menu/memes.ts` | `"配图"` | `"Картинки"` |
| `src/client/pet/card/entry.ts` | `"起来"` | `"Проснуться"` |
| `src/client/pet/card/entry.ts` | `"睡觉"` | `"Спать"` |
| `src/client/pet/card/entry.ts` | `"查看余额"` | `"Показать баланс"` |
| `src/client/pet/card/entry.ts` | `"待办事项"` | `"Задачи"` |
| `src/client/pet/card/entry.ts` | `"碎碎念"` | `"Побормотать"` |
| `src/client/pet/card/entry.ts` | `"对话"` | `"Чат"` |
| `src/client/pet/card/entry.ts` | `"回到初始位置"` | `"Вернуть на место"` |
| `src/client/pet/card/entry.ts` | `"显示位置"` | `"Где показывать"` |
| `src/shared/chat/hotkey.ts` | `"L 键"` | `"Клавиша L"` |
| `src/shared/chat/hotkey.ts` | `"S 键"` | `"Клавиша S"` |
| `src/shared/sleep-hotkey.ts` | `"Z 键"` | `"Клавиша Z"` |
| `src/shared/todo/hotkey.ts` | `"D 键"` | `"Клавиша D"` |
| `src/shared/chat/hear-hold.ts` | `"M 键"` | `"Клавиша M"` |
| `src/shared/display-hotkey.ts` | `String(index + 1) + " 键"` | `"Клавиша " + String(index + 1)` |
| `src/shared/notify.ts` | `"对话完成"` | `"Ход завершён"` |
| `src/shared/notify.ts` | `"生成失败"` | `"Ошибка генерации"` |
| `src/shared/notify.ts` | `"输出被截断"` | `"Вывод обрезан"` |
| `src/shared/notify.ts` | `"已达到输出 token 上限"` | `"Достигнут лимит токенов"` |
| `src/shared/notify.ts` | `"正在申请权限"` | `"Запрос разрешения"` |
| `src/shared/notify.ts` | `"工具「"` | `"Инструмент «"` |
| `src/shared/notify.ts` | `"」"` | `"»"` |
| `src/shared/notify.ts` | `"："` | `" — "` |
| `src/shared/notify.ts` | `"模型在等你回答"` | `"Модель ждёт ответа"` |
| `src/client/notify.ts` | `"权限未授予（"` | `"Разрешение не выдано ("` |
| `src/client/notify.ts` | `"）"` | `")"` |
| `src/client/settings/notify-test.ts` | `"测试通知"` | `"Тестовое уведомление"` |
| `src/client/settings/notify-test.ts` | `"【dsh-pet】系统通知已就绪。"` | `"[dsh-pet] Системные уведомления готовы."` |
| `src/shared/whisper.ts` | `"当前对话未配置模型，碎碎念不可用"` | `"В текущем чате не выбрана модель — бормотание недоступно"` |
| `src/shared/whisper.ts` | `"碎碎念生成失败"` | `"Не удалось сгенерировать бормотание"` |
| `src/shared/balance/view.ts` | `"当前服务商暂不支持余额查询"` | `"Провайдер не поддерживает запрос баланса"` |
| `src/shared/balance/view.ts` | `"当前服务商："` | `"Провайдер: "` |
| `src/shared/balance/view.ts` | `"缺少余额查询凭证"` | `"Нет учётных данных для баланса"` |
| `src/shared/balance/view.ts` | `"余额查询失败"` | `"Не удалось получить баланс"` |
| `src/shared/balance/handlers/money.ts` | `"余额 "` | `"Баланс "` |
| `src/shared/balance/handlers/money.ts` | `"余额（"` | `"Баланс ("` |
| `src/shared/balance/handlers/money.ts` | `"峰"` | `"пик"` |
| `src/shared/balance/handlers/money.ts` | `"谷"` | `"спад"` |
| `src/shared/balance/handlers/points.ts` | `"积分数据不可用"` | `"Данные о баллах недоступны"` |
| `src/shared/balance/handlers/points.ts` | `"余额 "` | `"Баланс "` |
| `src/shared/balance/handlers/windows.ts` | `weekly: "周"` | `weekly: "неделя"` |
| `src/shared/balance/handlers/windows.ts` | `monthly: "月"` | `monthly: "месяц"` |
| `src/shared/balance/handlers/windows.ts` | `"已重置"` | `"сброшено"` |
| `src/shared/balance/handlers/windows.ts` | `" 天"` | `" дн."` |
| `src/shared/balance/handlers/windows.ts` | `" 小时"` | `" ч"` |
| `src/shared/balance/handlers/windows.ts` | `"重置时间未知"` | `"Время сброса неизвестно"` |
| `src/shared/balance/handlers/windows.ts` | `reset + "重置"` | `reset + " до сброса"` |
| `src/shared/balance/handlers/windows.ts` | `"额度数据不可用"` | `"Данные о лимитах недоступны"` |
| `src/shared/balance/handlers/windows.ts` | `w.label + "额度已用 " + Math.round(w.percent) + "%"` | `"Использовано " + Math.round(w.percent) + "% (" + w.label + ")"` |
| `src/shared/balance/handlers/windows.ts` | `" 入"` | `" вход."` |
| `src/shared/balance/handlers/windows.ts` | `" 出"` | `" выход."` |
| `src/shared/balance/handlers/windows.ts` | `const period = "本期 " + u.requests + " 次";` | `const period = "Период: " + u.requests + " запр.";` |
| `src/shared/score-popup.ts` | `"速度 "` | `"Скорость "` |
| `src/shared/score-popup.ts` | `" · 大小 "` | `" · размер "` |
| `src/shared/todo/render.ts` | `"还没有待办。记一件要做的事，到点我会提醒你～"` | `"Пока пусто. Запишите дело — напомню вовремя."` |
| `src/shared/todo/render.ts` | `"待办事项"` | `"Задачи"` |
| `src/shared/todo/render.ts` | `"0 项未完成"` | `"0 не выполнено"` |
| `src/shared/todo/render.ts` | `"关闭待办面板"` | `"Закрыть панель задач"` |
| `src/shared/todo/render.ts` | `"记一件要做的事…"` | `"Что нужно сделать…"` |
| `src/shared/todo/render.ts` | `"待办内容"` | `"Текст задачи"` |
| `src/shared/todo/render.ts` | `"添加"` | `"Добавить"` |
| `src/shared/todo/render.ts` | `"离到期越近，我会提醒得越勤快～"` | `"Чем ближе срок, тем чаще напомню"` |
| `src/shared/todo/render.ts` | `"标记未完成："` | `"Отметить невыполненным: "` |
| `src/shared/todo/render.ts` | `"标记完成："` | `"Отметить выполненным: "` |
| `src/shared/todo/render.ts` | `"删除："` | `"Удалить: "` |
| `src/shared/todo/render.ts` | `"确认"` | `"Подтвердить"` |
| `src/shared/todo/render.ts` | ``${pending} 项未完成`` | ``${pending} не выполнено`` |
| `src/shared/todo/panel.ts` | `"清单加载失败，关掉面板再开一次试试"` | `"Не удалось загрузить список — закройте и откройте панель"` |
| `src/shared/todo/panel.ts` | `"这个时间已经过去了，换一个吧"` | `"Это время уже прошло, выберите другое"` |
| `src/shared/todo/panel.ts` | `"加载中…"` | `"Загрузка…"` |
| `src/shared/todo/api.ts` | `"响应不是 JSON"` | `"Ответ не JSON"` |
| `src/shared/todo/api.ts` | `"请求被拒绝"` | `"Запрос отклонён"` |
| `src/shared/todo/api.ts` | `"连不上桌宠服务："` | `"Нет связи со службой питомца: "` |
| `src/shared/todo/api.ts` | `"响应里没有有效的待办"` | `"В ответе нет корректных задач"` |
| `src/shared/todo/format.ts` | `const WEEKDAYS = [\n	"周日",\n	"周一",\n	"周二",\n	"周三",\n	"周四",\n	"周五",\n	"周六"\n];` | `const WEEKDAYS = [\n	"Вс",\n	"Пн",\n	"Вт",\n	"Ср",\n	"Чт",\n	"Пт",\n	"Сб"\n];` |
| `src/shared/todo/format.ts` | `"无期限"` | `"Без срока"` |
| `src/shared/todo/format.ts` | `"已完成"` | `"Выполнено"` |
| `src/shared/todo/format.ts` | ``已完成 · ${dueLabel(todo.dueAt, now)}`` | ``Выполнено · ${dueLabel(todo.dueAt, now)}`` |
| `src/shared/todo/format.ts` | ``${minutes}分钟`` | ``${minutes} мин`` |
| `src/shared/todo/format.ts` | ``${hours}小时`` | ``${hours} ч`` |
| `src/shared/todo/format.ts` | ``今天 ${clock}`` | ``Сегодня, ${clock}`` |
| `src/shared/todo/format.ts` | ``明天 ${clock}`` | ``Завтра, ${clock}`` |
| `src/shared/todo/format.ts` | ``后天 ${clock}`` | ``Послезавтра, ${clock}`` |
| `src/shared/todo/format.ts` | ``已逾期${spanText(now - dueAt)}`` | ``Просрочено: ${spanText(now - dueAt)}`` |
| `src/shared/todo/format.ts` | ``还剩${spanText(dueAt - now)}`` | ``Осталось: ${spanText(dueAt - now)}`` |
| `src/shared/todo/due-picker.ts` | `const WEEK_HEAD = [\n	"一",\n	"二",\n	"三",\n	"四",\n	"五",\n	"六",\n	"日"\n];` | `const WEEK_HEAD = [\n	"Пн",\n	"Вт",\n	"Ср",\n	"Чт",\n	"Пт",\n	"Сб",\n	"Вс"\n];` |
| `src/shared/todo/due-picker.ts` | `"无期限"` | `"Без срока"` |
| `src/shared/todo/due-picker.ts` | `"提醒时间（可选）"` | `"Время напоминания (необязательно)"` |
| `src/shared/todo/due-picker.ts` | `"选择提醒时间"` | `"Выбрать время напоминания"` |
| `src/shared/todo/due-picker.ts` | `"上个月"` | `"Прошлый месяц"` |
| `src/shared/todo/due-picker.ts` | `"下个月"` | `"Следующий месяц"` |
| `src/shared/todo/due-picker.ts` | `"今天"` | `"Сегодня"` |
| `src/shared/todo/due-picker.ts` | `"清除"` | `"Очистить"` |
| `src/shared/todo/due-picker.ts` | `"选择小时"` | `"Выбрать час"` |
| `src/shared/todo/due-picker.ts` | `"选择分钟"` | `"Выбрать минуту"` |
| `src/shared/todo/due-picker.ts` | `"完成"` | `"Готово"` |
| `src/shared/todo/due-picker.ts` | `${value} ${isHour ? "时" : "分"}` | `${value} ${isHour ? "ч" : "мин"}` |
| `src/shared/chat/dom.ts` | `"说点什么…"` | `"Напишите что-нибудь…"` |
| `src/shared/chat/dom.ts` | `"上传图片"` | `"Загрузить картинку"` |
| `src/shared/chat/dom.ts` | `"截取当前屏幕"` | `"Снимок экрана"` |
| `src/shared/chat/dom.ts` | `"按住说话"` | `"Удерживать для речи"` |
| `src/shared/chat/dom.ts` | `"已选图片"` | `"Выбранная картинка"` |
| `src/shared/chat/dom.ts` | `"移除图片"` | `"Убрать картинку"` |
| `src/shared/chat/dom.ts` | `"只支持 PNG / JPEG / WebP / GIF"` | `"Только PNG / JPEG / WebP / GIF"` |
| `src/shared/chat/dom.ts` | `"读图失败："` | `"Не удалось прочитать картинку: "` |
| `src/shared/chat/dom.ts` | `"截屏失败："` | `"Не удалось сделать снимок: "` |
| `src/shared/chat/dom.ts` | `"当前环境不支持截屏，先用上传试试"` | `"Снимок экрана здесь недоступен — попробуйте загрузить файл"` |
| `src/shared/chat/dialog.ts` | `"图片还在处理，稍等一下"` | `"Картинка ещё обрабатывается, секунду"` |
| `src/shared/chat/dialog.ts` | `"对话失败："` | `"Ошибка чата: "` |
| `src/shared/chat/dialog.ts` | `"对话异常："` | `"Сбой чата: "` |
| `src/shared/chat/send.ts` | `"dsh-pet: 对话响应非法"` | `"dsh-pet: некорректный ответ чата"` |
| `src/shared/chat/capture.ts` | `"当前环境不支持截屏"` | `"Снимок экрана здесь недоступен"` |
| `src/shared/chat/encode.ts` | `"这个文件读不出来"` | `"Не удалось прочитать файл"` |
| `src/shared/chat/encode.ts` | `"这个文件解不出图片"` | `"Из файла не получается картинка"` |
| `src/shared/chat/encode.ts` | `"无法压到预算内"` | `"Не удалось уложиться в лимит размера"` |
| `src/shared/chat/encode.ts` | `"不是可发送的图片"` | `"Это не отправляемая картинка"` |
| `src/shared/chat/hear-control.ts` | `"当前地址不支持录音：用 https 或 localhost 打开才有麦克风"` | `"Запись недоступна по этому адресу: нужен https или localhost"` |
| `src/shared/chat/hear-control.ts` | `"这个入口没有接上识别地址"` | `"К этому входу не подключён адрес распознавания"` |
| `src/shared/chat/hear-control.ts` | `"这个宿主没开语音识别"` | `"В этом хосте распознавание речи выключено"` |
| `src/shared/chat/hear-control.ts` | `"音频没通过宿主校验"` | `"Аудио не прошло проверку хоста"` |
| `src/shared/chat/hear-control.ts` | `"识别请求失败："` | `"Запрос распознавания не удался: "` |
| `src/shared/chat/hear-control.ts` | `"识别失败："` | `"Распознавание не удалось: "` |
| `src/shared/chat/hear-control.ts` | `"未知原因"` | `"Причина неизвестна"` |
| `src/shared/chat/hear-control.ts` | `"识别中…"` | `"Распознаю…"` |
| `src/shared/chat/hear-control.ts` | `"没录到声音"` | `"Звук не записался"` |
| `src/shared/chat/hear-control.ts` | `"没听到声音，检查一下麦克风"` | `"Ничего не слышно, проверьте микрофон"` |
| `src/shared/chat/hear-control.ts` | `"没听清，再说一次"` | `"Не разобрала, повторите"` |
| `src/shared/chat/hear-control.ts` | `"录音出错："` | `"Ошибка записи: "` |
| `src/shared/chat/hear-control.ts` | `"正在打开麦克风…"` | `"Включаю микрофон…"` |
| `src/shared/chat/hear-control.ts` | `"打不开麦克风："` | `"Не удалось включить микрофон: "` |
| `src/shared/hear.ts` | `"识别响应不是 JSON"` | `"Ответ распознавания не JSON"` |
| `src/client/pet/card/entry.ts` | `"截屏失败："` | `"Не удалось сделать снимок: "` |
| `src/shared/chat/hear-control.ts` | `"录音中 "` | `"Запись "` |
| `src/shared/chat/hear-control.ts` | `" · 松开结束"` | `" · отпустите, чтобы закончить"` |
| `src/client/chat/state.ts` | `"宠"` | `"Питомец"` |
| `src/client/settings/avatar-upload.ts` | `"浏览器不支持缩放这张图"` | `"Браузер не может уменьшить эту картинку"` |
| `src/client/settings/avatar-upload.ts` | `"上传失败（HTTP "` | `"Загрузка не удалась (HTTP "` |
| `src/client/settings/avatar-upload.ts` | `"上传失败"` | `"Загрузка не удалась"` |
| `src/client/baifan/constants.ts` | `"吃白饭"` | `"Поесть риса"` |
| `src/client/baifan/constants.ts` | `"开饭了——"` | `"Еда пришла!"` |
| `src/client/baifan/constants.ts` | `"白饭时间到！"` | `"Время риса!"` |
| `src/client/baifan/constants.ts` | `"饿了饿了饿了"` | `"Голодная, голодная!"` |
| `src/client/baifan/constants.ts` | `"等我下去……"` | `"Сейчас спущусь…"` |
| `src/client/baifan/constants.ts` | `"下面有饭香"` | `"Внизу пахнет едой"` |
| `src/client/baifan/constants.ts` | `"让一让，我下去了"` | `"Дай пройти, я вниз"` |
| `src/client/baifan/constants.ts` | `"饭呢？饭呢？"` | `"Где еда? Где еда?"` |
| `src/client/baifan/constants.ts` | `"快点快点"` | `"Быстрее, быстрее"` |
| `src/client/baifan/constants.ts` | `"……还没好吗"` | `"…ещё не готово?"` |
| `src/client/baifan/constants.ts` | `"掉下来了！"` | `"Падает!"` |
| `src/client/baifan/constants.ts` | `"接住！"` | `"Ловлю!"` |
| `src/client/baifan/constants.ts` | `"来了来了"` | `"Уже иду"` |
| `src/client/baifan/constants.ts` | `"碗饭最香"` | `"Из миски вкуснее"` |
| `src/client/baifan/constants.ts` | `"这个碗我要了"` | `"Эту миску забираю"` |
| `src/client/baifan/constants.ts` | `"再来一碗"` | `"Ещё миску"` |
| `src/client/baifan/constants.ts` | `"饭团饭团"` | `"Онигири, онигири"` |
| `src/client/baifan/constants.ts` | `"一口一个"` | `"Одно за другим"` |
| `src/client/baifan/constants.ts` | `"捏得刚好"` | `"Слеплено идеально"` |
| `src/client/baifan/constants.ts` | `"嗝——还能吃！"` | `"Ик… ещё могу!"` |
| `src/client/baifan/constants.ts` | `"这点不够塞牙缝"` | `"Этого мало"` |
| `src/client/baifan/constants.ts` | `"再来十份"` | `"Ещё десять порций"` |
| `src/client/baifan/show.ts` | `"点播失败："` | `"Не удалось запустить: "` |
| `src/client/baifan/show.ts` | `"这一页找不到这只宠物"` | `"Питомец не найден на этой странице"` |
| `src/client/baifan/show.ts` | `"锁丢了，表演结束"` | `"Блокировка потеряна, сцена окончена"` |
| `src/client/baifan/show.ts` | `"用户接管，已收场"` | `"Пользователь вмешался, сцена закрыта"` |
| `src/client/baifan/show.ts` | `"重新开始"` | `"Начать заново"` |
| `src/client/baifan/show.ts` | `"吃白饭 —— 开饭了"` | `"Рис — к столу!"` |
| `src/client/baifan/lock.ts` | `"这只宠物没显示在网页里（display="` | `"Питомец не отображается в вебе (display="` |
| `src/client/baifan/lock.ts` | `"取锁失败："` | `"Не удалось захватить блокировку: "` |
| `src/client/baifan/lock.ts` | `"上一场还没收干净，等它过期…"` | `"Прошлая сцена ещё не закрылась, подождём…"` |
| `src/client/baifan/lock.ts` | `"宠物被别人占着，等会儿再试"` | `"Питомца занял кто-то другой, попробуйте позже"` |

## lib/index.js

| Модуль | Было | Стало |
| --- | --- | --- |
| `src/host/plugin/command-balance.ts` | `"手动触发桌宠余额显示（立即弹出余额气泡）"` | `"Показать баланс питомца (сразу всплывает пузырь с балансом)"` |
| `src/host/plugin/command-chat.ts` | `"与桌宠对话：留空 = 碎碎念一句；输入消息 = 正常对话"` | `"Чат с питомцем: пусто = одна фраза-бормотание; текст = обычный диалог"` |
| `src/host/plugin/command-pet.ts` | `"选择桌宠（/chat 对话的目标；支持选择框或手输 id/名字）"` | `"Выбрать питомца (цель /chat; можно выбрать из списка или ввести id/имя)"` |
| `src/host/voice/voices.ts` | `"晓晓"` | `"Сяосяо"` |
| `src/host/voice/voices.ts` | `"女 · 通用"` | `"жен. · универсальный"` |
| `src/host/voice/voices.ts` | `"晓伊"` | `"Сяои"` |
| `src/host/voice/voices.ts` | `"女 · 活泼"` | `"жен. · живой"` |
| `src/host/voice/voices.ts` | `"云希"` | `"Юньси"` |
| `src/host/voice/voices.ts` | `"男 · 年轻"` | `"муж. · молодой"` |
| `src/host/voice/voices.ts` | `"云健"` | `"Юньцзянь"` |
| `src/host/voice/voices.ts` | `"男 · 沉稳"` | `"муж. · спокойный"` |
| `src/host/balance/index.ts` | `"余额查询超时（20 秒），请稍后重试"` | `"Запрос баланса не уложился в 20 секунд, попробуйте позже"` |
| `src/host/balance/index.ts` | `"缺少凭证 "` | `"Нет учётных данных "` |
| `src/host/balance/index.ts` | `"缺少账号服务（"` | `"Нет сервиса аккаунта ("` |
| `src/host/balance/providers/deepseek-account.ts` | `"dsh-pet: 账号未登录（deepseek-account）"` | `"dsh-pet: аккаунт не авторизован (deepseek-account)"` |
| `src/host/balance/providers/deepseek-account.ts` | `"dsh-pet: 账号余额查询失败"` | `"dsh-pet: не удалось получить баланс аккаунта"` |
| `src/host/balance/providers/deepseek-account.ts` | `"dsh-pet: 账号没有充值钱包余额"` | `"dsh-pet: у аккаунта нет баланса пополняемого кошелька"` |
| `src/host/balance/providers/deepseek-account.ts` | `"dsh-pet: 账号钱包结构非法"` | `"dsh-pet: некорректная структура кошелька аккаунта"` |
| `src/host/balance/providers/deepseek-account.ts` | `"dsh-pet: 缺少账号服务（"` | `"dsh-pet: нет сервиса аккаунта ("` |
| `src/host/routes/chat.ts` | `"消息为空"` | `"Сообщение пустое"` |
| `src/host/routes/chat.ts` | `"消息过长（限 2000 字）"` | `"Сообщение слишком длинное (лимит 2000 символов)"` |
| `src/host/routes/chat.ts` | `"当前模式不支持图片（缺少附件服务）"` | `"В этом режиме картинки не поддерживаются (нет сервиса вложений)"` |
| `src/host/routes/chat.ts` | `"附件服务未返回图片引用"` | `"Сервис вложений не вернул ссылку на картинку"` |
| `src/host/anim.ts` | `"没有这个动画："` | `"Нет такой анимации: "` |
| `src/host/plugin/command-chat.ts` | `"[消息]（留空 = 碎碎念）"` | `"[сообщение] (пусто = бормотание)"` |

## runtime/electron-helper/shared-core.js

| Модуль | Было | Стало |
| --- | --- | --- |
| `src/shared/menu/tree.ts` | `"仅网页"` | `"Только в браузере"` |
| `src/shared/menu/tree.ts` | `"仅桌面"` | `"Только на столе"` |
| `src/shared/menu/tree.ts` | `"两者"` | `"Везде"` |
| `src/shared/menu/tree.ts` | `"都不"` | `"Нигде"` |
| `src/shared/menu/tree.ts` | `"显示位置"` | `"Где показывать"` |
| `src/shared/menu/tree.ts` | `"更多"` | `"Ещё"` |
| `src/shared/menu/tree.ts` | `"余额档位"` | `"Уровни баланса"` |
| `src/shared/menu/tree.ts` | `"碎碎念"` | `"Бормотание"` |
| `src/shared/menu/tree.ts` | `"工作状态"` | `"Рабочий статус"` |
| `src/shared/menu/tree.ts` | `["待机", animations.idle]` | `["Ожидание", animations.idle]` |
| `src/shared/menu/tree.ts` | `["转向", animations.turn]` | `["Повороты", animations.turn]` |
| `src/shared/menu/tree.ts` | `["拖拽", animations.drag]` | `["Перетаскивание", animations.drag]` |
| `src/shared/menu/tree.ts` | `["点击回应", animations.clicks]` | `["Реакция на клик", animations.clicks]` |
| `src/shared/menu/tree.ts` | `["移动", animations.moves.actions.map((m) => m.name)]` | `["Передвижение", animations.moves.actions.map((m) => m.name)]` |
| `src/shared/menu/tree.ts` | `label: "动作"` | `label: "Действия"` |
| `src/shared/menu/memes.ts` | `"纳入对话的配图"` | `"Картинки для чата"` |
| `src/shared/menu/memes.ts` | `"其他"` | `"Другое"` |
| `src/shared/menu/memes.ts` | `"配图"` | `"Картинки"` |
| `src/shared/chat/hotkey.ts` | `"L 键"` | `"Клавиша L"` |
| `src/shared/chat/hotkey.ts` | `"S 键"` | `"Клавиша S"` |
| `src/shared/sleep-hotkey.ts` | `"Z 键"` | `"Клавиша Z"` |
| `src/shared/todo/hotkey.ts` | `"D 键"` | `"Клавиша D"` |
| `src/shared/display-hotkey.ts` | `String(index + 1) + " 键"` | `"Клавиша " + String(index + 1)` |
| `src/shared/notify.ts` | `"对话完成"` | `"Ход завершён"` |
| `src/shared/notify.ts` | `"生成失败"` | `"Ошибка генерации"` |
| `src/shared/notify.ts` | `"输出被截断"` | `"Вывод обрезан"` |
| `src/shared/notify.ts` | `"已达到输出 token 上限"` | `"Достигнут лимит токенов"` |
| `src/shared/notify.ts` | `"正在申请权限"` | `"Запрос разрешения"` |
| `src/shared/notify.ts` | `"工具「"` | `"Инструмент «"` |
| `src/shared/notify.ts` | `"」"` | `"»"` |
| `src/shared/notify.ts` | `"："` | `" — "` |
| `src/shared/notify.ts` | `"模型在等你回答"` | `"Модель ждёт ответа"` |
| `src/shared/whisper.ts` | `"当前对话未配置模型，碎碎念不可用"` | `"В текущем чате не выбрана модель — бормотание недоступно"` |
| `src/shared/whisper.ts` | `"碎碎念生成失败"` | `"Не удалось сгенерировать бормотание"` |
| `src/shared/balance/view.ts` | `"当前服务商暂不支持余额查询"` | `"Провайдер не поддерживает запрос баланса"` |
| `src/shared/balance/view.ts` | `"当前服务商："` | `"Провайдер: "` |
| `src/shared/balance/view.ts` | `"缺少余额查询凭证"` | `"Нет учётных данных для баланса"` |
| `src/shared/balance/view.ts` | `"余额查询失败"` | `"Не удалось получить баланс"` |
| `src/shared/balance/handlers/money.ts` | `"余额 "` | `"Баланс "` |
| `src/shared/balance/handlers/money.ts` | `"余额（"` | `"Баланс ("` |
| `src/shared/balance/handlers/money.ts` | `"峰"` | `"пик"` |
| `src/shared/balance/handlers/money.ts` | `"谷"` | `"спад"` |
| `src/shared/balance/handlers/points.ts` | `"积分数据不可用"` | `"Данные о баллах недоступны"` |
| `src/shared/balance/handlers/points.ts` | `"余额 "` | `"Баланс "` |
| `src/shared/balance/handlers/windows.ts` | `weekly: "周"` | `weekly: "неделя"` |
| `src/shared/balance/handlers/windows.ts` | `monthly: "月"` | `monthly: "месяц"` |
| `src/shared/balance/handlers/windows.ts` | `"已重置"` | `"сброшено"` |
| `src/shared/balance/handlers/windows.ts` | `" 天"` | `" дн."` |
| `src/shared/balance/handlers/windows.ts` | `" 小时"` | `" ч"` |
| `src/shared/balance/handlers/windows.ts` | `"重置时间未知"` | `"Время сброса неизвестно"` |
| `src/shared/balance/handlers/windows.ts` | `reset + "重置"` | `reset + " до сброса"` |
| `src/shared/balance/handlers/windows.ts` | `"额度数据不可用"` | `"Данные о лимитах недоступны"` |
| `src/shared/balance/handlers/windows.ts` | `w.label + "额度已用 " + Math.round(w.percent) + "%"` | `"Использовано " + Math.round(w.percent) + "% (" + w.label + ")"` |
| `src/shared/balance/handlers/windows.ts` | `" 入"` | `" вход."` |
| `src/shared/balance/handlers/windows.ts` | `" 出"` | `" выход."` |
| `src/shared/balance/handlers/windows.ts` | `const period = "本期 " + u.requests + " 次";` | `const period = "Период: " + u.requests + " запр.";` |
| `src/shared/score-popup.ts` | `"速度 "` | `"Скорость "` |
| `src/shared/score-popup.ts` | `" · 大小 "` | `" · размер "` |
| `src/shared/todo/render.ts` | `"还没有待办。记一件要做的事，到点我会提醒你～"` | `"Пока пусто. Запишите дело — напомню вовремя."` |
| `src/shared/todo/render.ts` | `"待办事项"` | `"Задачи"` |
| `src/shared/todo/render.ts` | `"0 项未完成"` | `"0 не выполнено"` |
| `src/shared/todo/render.ts` | `"关闭待办面板"` | `"Закрыть панель задач"` |
| `src/shared/todo/render.ts` | `"记一件要做的事…"` | `"Что нужно сделать…"` |
| `src/shared/todo/render.ts` | `"待办内容"` | `"Текст задачи"` |
| `src/shared/todo/render.ts` | `"添加"` | `"Добавить"` |
| `src/shared/todo/render.ts` | `"离到期越近，我会提醒得越勤快～"` | `"Чем ближе срок, тем чаще напомню"` |
| `src/shared/todo/render.ts` | `"标记未完成："` | `"Отметить невыполненным: "` |
| `src/shared/todo/render.ts` | `"标记完成："` | `"Отметить выполненным: "` |
| `src/shared/todo/render.ts` | `"删除："` | `"Удалить: "` |
| `src/shared/todo/render.ts` | `"确认"` | `"Подтвердить"` |
| `src/shared/todo/render.ts` | ``${pending} 项未完成`` | ``${pending} не выполнено`` |
| `src/shared/todo/panel.ts` | `"清单加载失败，关掉面板再开一次试试"` | `"Не удалось загрузить список — закройте и откройте панель"` |
| `src/shared/todo/panel.ts` | `"这个时间已经过去了，换一个吧"` | `"Это время уже прошло, выберите другое"` |
| `src/shared/todo/panel.ts` | `"加载中…"` | `"Загрузка…"` |
| `src/shared/todo/api.ts` | `"响应不是 JSON"` | `"Ответ не JSON"` |
| `src/shared/todo/api.ts` | `"请求被拒绝"` | `"Запрос отклонён"` |
| `src/shared/todo/api.ts` | `"连不上桌宠服务："` | `"Нет связи со службой питомца: "` |
| `src/shared/todo/api.ts` | `"响应里没有有效的待办"` | `"В ответе нет корректных задач"` |
| `src/shared/todo/format.ts` | `const WEEKDAYS = [\n	"周日",\n	"周一",\n	"周二",\n	"周三",\n	"周四",\n	"周五",\n	"周六"\n];` | `const WEEKDAYS = [\n	"Вс",\n	"Пн",\n	"Вт",\n	"Ср",\n	"Чт",\n	"Пт",\n	"Сб"\n];` |
| `src/shared/todo/format.ts` | `"无期限"` | `"Без срока"` |
| `src/shared/todo/format.ts` | `"已完成"` | `"Выполнено"` |
| `src/shared/todo/format.ts` | ``已完成 · ${dueLabel(todo.dueAt, now)}`` | ``Выполнено · ${dueLabel(todo.dueAt, now)}`` |
| `src/shared/todo/format.ts` | ``${minutes}分钟`` | ``${minutes} мин`` |
| `src/shared/todo/format.ts` | ``${hours}小时`` | ``${hours} ч`` |
| `src/shared/todo/format.ts` | ``今天 ${clock}`` | ``Сегодня, ${clock}`` |
| `src/shared/todo/format.ts` | ``明天 ${clock}`` | ``Завтра, ${clock}`` |
| `src/shared/todo/format.ts` | ``后天 ${clock}`` | ``Послезавтра, ${clock}`` |
| `src/shared/todo/format.ts` | ``已逾期${spanText(now - dueAt)}`` | ``Просрочено: ${spanText(now - dueAt)}`` |
| `src/shared/todo/format.ts` | ``还剩${spanText(dueAt - now)}`` | ``Осталось: ${spanText(dueAt - now)}`` |
| `src/shared/todo/due-picker.ts` | `const WEEK_HEAD = [\n	"一",\n	"二",\n	"三",\n	"四",\n	"五",\n	"六",\n	"日"\n];` | `const WEEK_HEAD = [\n	"Пн",\n	"Вт",\n	"Ср",\n	"Чт",\n	"Пт",\n	"Сб",\n	"Вс"\n];` |
| `src/shared/todo/due-picker.ts` | `"无期限"` | `"Без срока"` |
| `src/shared/todo/due-picker.ts` | `"提醒时间（可选）"` | `"Время напоминания (необязательно)"` |
| `src/shared/todo/due-picker.ts` | `"选择提醒时间"` | `"Выбрать время напоминания"` |
| `src/shared/todo/due-picker.ts` | `"上个月"` | `"Прошлый месяц"` |
| `src/shared/todo/due-picker.ts` | `"下个月"` | `"Следующий месяц"` |
| `src/shared/todo/due-picker.ts` | `"今天"` | `"Сегодня"` |
| `src/shared/todo/due-picker.ts` | `"清除"` | `"Очистить"` |
| `src/shared/todo/due-picker.ts` | `"选择小时"` | `"Выбрать час"` |
| `src/shared/todo/due-picker.ts` | `"选择分钟"` | `"Выбрать минуту"` |
| `src/shared/todo/due-picker.ts` | `"完成"` | `"Готово"` |
| `src/shared/todo/due-picker.ts` | `${value} ${isHour ? "时" : "分"}` | `${value} ${isHour ? "ч" : "мин"}` |
| `src/shared/chat/dom.ts` | `"说点什么…"` | `"Напишите что-нибудь…"` |
| `src/shared/chat/dom.ts` | `"上传图片"` | `"Загрузить картинку"` |
| `src/shared/chat/dom.ts` | `"截取当前屏幕"` | `"Снимок экрана"` |
| `src/shared/chat/dom.ts` | `"按住说话"` | `"Удерживать для речи"` |
| `src/shared/chat/dom.ts` | `"已选图片"` | `"Выбранная картинка"` |
| `src/shared/chat/dom.ts` | `"移除图片"` | `"Убрать картинку"` |
| `src/shared/chat/dom.ts` | `"只支持 PNG / JPEG / WebP / GIF"` | `"Только PNG / JPEG / WebP / GIF"` |
| `src/shared/chat/dom.ts` | `"读图失败："` | `"Не удалось прочитать картинку: "` |
| `src/shared/chat/dom.ts` | `"截屏失败："` | `"Не удалось сделать снимок: "` |
| `src/shared/chat/dom.ts` | `"当前环境不支持截屏，先用上传试试"` | `"Снимок экрана здесь недоступен — попробуйте загрузить файл"` |
| `src/shared/chat/dialog.ts` | `"图片还在处理，稍等一下"` | `"Картинка ещё обрабатывается, секунду"` |
| `src/shared/chat/dialog.ts` | `"对话失败："` | `"Ошибка чата: "` |
| `src/shared/chat/dialog.ts` | `"对话异常："` | `"Сбой чата: "` |
| `src/shared/chat/send.ts` | `"dsh-pet: 对话响应非法"` | `"dsh-pet: некорректный ответ чата"` |
| `src/shared/chat/encode.ts` | `"这个文件读不出来"` | `"Не удалось прочитать файл"` |
| `src/shared/chat/encode.ts` | `"这个文件解不出图片"` | `"Из файла не получается картинка"` |
| `src/shared/chat/encode.ts` | `"无法压到预算内"` | `"Не удалось уложиться в лимит размера"` |
| `src/shared/chat/encode.ts` | `"不是可发送的图片"` | `"Это не отправляемая картинка"` |
| `src/shared/chat/hear-control.ts` | `"当前地址不支持录音：用 https 或 localhost 打开才有麦克风"` | `"Запись недоступна по этому адресу: нужен https или localhost"` |
| `src/shared/chat/hear-control.ts` | `"这个入口没有接上识别地址"` | `"К этому входу не подключён адрес распознавания"` |
| `src/shared/chat/hear-control.ts` | `"这个宿主没开语音识别"` | `"В этом хосте распознавание речи выключено"` |
| `src/shared/chat/hear-control.ts` | `"音频没通过宿主校验"` | `"Аудио не прошло проверку хоста"` |
| `src/shared/chat/hear-control.ts` | `"识别请求失败："` | `"Запрос распознавания не удался: "` |
| `src/shared/chat/hear-control.ts` | `"识别失败："` | `"Распознавание не удалось: "` |
| `src/shared/chat/hear-control.ts` | `"未知原因"` | `"Причина неизвестна"` |
| `src/shared/chat/hear-control.ts` | `"识别中…"` | `"Распознаю…"` |
| `src/shared/chat/hear-control.ts` | `"没录到声音"` | `"Звук не записался"` |
| `src/shared/chat/hear-control.ts` | `"没听到声音，检查一下麦克风"` | `"Ничего не слышно, проверьте микрофон"` |
| `src/shared/chat/hear-control.ts` | `"没听清，再说一次"` | `"Не разобрала, повторите"` |
| `src/shared/chat/hear-control.ts` | `"录音出错："` | `"Ошибка записи: "` |
| `src/shared/chat/hear-control.ts` | `"正在打开麦克风…"` | `"Включаю микрофон…"` |
| `src/shared/chat/hear-control.ts` | `"打不开麦克风："` | `"Не удалось включить микрофон: "` |
| `src/shared/hear.ts` | `"识别响应不是 JSON"` | `"Ответ распознавания не JSON"` |
| `src/shared/chat/hear-control.ts` | `"录音中 "` | `"Запись "` |
| `src/shared/chat/hear-control.ts` | `" · 松开结束"` | `" · отпустите, чтобы закончить"` |

## runtime/electron-helper/index.html

| Модуль | Было | Стало |
| --- | --- | --- |
| `None` | `<html lang="zh-CN">` | `<html lang="ru">` |
| `None` | `<title>dsh-pet 桌宠（桌面模式）</title>` | `<title>dsh-pet — питомец (настольный режим)</title>` |

## runtime/electron-helper/sprite/menu.js

| Модуль | Было | Стало |
| --- | --- | --- |
| `None` | `'打开软件'` | `'Открыть приложение'` |
| `None` | `'打开 AI 设置'` | `'Открыть настройки ИИ'` |
| `None` | `'打开网站'` | `'Открыть сайт'` |
| `None` | `'查看余额'` | `'Показать баланс'` |
| `None` | `'待办事项'` | `'Задачи'` |
| `None` | `'碎碎念'` | `'Побормотать'` |
| `None` | `'对话'` | `'Чат'` |
| `None` | `'睡觉'` | `'Спать'` |
| `None` | `'起来'` | `'Проснуться'` |
| `None` | `'重载配置'` | `'Перезагрузить конфиг'` |
| `None` | `'回到初始位置'` | `'Вернуть на место'` |

## runtime/electron-helper/main/tray.js

| Модуль | Было | Стало |
| --- | --- | --- |
| `None` | `{ label: '退出', click: quitApp }` | `{ label: 'Выход', click: quitApp }` |
| `None` | `tray.setToolTip('dsh-pet 桌面宠物')` | `tray.setToolTip('dsh-pet — питомец')` |

## runtime/electron-helper/renderer.js

| Модуль | Было | Стало |
| --- | --- | --- |
| `None` | `'dsh-pet 配置错误：'` | `'dsh-pet: ошибка конфигурации: '` |
| `None` | `' 超出桌面宠物列表（共 '` | `' вне списка питомцев (всего '` |
| `None` | `' 只），本窗口不创建宠物'` | `'), это окно не создаёт питомца'` |
| `None` | `'配置加载失败：'` | `'Не удалось загрузить конфиг: '` |

## runtime/electron-helper/sprite.js

| Модуль | Было | Стало |
| --- | --- | --- |
| `None` | `'Cmd+左键'` | `'Cmd + ЛКМ'` |
| `None` | `'Ctrl+左键'` | `'Ctrl + ЛКМ'` |

