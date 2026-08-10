import { parseCsvRecords } from "../csv";
import { buildCardId, buildLocationKey } from "./card";
import { CardFinish, CardLocation, InventoryCard, UNASSIGNED_LOCATION_KIND } from "./types";

/**
 * Reads a ManaBox collection export into {@link InventoryCard} rows.
 *
 * A ManaBox export looks like this, though the exact columns have drifted
 * between app versions:
 *
 *   Name,Set code,Set name,Collector number,Foil,Rarity,Quantity,ManaBox ID,
 *   Scryfall ID,Purchase price,Misprint,Altered,Condition,Language,
 *   Purchase price currency
 *
 * Columns are therefore matched by normalized heading rather than by position,
 * unrecognized columns are ignored, and only Name and Quantity are actually
 * required. That keeps older and newer exports importable without a code change.
 *
 * Where a card is kept comes from the "Binder Name" and "Binder Type" columns.
 * Rows without a binder name are filed as unassigned.
 */

/** Thrown when the file is readable but is clearly not a ManaBox export. */
export class ManaBoxFormatError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ManaBoxFormatError";
	}
}

/** The outcome of reading a file, before anything is written to storage. */
export type ManaBoxParseResult = {
	/** Cards folded down to one row per unique printing/finish/condition. */
	cards: InventoryCard[],
	/** Data rows found in the file. */
	rowsParsed: number,
	/** Rows that could not be used. */
	rowsSkipped: number,
	/** Human readable notes, capped so a bad file cannot flood the response. */
	warnings: string[],
}

/** How many warnings are worth showing before they stop being informative. */
const MAX_WARNINGS = 20;

/**
 * Reads a value from a record, trying each accepted heading in turn.
 *
 * @param record One CSV row keyed by normalized heading
 * @param keys The normalized headings to try, most preferred first
 * @returns The first non-empty value found, or an empty string
 */
function field(record: Record<string, string>, ...keys: string[]): string {
	for (const key of keys) {
		const value = record[key];

		if (value) {
			return value;
		}
	}

	return "";
}

/**
 * Interprets ManaBox's Foil column, which names a printing variant.
 *
 * @param value The raw column value
 * @returns The finish, defaulting to "normal"
 */
function parseFinish(value: string): CardFinish {
	const normalized = value.trim().toLowerCase();

	if (normalized === "foil") {
		return "foil";
	}

	if (normalized === "etched") {
		return "etched";
	}

	return "normal";
}

/**
 * Interprets the several ways an export may spell a boolean.
 *
 * @param value The raw column value
 * @returns Whether the value reads as true
 */
function parseBoolean(value: string): boolean {
	const normalized = value.trim().toLowerCase();

	return normalized === "true" || normalized === "1" || normalized === "yes";
}

/**
 * Interprets a quantity.
 *
 * @param value The raw column value
 * @returns A non-negative integer, or null when the value is not a number
 */
function parseQuantity(value: string): number | null {
	const quantity = Number.parseInt(value.trim(), 10);

	if (!Number.isFinite(quantity) || quantity < 0) {
		return null;
	}

	return quantity;
}

/**
 * Interprets a purchase price, which is optional and often blank.
 *
 * @param value The raw column value
 * @returns The price, or null when absent or unparseable
 */
function parsePrice(value: string): number | null {
	if (!value.trim()) {
		return null;
	}

	const price = Number.parseFloat(value.replace(/[^0-9.-]/g, ""));

	return Number.isFinite(price) ? price : null;
}

/**
 * Works out where a row's cards are kept.
 *
 * Rows that name no binder are filed as unassigned, which is a location like
 * any other rather than a special case — it can be filtered to and counted.
 *
 * @param record One CSV row keyed by normalized heading
 * @returns The kind and name to file these cards under
 */
