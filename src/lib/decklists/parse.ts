import { CardFinish } from "../inventory/types";

/**
 * Reads a pasted decklist.
 *
 * The target is the format Moxfield exports, which is also close enough to what
 * Archidekt, Deckstats, Arena and TappedOut produce that one tolerant parser
 * handles all of them. A line looks like:
 *
 *   1 Sol Ring
 *   1 Arcane Signet (MSC) 191
 *   4x Llanowar Elves (FDN) 227 *F*
 *
 * Everything after the quantity is optional. Section headers, blank lines and
 * comments are recognised and skipped rather than treated as cards, because
 * people paste whole exports including "Commander" and "Sideboard" headings.
 *
 * The parser is deliberately lenient about what it accepts and strict about
 * what it reports: anything it could not read comes back in `unreadable` with
 * its line number, so the UI can show the user precisely which lines to fix
 * instead of silently dropping them.
 */

/** Which part of a list an entry came from. */
export type DeckSection = "commander" | "companion" | "deck" | "sideboard" | "maybeboard";

/** One line of a decklist. */
export type DecklistEntry = {
	quantity: number,
	name: string,
	/** Set code when the line named one, uppercased. Empty otherwise. */
	setCode: string,
	/** Collector number when the line named one. Empty otherwise. */
	collectorNumber: string,
	finish: CardFinish,
	section: DeckSection,
}

/** A line the parser could not read. */
export type UnreadableLine = {
	/** 1-based line number as pasted, so the message matches what they see. */
	line: number,
	text: string,
	reason: string,
}

export type ParsedDecklist = {
	entries: DecklistEntry[],
	unreadable: UnreadableLine[],
	/** Total copies across every entry, commander included. */
	totalCards: number,
}

/**
 * Section headings people paste, mapped to the sections this app knows.
 *
 * Anything unrecognised that still looks like a heading is ignored rather than
 * parsed as a card, which is the safer failure: a stray heading becoming a card
 * named "Sideboard" would quietly corrupt a list.
 */
const SECTION_HEADINGS: Record<string, DeckSection> = {
	commander: "commander",
	commanders: "commander",
	companion: "companion",
	deck: "deck",
	mainboard: "deck",
	main: "deck",
	creatures: "deck",
	spells: "deck",
	lands: "deck",
	sideboard: "sideboard",
	side: "sideboard",
	maybeboard: "maybeboard",
	considering: "maybeboard",
};

/**
 * `1 Name`, `1x Name`, or `1 Name (SET) 123 *F*`.
 *
 * The name is captured greedily and trimmed apart afterwards, because card
 * names legitimately contain parentheses, digits and asterisks — matching the
 * optional trailing parts from the end is more reliable than trying to make one
 * expression describe the whole line.
 */
const CARD_LINE = /^(\d{1,4})\s*[xX]?\s+(.+)$/;

/** A trailing `*F*` or `*E*` finish marker. */
const FINISH_MARKER = /\s*\*(F|E)\*\s*$/i;

/** A trailing `(SET)` or `(SET) 123` printing hint. */
const PRINTING = /\s*\(([A-Za-z0-9]{2,6})\)(?:\s*([A-Za-z0-9\-★]+))?\s*$/;

/** A trailing `#tag` or `[tag]`, which Moxfield uses for categories. */
const TRAILING_TAG = /\s*(?:#\S+|\[[^\]]*\])\s*$/;

/**
 * Decides whether a line is a section heading rather than a card.
 *
 * @param text The trimmed line
 * @returns The section it names, or null when it is not a heading
 */
function readHeading(text: string): DeckSection | null {
	// "Sideboard:", "SIDEBOARD", "Deck (99)" all appear in real exports.
	const cleaned = text
		.replace(/[:：]\s*$/, "")
		.replace(/\s*\(\d+\)\s*$/, "")
		.trim()
		.toLowerCase();

	return SECTION_HEADINGS[cleaned] ?? null;
}

/**
 * Parses a pasted decklist.
 *
 * @param text The pasted list
 * @returns The entries, plus any lines that could not be read
 */
export function parseDecklist(text: string): ParsedDecklist {
	const entries: DecklistEntry[] = [];
	const unreadable: UnreadableLine[] = [];

	// Most lists open with the deck proper; a commander section names itself.
	let section: DeckSection = "deck";

	text.split(/\r?\n/).forEach((raw, index) => {
		const line = index + 1;
		const trimmed = raw.trim();

		if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) {
			return;
		}

		const heading = readHeading(trimmed);

		if (heading) {
			section = heading;
			return;
		}

		const match = CARD_LINE.exec(trimmed);

		if (!match) {
			unreadable.push({
				line,
				text: trimmed,
				reason: "No quantity at the start of the line.",
			});
			return;
		}

		const quantity = Number.parseInt(match[1], 10);

		if (!Number.isFinite(quantity) || quantity < 1) {
			unreadable.push({ line, text: trimmed, reason: "Quantity has to be at least 1." });
			return;
		}

		// Peel the optional trailing parts off the end, in the order they appear.
		let remainder = match[2].trim();
		let finish: CardFinish = "normal";

		const finishMatch = FINISH_MARKER.exec(remainder);

		if (finishMatch) {
			finish = finishMatch[1].toUpperCase() === "E" ? "etched" : "foil";
			remainder = remainder.replace(FINISH_MARKER, "").trim();
		}

		remainder = remainder.replace(TRAILING_TAG, "").trim();

		let setCode = "";
		let collectorNumber = "";
		const printingMatch = PRINTING.exec(remainder);

		if (printingMatch) {
			setCode = printingMatch[1].toUpperCase();
			collectorNumber = printingMatch[2] ?? "";
			remainder = remainder.replace(PRINTING, "").trim();
		}

		if (!remainder) {
			unreadable.push({ line, text: trimmed, reason: "No card name." });
			return;
		}

		entries.push({ quantity, name: remainder, setCode, collectorNumber, finish, section });
	});

	return {
		entries,
		unreadable,
		totalCards: entries.reduce((total, entry) => total + entry.quantity, 0),
	};
}
