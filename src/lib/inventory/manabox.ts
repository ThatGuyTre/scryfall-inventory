import { parseCsvRecords } from "../csv";
import { buildCardId, buildLocationKey } from "./card";
import {
	field,
	parseBoolean,
	parseCondition,
	parseFinish,
	parseLanguage,
	parsePrice,
	parseQuantity,
} from "./csvFields";
import { CardLocation, InventoryCard, UNASSIGNED_LOCATION_KIND } from "./types";

/**
 * Reads a ManaBox collection export.
 *
 * A ManaBox export looks like this, though the exact columns have drifted
 * between app versions:
 *
 *   Binder Name,Binder Type,Name,Set code,Set name,Collector number,Foil,
 *   Rarity,Quantity,ManaBox ID,Scryfall ID,Purchase price,Misprint,Altered,
 *   Condition,Language,Purchase price currency,Added
 *
 * Columns are matched by normalized heading rather than by position — the real
 * export puts the binder columns first, not last where they might be assumed —
 * unrecognised columns are ignored, and only Name and Quantity are required.
 * That keeps older and newer exports importable without a code change.
 *
 * Where a card is kept comes from the "Binder Name" and "Binder Type" columns.
 * Rows without a binder name are filed as unassigned.
 */

/** Thrown when a file is readable but is not a collection export. */
export class CollectionFormatError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CollectionFormatError";
	}
}

/** The outcome of reading a file, before anything is written to storage. */
export type CollectionParseResult = {
	/** Cards folded down to one row per unique printing/finish/condition/place. */
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
 * language, alteration and location — are folded together with their quantities
 * summed, so a file that lists a card twice in the same binder imports as one
 * row of two, while the same card in two decks stays on two.
 *
 * @param csvText The raw contents of the exported .csv file
 * @param importedAt ISO timestamp stamped onto every row produced
 * @param ownerId Whose collection these rows belong to
 * @returns The cards to store plus counts and warnings for the summary
 * @throws {CollectionFormatError} When the file has no usable header row
 */
export function parseManaBoxCsv(
	csvText: string,
	importedAt: string,
	ownerId: string,
): CollectionParseResult {
	const { headers, records } = parseCsvRecords(csvText);

	if (headers.length === 0) {
		throw new CollectionFormatError("That file is empty.");
	}

	if (!headers.includes("name") || !headers.includes("quantity")) {
		throw new CollectionFormatError(
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
			condition: parseCondition(field(record, "condition")),
			language: parseLanguage(field(record, "language", "lang")),
			altered: parseBoolean(field(record, "altered")),
			misprint: parseBoolean(field(record, "misprint")),
		};

		const card: InventoryCard = {
			...identity,
			id: buildCardId(identity),
			ownerId,
			setName: field(record, "setname"),
			rarity: field(record, "rarity").toLowerCase(),
			quantity,
			purchasePrice: parsePrice(field(record, "purchaseprice", "price")),
			purchasePriceCurrency: field(record, "purchasepricecurrency", "currency").toUpperCase() || null,
			source: "manabox",
			sourceId: field(record, "manaboxid") || null,
			// ManaBox's own timestamp, kept verbatim. Nothing reads it yet; it is
			// the owner's data and discarding it would lose it for good.
			addedAt: field(record, "added", "addedat", "dateadded") || null,
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
