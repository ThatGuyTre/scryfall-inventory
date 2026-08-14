import { normalizeHeader, parseCsvRows } from "../csv";
import { CollectionSource } from "./types";

/**
 * Working out which app a collection CSV came from.
 *
 * Detection is by header, not by filename, because a file called
 * "collection.csv" says nothing and people rename downloads. It runs in the
 * browser as well as on the server — the import form tells you what it found
 * before you commit to importing — so nothing here touches the filesystem.
 */

/** What a format needs to be recognised, and what it can hold. */
type FormatSpec = {
	source: CollectionSource,
	label: string,
	/** Headings that must all be present. */
	required: string[],
	/** Headings that clinch it, distinguishing this format from the others. */
	signature: string[],
	/**
	 * Headings the importer actually stores, normalized.
	 *
	 * Deliberately not "every heading the format has": anything absent from this
	 * list is reported to the user as not kept, which is the whole point. Listing
	 * a column here that nothing reads would quietly claim it was stored.
	 */
	stored: string[],
}

const FORMATS: FormatSpec[] = [
	{
		source: "manabox",
		label: "ManaBox",
		required: ["name", "quantity"],
		// Only ManaBox writes a Scryfall ID or its own ManaBox ID.
		signature: ["scryfallid", "manaboxid"],
		// Every column a ManaBox export writes is stored.
		stored: [
			"bindername", "bindertype", "name", "setcode", "setname", "collectornumber",
			"foil", "rarity", "quantity", "manaboxid", "scryfallid", "purchaseprice",
			"misprint", "altered", "condition", "language", "purchasepricecurrency", "added",
		],
	},
	{
		source: "deckbox",
		label: "Deckbox",
		required: ["name", "count"],
		// Deckbox is the only one that calls the quantity "Count" and the set
		// "Edition", and its "Printing Id" appears nowhere else.
		signature: ["editioncode", "printingid", "tradelistcount"],
		// Deckbox writes six columns this app has nowhere to put: Tradelist
		// Count, Signed, Artist Proof, Promo, Textless and Printing Note. They
		// are left off deliberately so the import says so rather than implying
		// everything was kept.
		stored: [
			"count", "name", "edition", "editioncode", "cardnumber", "condition",
			"language", "foil", "alteredart", "misprint", "printingid", "tags", "myprice",
		],
	},
];

/** What detection concluded. */
export type FormatDetection = {
	source: CollectionSource | null,
	/** Something to show the user, e.g. "ManaBox". */
	label: string,
	/** The file's headings, in the order they appeared. */
	headers: string[],
	/** Headings this app has nowhere to put. Empty when the format is unknown. */
	unmappedColumns: string[],
	/** Why detection failed, when it did. */
	reason?: string,
}

/**
 * Identifies a collection CSV from its header row.
 *
 * @param csvText The file contents, or just enough of it to include the header
 * @returns What was recognised
 */
export function detectCsvFormat(csvText: string): FormatDetection {
	// Only the first line matters, so a 3 MB export is not fully parsed just to
	// put a label on screen.
	const firstLine = csvText.split(/\r?\n/, 1)[0] ?? "";
	const headers = (parseCsvRows(firstLine)[0] ?? []).map((header) => header.trim()).filter(Boolean);

	if (headers.length === 0) {
		return { source: null, label: "Unrecognised", headers, unmappedColumns: [], reason: "The file has no header row." };
	}

	const normalized = headers.map(normalizeHeader);
	const has = (heading: string) => normalized.includes(heading);

	for (const format of FORMATS) {
		if (!format.required.every(has)) {
			continue;
		}

		// A required-columns match alone is too weak: "Name" and "Quantity"
		// could be anything. At least one signature column has to agree.
		if (!format.signature.some(has)) {
			continue;
		}

		return {
			source: format.source,
			label: format.label,
			headers,
			unmappedColumns: headers.filter((header) => !format.stored.includes(normalizeHeader(header))),
		};
	}

	return {
		source: null,
		label: "Unrecognised",
		headers,
		unmappedColumns: [],
		reason: `Not a ManaBox or Deckbox export. Found columns: ${headers.slice(0, 8).join(", ")}${headers.length > 8 ? "…" : ""}.`,
	};
}

/** Names a source for display. */
export function sourceLabel(source: CollectionSource): string {
	return FORMATS.find((format) => format.source === source)?.label ?? source;
}