function parseLocation(record: Record<string, string>): CardLocation {
	const name = field(record, "bindername", "binder", "folder", "foldername", "deck", "deckname");
	const kind = field(record, "bindertype", "foldertype", "type").toLowerCase();

	if (name) {
		return { kind: kind || "binder", name };
	}

	return { kind: UNASSIGNED_LOCATION_KIND, name: "" };
}

/**
 * Parses a ManaBox CSV export.
 *
 * Rows describing the same physical card — same printing, finish, condition,
 * language, alteration and location — are folded together with their
 * quantities summed, so a file that lists a card twice in the same binder
 * imports as one row of two, while the same card in two decks stays on two.
 *
 * @param csvText The raw contents of the exported .csv file
 * @param importedAt ISO timestamp stamped onto every row produced
 * @returns The cards to store plus counts and warnings for the summary
 * @throws {ManaBoxFormatError} When the file has no usable header row
 */
export function parseManaBoxCsv(csvText: string, importedAt: string): ManaBoxParseResult {
	const { headers, records } = parseCsvRecords(csvText);

	if (headers.length === 0) {
		throw new ManaBoxFormatError("That file is empty.");
	}

	if (!headers.includes("name") || !headers.includes("quantity")) {
		throw new ManaBoxFormatError(
			"That does not look like a ManaBox export — a \"Name\" and a \"Quantity\" column are required. " +
			`Found: ${headers.filter(Boolean).join(", ") || "no columns"}.`,
		);
	}

	// Keyed by card id so duplicates within the file collapse as we go.
	const byId = new Map<string, InventoryCard>();
	const warnings: string[] = [];
	let rowsSkipped = 0;

	/**
	 * Records a warning, keeping only the first {@link MAX_WARNINGS}.
	 *
	 * @param message What went wrong
	 */
	function warn(message: string): void {
		if (warnings.length < MAX_WARNINGS) {
			warnings.push(message);
		}
	}

	records.forEach((record, index) => {
		// Row 1 is the header, so the first data row is row 2 in a spreadsheet.
		const lineNumber = index + 2;
		const name = field(record, "name", "cardname");

		if (!name) {
			rowsSkipped++;
			warn(`Row ${lineNumber}: skipped, no card name.`);
			return;
		}

		const quantity = parseQuantity(field(record, "quantity", "count", "qty"));

		if (quantity === null) {
			rowsSkipped++;
			warn(`Row ${lineNumber} (${name}): skipped, quantity "${record.quantity ?? ""}" is not a number.`);
			return;
		}

		if (quantity === 0) {
			rowsSkipped++;
			warn(`Row ${lineNumber} (${name}): skipped, quantity is zero.`);
			return;
		}

		const location = parseLocation(record);

		const identity = {
			name,
			locationKind: location.kind,
			locationName: location.name,
			locationKey: buildLocationKey(location.kind, location.name),
			scryfallId: field(record, "scryfallid"),
			setCode: field(record, "setcode", "set").toUpperCase(),
			collectorNumber: field(record, "collectornumber", "cardnumber", "number"),
			finish: parseFinish(field(record, "foil", "finish")),
			condition: field(record, "condition").toLowerCase() || "unknown",
			language: field(record, "language", "lang").toLowerCase() || "en",
			altered: parseBoolean(field(record, "altered")),
			misprint: parseBoolean(field(record, "misprint")),
		};

		const card: InventoryCard = {
			...identity,
			id: buildCardId(identity),
			setName: field(record, "setname"),
			rarity: field(record, "rarity").toLowerCase(),
			quantity,
			purchasePrice: parsePrice(field(record, "purchaseprice", "price")),
			purchasePriceCurrency: field(record, "purchasepricecurrency", "currency").toUpperCase() || null,
			manaboxId: field(record, "manaboxid") || null,
			updatedAt: importedAt,
		};

		const existing = byId.get(card.id);

		if (existing) {
			existing.quantity += card.quantity;
		} else {
			byId.set(card.id, card);
		}
	});

	return {
		cards: [...byId.values()],
		rowsParsed: records.length,
		rowsSkipped,
		warnings,
	};
}
