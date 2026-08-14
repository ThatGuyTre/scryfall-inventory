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
import { CollectionParseResult, CollectionFormatError } from "./manabox";
import { InventoryCard, UNASSIGNED_LOCATION_KIND } from "./types";

/**
 * Reads a Deckbox collection export.
 *
 * Deckbox writes a different header from ManaBox and means slightly different
 * things by it:
 *
 *   Count,Tradelist Count,Name,Edition,Edition Code,Card Number,Condition,
 *   Language,Foil,Signed,Artist Proof,Altered Art,Misprint,Promo,Textless,
 *   Printing Id,Printing Note,Tags,My Price
 *
 * Two differences matter more than the renamings:
 *
 *  - **There is no Scryfall id.** Card identity therefore falls back to name,
 *    set code and collector number. That fallback only became safe once the name
 *    was folded into it; before that every row of a Deckbox file would have
 *    collapsed into a single card.
 *  - **There are no binders.** Deckbox has tags instead, so a tag becomes the
 *    location when there is one and the cards are unfiled when there is not.
 *
 * Flag columns are marked by putting anything in them and left empty otherwise,
 * which is why the boolean reader treats "present" as true.
 */

/** How many warnings are worth showing before they stop being informative. */
const MAX_WARNINGS = 20;

/**
 * Works out where a Deckbox row's cards are kept.
 *
 * Deckbox has no binder column. Its Tags field is the closest thing — people use
 * it to mark where cards live — so a tag becomes a binder name. Multiple tags
 * are comma separated; the first is used, since a card lives in one place.
 *
 * @param record One CSV row keyed by normalized heading
 * @returns The kind and name to file these cards under
 */
function parseLocation(record: Record<string, string>): { kind: string, name: string } {
	const tags = field(record, "tags");
	const first = tags.split(",")[0]?.trim() ?? "";

	if (first) {
		return { kind: "binder", name: first };
	}

	return { kind: UNASSIGNED_LOCATION_KIND, name: "" };
}

/**
 * Parses a Deckbox CSV export.
 *
 * @param csvText The raw contents of the exported .csv file
 * @param importedAt ISO timestamp stamped onto every row produced
 * @param ownerId Whose collection these rows belong to
 * @returns The cards to store plus counts and warnings for the summary
 * @throws {CollectionFormatError} When the file has no usable header row
 */
export function parseDeckboxCsv(
	csvText: string,
	importedAt: string,
	ownerId: string,
): CollectionParseResult {
	const { headers, records } = parseCsvRecords(csvText);

	if (headers.length === 0) {
		throw new CollectionFormatError("That file is empty.");
	}

	if (!headers.includes("name") || !headers.includes("count")) {
		throw new CollectionFormatError(
			"That does not look like a Deckbox export — a \"Name\" and a \"Count\" column are required. " +
			`Found: ${headers.filter(Boolean).join(", ") || "no columns"}.`,
		);
	}

	const byId = new Map<string, InventoryCard>();
	const warnings: string[] = [];
	let rowsSkipped = 0;

	function warn(message: string): void {
		if (warnings.length < MAX_WARNINGS) {
			warnings.push(message);
		}
	}

	records.forEach((record, index) => {
		// Row 1 is the header, so the first data row is row 2 in a spreadsheet.
		const lineNumber = index + 2;
		const name = field(record, "name");

		if (!name) {
			rowsSkipped++;
			warn(`Row ${lineNumber}: skipped, no card name.`);
			return;
		}

		const quantity = parseQuantity(field(record, "count", "quantity"));

		if (quantity === null) {
			rowsSkipped++;
			warn(`Row ${lineNumber} (${name}): skipped, count "${record.count ?? ""}" is not a number.`);
			return;
		}

		if (quantity === 0) {
			rowsSkipped++;
			warn(`Row ${lineNumber} (${name}): skipped, count is zero.`);
			return;
		}

		const location = parseLocation(record);

		const identity = {
			name,
			locationKind: location.kind,
			locationName: location.name,
			locationKey: buildLocationKey(location.kind, location.name),
			// Deckbox never supplies one, so identity rests on name, set and
			// collector number.
			scryfallId: "",
			setCode: field(record, "editioncode").toUpperCase(),
			collectorNumber: field(record, "cardnumber", "collectornumber"),
			finish: parseFinish(field(record, "foil")),
			condition: parseCondition(field(record, "condition")),
			language: parseLanguage(field(record, "language")),
			altered: parseBoolean(field(record, "alteredart", "altered")),
			misprint: parseBoolean(field(record, "misprint")),
		};

		const card: InventoryCard = {
			...identity,
			id: buildCardId(identity),
			ownerId,
			setName: field(record, "edition", "setname"),
			// Deckbox exports no rarity.
			rarity: "",
			quantity,
			purchasePrice: parsePrice(field(record, "myprice", "price")),
			// "My Price" is written with a dollar sign and no currency column.
			purchasePriceCurrency: field(record, "myprice") ? "USD" : null,
			source: "deckbox",
			sourceId: field(record, "printingid") || null,
			addedAt: null,
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
