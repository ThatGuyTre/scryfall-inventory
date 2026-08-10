import { normalizeCardName } from "../inventory/card";
import { CardNameIndex } from "../inventory/repository";
import { AverageDeck, DeckVariant } from "./decks";

/**
 * Measures how much of a commander deck a collection already covers.
 */

/** How many missing cards to name in the response before it stops being useful. */
const MAX_LISTED_CARDS = 40;

/** How complete a deck must be to be worth calling out. */
export const WELL_COVERED_THRESHOLD = 60;

/** One commander deck measured against the collection. */
export type DeckCoverage = {
	slug: string,
	name: string,
	/** Which bracket or price tier this score is for. */
	variant: DeckVariant,
	artCrop: string,
	edhrecUrl: string,
	colorIdentity: string[],
	/** How many decks on EDHREC run this commander. */
	numDecks: number,
	/** Basic lands in the average deck, excluded from the score. */
	basicLands: number,
	/** The commander plus non-basic cards — what the score is out of. */
	consideredCards: number,
	ownedCount: number,
	/** Percentage of consideredCards already owned, rounded. */
	coverage: number,
	/** Whether the commander itself is in the collection. */
	ownsCommander: boolean,
	owned: string[],
	missing: string[],
}

/**
 * Scores one deck against a collection.
 *
 * Basic lands are left out of both halves of the fraction: everyone has basics,
 * and counting a dozen Islands as "owned" would flatter every score by the same
 * meaningless amount.
 *
 * @param deck The average deck for a commander
 * @param index Normalized card names held, from the repository
 * @returns The deck with its coverage figures
 */
export function measureCoverage(deck: AverageDeck, index: CardNameIndex): DeckCoverage {
	const owned: string[] = [];
	const missing: string[] = [];

	for (const card of deck.cards) {
		const held = index[normalizeCardName(card)] ?? 0;

		if (held > 0) {
			owned.push(card);
		} else {
			missing.push(card);
		}
	}

	const consideredCards = deck.cards.length;

	return {
		slug: deck.slug,
		name: deck.name,
		variant: deck.variant,
		artCrop: deck.artCrop,
		edhrecUrl: deck.edhrecUrl,
		colorIdentity: deck.colorIdentity,
		numDecks: deck.numDecks,
		basicLands: deck.basicLands,
		consideredCards,
		ownedCount: owned.length,
		coverage: consideredCards === 0 ? 0 : Math.round((owned.length / consideredCards) * 100),
		ownsCommander: owned.includes(deck.name),
		owned: owned.slice(0, MAX_LISTED_CARDS),
		missing: missing.slice(0, MAX_LISTED_CARDS),
	};
}
