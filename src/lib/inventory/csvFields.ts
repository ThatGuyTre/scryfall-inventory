import { CardFinish } from "./types";

/**
 * Readers shared by every collection-CSV importer.
 *
 * ManaBox and Deckbox disagree about almost everything — column names, how a
 * foil is spelled, whether a condition is "near_mint" or "Near Mint" — but they
 * agree on the shapes of the values underneath. These functions are that
 * agreement, so a new importer describes its columns and inherits the
 * interpretation.
 */

/**
 * Reads a value from a record, trying each accepted heading in turn.
 *
 * @param record One CSV row keyed by normalized heading
 * @param keys The normalized headings to try, most preferred first
 * @returns The first non-empty value found, or an empty string
 */
export function field(record: Record<string, string>, ...keys: string[]): string {
	for (const key of keys) {
		const value = record[key];

		if (value) {
			return value;
		}
	}

	return "";
}

/**
 * Interprets the several ways an export may spell a boolean.
 *
 * Deckbox marks a flag by putting anything at all in the column and leaves it
 * empty otherwise, so a bare non-empty value counts as true.
 *
 * @param value The raw column value
 * @returns Whether the value reads as true
 */
export function parseBoolean(value: string): boolean {
	const normalized = value.trim().toLowerCase();

	if (!normalized) {
		return false;
	}

	return normalized !== "false" && normalized !== "0" && normalized !== "no";
}

/**
 * Interprets a quantity.
 *
 * @param value The raw column value
 * @returns A non-negative integer, or null when the value is not a number
 */
export function parseQuantity(value: string): number | null {
	const quantity = Number.parseInt(value.trim(), 10);

	if (!Number.isFinite(quantity) || quantity < 0) {
		return null;
	}

	return quantity;
}

/**
 * Interprets a price, which may carry a currency symbol.
 *
 * @param value The raw column value
 * @returns The price, or null when absent or unparseable
 */
export function parsePrice(value: string): number | null {
	if (!value.trim()) {
		return null;
	}

	const price = Number.parseFloat(value.replace(/[^0-9.-]/g, ""));

	return Number.isFinite(price) ? price : null;
}

/**
 * Interprets a finish column.
 *
 * ManaBox names the variant outright ("normal", "foil", "etched"). Deckbox
 * leaves the column empty for a normal card and writes "foil" otherwise, so
 * anything unrecognised but present is treated as a foil rather than discarded.
 *
 * @param value The raw column value
 * @returns The finish
 */
export function parseFinish(value: string): CardFinish {
	const normalized = value.trim().toLowerCase();

	if (!normalized || normalized === "normal" || normalized === "none") {
		return "normal";
	}

	if (normalized.includes("etched")) {
		return "etched";
	}

	return "foil";
}

/**
 * Condition names as the exporters write them, mapped to one vocabulary.
 *
 * ManaBox already writes snake_case values, so they pass through. Deckbox writes
 * prose, including its own name for lightly played. Normalizing here means a
 * collection imported from either app compares the same way.
 */
const CONDITIONS: Record<string, string> = {
	mint: "mint",
	nearmint: "near_mint",
	nm: "near_mint",
	excellent: "excellent",
	goodlightlyplayed: "light_played",
	lightlyplayed: "light_played",
	lightplayed: "light_played",
	good: "good",
	played: "played",
	heavilyplayed: "heavily_played",
	poor: "poor",
	damaged: "poor",
};

/**
 * Interprets a condition column.
 *
 * @param value The raw column value
 * @returns A normalized condition, or "unknown" when absent
 */
export function parseCondition(value: string): string {
	const raw = value.trim();

	if (!raw) {
		return "unknown";
	}

	const key = raw.toLowerCase().replace(/[^a-z]/g, "");

	// Unrecognised conditions keep their own shape rather than being flattened
	// into "unknown", so nothing is silently reinterpreted.
	return CONDITIONS[key] ?? raw.toLowerCase().replace(/\s+/g, "_");
}

/** Language names as exporters write them, mapped to the codes ManaBox uses. */
const LANGUAGES: Record<string, string> = {
	english: "en",
	spanish: "es",
	french: "fr",
	german: "de",
	italian: "it",
	portuguese: "pt",
	japanese: "ja",
	korean: "ko",
	russian: "ru",
	simplifiedchinese: "zhs",
	traditionalchinese: "zht",
	chinese: "zhs",
};

/**
 * Interprets a language column.
 *
 * ManaBox writes codes, Deckbox writes names. Both end up as a code.
 *
 * @param value The raw column value
 * @returns A language code, defaulting to English
 */
export function parseLanguage(value: string): string {
	const raw = value.trim().toLowerCase();

	if (!raw) {
		return "en";
	}

	return LANGUAGES[raw.replace(/[^a-z]/g, "")] ?? raw;
}
