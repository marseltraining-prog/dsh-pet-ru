/**
 * POST /dsh-pet-7340/voice/mute — глобальный тумблер озвучки.
 *
 * Меняет только `voiceEnabled` в пользовательском main-config.jsonc. Выключенная
 * озвучка не доходит до синтеза (host не выставляет `voiceTo`), поэтому квота Gemini
 * не тратится. Остальные поля — `pets`, `voiceName`, `voiceProvider`, `memes`, … —
 * переносятся как есть: файл читается целиком, меняется один ключ и пишется обратно
 * тем же путём и в том же формате, что `PUT /config` (JSON, 2 пробела, без хвостового
 * перевода строки).
 *
 * Модуль намеренно не тянет внутренности бандла `lib/index.js`: его можно импортировать
 * и прогнать в песочнице без запуска DSH. Всё, что нужно снаружи, — пути конфига.
 *
 * @module dsh-pet/lib/voice-mute
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Удаляет комментарии JSONC вне строк — копия `stripJsonc` из `src/host/config/jsonc.ts`
 * (бандл не экспортирует её, а тянуть весь `lib/index.js` ради 20 строк нельзя).
 *
 * @param {string} src - сырой текст файла.
 * @returns {string} текст без комментариев, пригодный для JSON.parse.
 */
export function stripJsonc(src) {
	let out = "";
	let inString = false;
	for (let i = 0; i < src.length; i++) {
		const ch = src[i];
		if (inString) {
			out += ch;
			if (ch === "\\" && i + 1 < src.length) out += src[++i];
			else if (ch === "\"") inString = false;
		} else if (ch === "\"") {
			inString = true;
			out += ch;
		} else if (ch === "/" && src[i + 1] === "/") {
			out += " ";
			while (i + 1 < src.length && src[i + 1] !== "\r" && src[i + 1] !== "\n") i++;
		} else if (ch === "/" && src[i + 1] === "*") {
			const end = src.indexOf("*/", i + 2);
			if (end === -1) throw new SyntaxError("Unterminated JSONC block comment");
			out += src.slice(i, end + 2).replace(/[^\r\n]/g, " ");
			i = end + 1;
		} else out += ch;
	}
	return out.trim();
}

/**
 * Эффективный пользовательский конфиг: `.jsonc`, иначе legacy `.json`
 * (та же приоритетность, что у `effectiveUserFile` в host).
 *
 * @param {{ userFile?: string, legacyUserFile?: string }} [configPaths]
 * @returns {string|undefined}
 */
function effectiveUserFile(configPaths) {
	if (configPaths && typeof configPaths.userFile === "string" && existsSync(configPaths.userFile)) {
		return configPaths.userFile;
	}
	const legacy = configPaths?.legacyUserFile;
	if (typeof legacy === "string" && existsSync(legacy)) return legacy;
	return undefined;
}

/**
 * Прочитать JSONC-файл и вернуть объект. Битый файл — исключение: перезаписывать
 * его «на всякий случай» нельзя, там могут быть все настройки пользователя.
 *
 * @param {string} file
 * @returns {Promise<Record<string, unknown>>}
 */
async function readJsonc(file) {
	const raw = await readFile(file, "utf8");
	const parsed = JSON.parse(stripJsonc(raw));
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error("not a JSON object");
	}
	return parsed;
}

/**
 * Обработчик маршрута без HTTP-слоя: `{ method, body }` → `{ status, obj }`.
 *
 * Контракт тела: `{ "muted": true|false }`. `muted:true` → `voiceEnabled:false`,
 * `muted:false` → `voiceEnabled:true`. Поле создаётся, если его не было.
 *
 * @param {{ method?: string, body?: string }} input
 * @param {{ configPaths?: object, userConfigPath?: string }} deps
 * @returns {Promise<{ status: number, obj: Record<string, unknown> }>}
 */
export async function voiceMuteRoute(input, deps) {
	const method = input?.method;
	if (method !== "POST") {
		return {
			status: 405,
			obj: { ok: false, reason: "method-not-allowed", message: "method not allowed" }
		};
	}
	let parsed;
	try {
		parsed = JSON.parse(input.body ?? "null");
	} catch {
		return {
			status: 400,
			obj: { ok: false, reason: "invalid-json", message: "invalid JSON body" }
		};
	}
	const muted = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed.muted : undefined;
	if (typeof muted !== "boolean") {
		return {
			status: 200,
			obj: { ok: false, reason: "bad-request", message: "muted 必须是布尔值" }
		};
	}

	const readPath = effectiveUserFile(deps?.configPaths);
	let existing = {};
	if (readPath !== undefined) {
		try {
			existing = await readJsonc(readPath);
		} catch {
			return {
				status: 200,
				obj: {
					ok: false,
					reason: "user-config-unparsable",
					message: "用户配置无法解析，未写入：" + readPath
				}
			};
		}
	}

	const voiceEnabled = muted !== true;
	// Spread сохраняет и pets, и незнакомые поля (voiceProvider, voiceStyle, voiceFallback…),
	// которые host не знает: они не теряются при записи.
	const next = { ...existing, voiceEnabled };
	const writePath =
		typeof deps?.userConfigPath === "string" && deps.userConfigPath !== ""
			? deps.userConfigPath
			: deps?.configPaths?.userFile;
	if (typeof writePath !== "string" || writePath === "") {
		return {
			status: 200,
			obj: { ok: false, reason: "generate-error", message: "не задан путь пользовательского конфига" }
		};
	}
	try {
		await mkdir(dirname(writePath), { recursive: true });
		await writeFile(writePath, JSON.stringify(next, null, 2), "utf8");
	} catch (error) {
		return {
			status: 200,
			obj: {
				ok: false,
				reason: "generate-error",
				message: "failed to save config: " + (error instanceof Error ? error.message : String(error))
			}
		};
	}
	return {
		status: 200,
		obj: { ok: true, muted: muted === true, voiceEnabled }
	};
}
