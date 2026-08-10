import { InventoryCard, UNASSIGNED_LOCATION_KIND } from "./types";

/**
 * Card identity helpers.
 *
 * Both keys below are computed, never stored by chance, so every driver derives
 * the same key for the same physical card. That is what lets an import written
 * by the JSON driver be read back later by a DynamoDB driver unchanged.
 */

/** Everything needed to identify a card, before an id has been assigned. */
export type CardIdentity = Pick<
	InventoryCard,
	"name" | "scryfallId" | "setCode" | "collectorNumber" | "finish" | "condition" | "language" | "altered" | "misprint" | "locationKey"
>;

/**
 * Normalizes one component of a key: lowercase, alphanumerics and hyphens only.
 *
 * @param value The raw value
 * @returns A slug safe to concatenate into a key, or "unknown" when empty
 */
function keyPart(value: string): string {
	const slug = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
	return slug || "unknown";
}

/**
 * Builds the key identifying a deck, binder or other place cards are kept.
 *
 * Cards with no location share the single "unassigned" key, so unfiled cards
 * behave as one more place rather than as a special case everywhere else.
 *
 * @param kind What sort of place it is, e.g. "deck"
 * @param name The name of that place, empty when unfiled
 * @returns A stable key such as "deck#mono-red-burn"
 */
export function buildLocationKey(kind: string, name: string): string {
	const kindPart = keyPart(kind || UNASSIGNED_LOCATION_KIND);

	if (!name.trim()) {
		return kindPart;
	}

	return `${kindPart}#${keyPart(name)}`;
}

/**
 * Builds the deterministic id for a card.
 *
 * Scryfall's UUID identifies the printing; the remaining components separate
 * the physically different stacks of that printing a collector may own.
 *
 * When an export has no Scryfall id the printing is identified by name, set
 * code and collector number together. The name has to be in there: an export
 * missing both the id and the collector number would otherwise give every card
 * in the file the same key and silently merge the whole collection into one row.
 *
 * The location is part of the id, so the same card in two decks stays on two
 * rows and appending an export cannot silently merge them into one.
 *
 * @param card The card's identifying fields
 * @returns A stable key such as "a1b2...#foil#near-mint#en#std#ok#deck#burn"
 */
export function buildCardId(card: CardIdentity): string {
	const printing = card.scryfallId.trim() || `${card.name}-${card.setCode}-${card.collectorNumber}`;

	return [
		keyPart(printing),
		keyPart(card.finish),
		keyPart(card.condition),
		keyPart(card.language),
		card.altered ? "alt" : "std",
		card.misprint ? "mis" : "ok",
		card.locationKey,
	].join("#");
}

/**
 * Builds the ordering key for a card: name first, id as the tie breaker.
 *
 * Listing walks this key in ascending order, which is why paging is a cursor
 * over sort keys rather than an offset. DynamoDB can serve exactly the same
 * ordering by storing this value as the sort key of the item.
 *
 * @param card The card to order
 * @returns A sortable key such as "erebos-god-of-the-dead#a1b2...#foil#..."
 */
export function buildSortKey(card: Pick<InventoryCard, "name" | "id">): string {
	return `${keyPart(card.name)}#${card.id}`;
}

/**
 * Encodes a sort key as an opaque pagination cursor.
 *
 * @param sortKey The sort key of the last item on the current page
 * @returns A base64url cursor, safe to place in a query string
 */
export function encodeCursor(sortKey: string): string {
	return Buffer.from(sortKey, "utf8").toString("base64url");
}

/**
 * Decodes a pagination cursor produced by {@link encodeCursor}.
 *
 * @param cursor The cursor supplied by the client
 * @returns The sort key, or null when the cursor is absent or malformed
 */
export function decodeCursor(cursor: string | null | undefined): string | null {
	if (!cursor) {
		return null;
	}

	try {
		const sortKey = Buffer.from(cursor, "base64url").toString("utf8");
		return sortKey || null;
	} catch {
		return null;
	}
}

/**
 * Tests a card against a free-text search term.
 *
 * Kept here rather than inside a driver so that every driver filters
 * identically — a DynamoDB driver applies this as a FilterExpression over the
 * same three attributes.
 *
 * @param card The card to test
 * @param search The already-lowercased search term
 * @returns Whether the card matches
 */
export function matchesSearch(card: InventoryCard, search: string): boolean {
	if (!search) {
		return true;
	}

	return (
		card.name.toLowerCase().includes(search) ||
		card.setCode.toLowerCase().includes(search) ||
		card.setName.toLowerCase().includes(search) ||
		card.collectorNumber.toLowerCase().includes(search) ||
		card.locationName.toLowerCase().includes(search)
	);
}

/**
 * Reduces a card name to a form that can be compared across sources.
 *
 * A name from EDHREC will not match one from ManaBox character for character:
 * accents, apostrophe styles and the " // " joining a double faced card's two
 * halves all differ. Comparing only the front face, stripped of accents and
 * punctuation, matches the way players talk about cards.
 *
 * @param name The card name from any source
 * @returns The comparison key, e.g. "lim dul s vault" becomes "limdulsvault"
 */
export function normalizeCardName(name: string): string {
	return name
		.split("//")[0]
		// NFD splits accented letters apart so the filter below drops the accent.
		.normalize("NFD")
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "");
}
