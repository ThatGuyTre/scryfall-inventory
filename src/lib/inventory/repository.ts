import { CardPage, InventoryCard, InventoryLocation, InventoryStats, ListOptions, WriteResult } from "./types";

/**
 * Which cards a name index should count.
 *
 * Used by the commander finder to answer "build this deck from cards that are
 * not already sleeved up in another deck" by excluding the "deck" kind.
 */
export type NameIndexOptions = {
	/** Location kinds to leave out, e.g. ["deck"]. */
	excludeLocationKinds?: string[],
}

/** Normalized card name to the total quantity held across every location. */
export type CardNameIndex = Record<string, number>;

/**
 * The storage contract for the inventory.
 *
 * This is the seam the whole feature is built around: the API routes depend on
 * this interface and nothing else, so moving from the bundled JSON store to a
 * hosted DynamoDB table is a matter of writing one more implementation and
 * flipping the INVENTORY_DRIVER environment variable.
 *
 * Three rules keep the contract implementable on a NoSQL store:
 *
 *  1. Every method is scoped by ownerId — the natural partition key.
 *  2. Reads are cursor paged, never offset paged, because DynamoDB pages with
 *     an opaque LastEvaluatedKey rather than a row offset.
 *  3. Writes are expressed as merges rather than read-modify-write, because
 *     DynamoDB can add to a counter atomically but cannot safely round-trip a
 *     whole document from a serverless handler.
 */
export interface InventoryRepository {
	/** Identifies the active implementation, surfaced for diagnostics. */
	readonly driver: string,

	/**
	 * Reads one page of the owner's cards, ordered by card sort key.
	 *
	 * @param ownerId The inventory owner
	 * @param options Search term, page size and cursor
	 * @returns The page of cards and the cursor for the following page
	 */
	list(ownerId: string, options?: ListOptions): Promise<CardPage>,

	/**
	 * Reads the headline counts for the owner's inventory.
	 *
	 * @param ownerId The inventory owner
	 * @returns Unique rows, total quantity, distinct sets and last write time
	 */
	stats(ownerId: string): Promise<InventoryStats>,

	/**
	 * Picks cards at random from the whole inventory, without repeats.
	 *
	 * This exists because a random *page* is not a random *sample*: reading
	 * from a random cursor returns cards that are adjacent alphabetically, so
	 * the home page showed ten neighbours rather than ten cards from across the
	 * collection. Every card must have an equal chance, whatever its name.
	 *
	 * @param ownerId The inventory owner
	 * @param count How many cards to pick
	 * @returns Up to `count` distinct cards, in no particular order
	 */
	sample(ownerId: string, count: number): Promise<InventoryCard[]>,

	/**
	 * Lists every deck, binder and other place the owner keeps cards, with what
	 * each one holds. Ordered by kind, then name.
	 *
	 * @param ownerId The inventory owner
	 * @returns One entry per distinct location
	 */
	locations(ownerId: string): Promise<InventoryLocation[]>,

	/**
	 * Builds a lookup of every card name held, for matching the collection
	 * against an external decklist. Names are normalized by
	 * {@link normalizeCardName} so that punctuation and double faced names do
	 * not cause misses.
	 *
	 * @param ownerId The inventory owner
	 * @param options Which locations to leave out
	 * @returns Normalized name to total quantity held
	 */
	nameIndex(ownerId: string, options?: NameIndexOptions): Promise<CardNameIndex>,

	/**
	 * Adds the given cards to the inventory, summing quantities where a card is
	 * already present. This is the "append" import mode.
	 *
	 * @param ownerId The inventory owner
	 * @param cards The cards to merge, already deduplicated by id
	 * @returns How many rows were created versus incremented
	 */
	mergeMany(ownerId: string, cards: InventoryCard[]): Promise<WriteResult>,

	/**
	 * Discards the owner's existing cards and stores the given cards instead.
	 * This is the "replace" import mode.
	 *
	 * @param ownerId The inventory owner
	 * @param cards The cards that become the entire inventory
	 * @returns How many rows were written
	 */
	replaceAll(ownerId: string, cards: InventoryCard[]): Promise<WriteResult>,

	/**
	 * Removes every card belonging to the owner.
	 *
	 * @param ownerId The inventory owner
	 */
	clear(ownerId: string): Promise<void>,
}

/** The page size used when a caller does not ask for one. */
export const DEFAULT_PAGE_SIZE = 50;

/** The largest page any driver will return, however large a limit is requested. */
export const MAX_PAGE_SIZE = 200;

/**
 * Clamps a caller supplied page size into the range every driver honors.
 *
 * @param limit The requested page size, possibly undefined or nonsense
 * @returns A page size between 1 and {@link MAX_PAGE_SIZE}
 */
export function clampLimit(limit: number | undefined): number {
	if (!limit || !Number.isFinite(limit)) {
		return DEFAULT_PAGE_SIZE;
	}

	return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(limit)));
}
