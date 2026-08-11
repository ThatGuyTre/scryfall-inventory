import { normalizeCardName } from "../inventory/card";
import { CardFinish } from "../inventory/types";
import { DecklistEntry } from "./parse";

/**
 * Works out who in a group can supply each card on a pasted decklist.
 *
 * Everything here is a pure function over collections already in memory. That is
 * the whole point of fetching collections whole: matching a hundred card names
 * against several thousand cards is trivial locally, and needs no round trip per
 * name.
 */

/** The fields matching needs from a card. A trimmed collection row. */
export type MatchableCard = {
	name: string,
	quantity: number,
	setCode: string,
	finish: CardFinish,
	locationKind: string,
	locationName: string,
}

/** One person's collection, ready to match against. */
export type MatchableCollection = {
	ownerId: string,
	/** How to name this person on screen. */
	displayName: string,
	/** True for the signed-in user, so the UI can say "you". */
	isSelf: boolean,
	cards: MatchableCard[],
}

/** Copies of one card held by one person, in one place. */
export type OwnedCopy = {
	ownerId: string,
	displayName: string,
	isSelf: boolean,
	quantity: number,
	setCode: string,
	finish: CardFinish,
	locationKind: string,
	locationName: string,
	/**
	 * Whether these copies are already sleeved into a deck. Borrowing them means
	 * taking that deck apart, which is worth saying out loud.
	 */
	inDeck: boolean,
}

/** One line of the decklist, resolved against the group. */
export type CoverageRow = {
	name: string,
	/** Copies the list asks for. */
	requested: number,
	/** Every holding found, most copies first, self before others. */
	owned: OwnedCopy[],
	/** Copies the group holds in total. */
	available: number,
	/** Whether the group holds at least as many as the list asks for. */
	isCovered: boolean,
	/** True when every copy found is already in a deck. */
	onlyInDecks: boolean,
}

export type DecklistCoverage = {
	/** Alphabetical by card name. */
	rows: CoverageRow[],
	/** Rows the group can supply in full. */
	coveredRows: number,
	totalRows: number,
	/** Copies asked for, and copies the group holds. */
	requestedCards: number,
	availableCards: number,
}

/** One line of a shopping list. */
export type BuyLine = {
	name: string,
	quantity: number,
	/** Why it is here: nobody has it, or the user said it cannot be borrowed. */
	reason: "not-owned" | "unavailable",
}

/**
 * Indexes a collection by normalized card name.
 *
 * @param collection The collection to index
 * @returns Cards grouped by normalized name
 */
function indexByName(collection: MatchableCollection): Map<string, MatchableCard[]> {
	const index = new Map<string, MatchableCard[]>();

	for (const card of collection.cards) {
		const key = normalizeCardName(card.name);

		if (!key) {
			continue;
		}

		const existing = index.get(key);

		if (existing) {
			existing.push(card);
		} else {
			index.set(key, [card]);
		}
	}

	return index;
}

/**
 * Resolves a decklist against a set of collections.
 *
 * @param entries The parsed decklist lines
 * @param collections The collections that may supply cards
 * @returns One row per distinct card, alphabetical by name
 */
export function resolveCoverage(
	entries: DecklistEntry[],
	collections: MatchableCollection[],
): DecklistCoverage {
	const indexes = collections.map((collection) => ({ collection, index: indexByName(collection) }));

	// A list can name the same card twice, in different sections. Fold those
	// together so the result has one row per card and asks for the total.
	const requestedByName = new Map<string, { name: string, requested: number }>();

	for (const entry of entries) {
		const key = normalizeCardName(entry.name);

		if (!key) {
			continue;
		}

		const existing = requestedByName.get(key);

		if (existing) {
			existing.requested += entry.quantity;
		} else {
			requestedByName.set(key, { name: entry.name, requested: entry.quantity });
		}
	}

	const rows: CoverageRow[] = [];

	for (const [key, { name, requested }] of requestedByName) {
		const owned: OwnedCopy[] = [];

		for (const { collection, index } of indexes) {
			for (const card of index.get(key) ?? []) {
				owned.push({
					ownerId: collection.ownerId,
					displayName: collection.displayName,
					isSelf: collection.isSelf,
					quantity: card.quantity,
					setCode: card.setCode,
					finish: card.finish,
					locationKind: card.locationKind,
					locationName: card.locationName,
					inDeck: card.locationKind.toLowerCase() === "deck",
				});
			}
		}

		// Your own copies first, then whoever has the most.
		owned.sort((left, right) => {
			if (left.isSelf !== right.isSelf) {
				return left.isSelf ? -1 : 1;
			}

			return right.quantity - left.quantity;
		});

		const available = owned.reduce((total, copy) => total + copy.quantity, 0);

		rows.push({
			name,
			requested,
			owned,
			available,
			isCovered: available >= requested,
			onlyInDecks: owned.length > 0 && owned.every((copy) => copy.inDeck),
		});
	}

	rows.sort((left, right) => left.name.localeCompare(right.name));

	return {
		rows,
		coveredRows: rows.filter((row) => row.isCovered).length,
		totalRows: rows.length,
		requestedCards: rows.reduce((total, row) => total + row.requested, 0),
		availableCards: rows.reduce((total, row) => total + Math.min(row.available, row.requested), 0),
	};
}

/**
 * Builds the list of cards to go and buy.
 *
 * Two things land here. Cards nobody in the group holds, and cards someone holds
 * but has said they cannot part with — because "Marcus owns it" and "Marcus will
 * lend it" are different facts, and only the second one keeps it off the list.
 *
 * @param coverage The resolved coverage
 * @param unavailable Normalized names the user has marked as un-borrowable
 * @returns One line per card needed, alphabetical by name
 */
export function buildBuyList(coverage: DecklistCoverage, unavailable: Set<string> = new Set()): BuyLine[] {
	const lines: BuyLine[] = [];

	for (const row of coverage.rows) {
		const isUnavailable = unavailable.has(normalizeCardName(row.name));

		if (isUnavailable) {
			// Treat it as though the group had none of it.
			lines.push({ name: row.name, quantity: row.requested, reason: "unavailable" });
			continue;
		}

		if (!row.isCovered) {
			// Only the shortfall needs buying, not the whole line.
			lines.push({
				name: row.name,
				quantity: Math.max(1, row.requested - row.available),
				reason: "not-owned",
			});
		}
	}

	return lines.sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * Renders a buy list in the format shops and deckbuilders accept for mass entry.
 *
 * @param lines The lines to render
 * @returns Text ready for the clipboard, e.g. "1 Cyclonic Rift"
 */
export function formatAsMoxfield(lines: BuyLine[]): string {
	return lines.map((line) => `${line.quantity} ${line.name}`).join("\n");
}
