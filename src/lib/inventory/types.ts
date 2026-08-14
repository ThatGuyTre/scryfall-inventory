/**
 * The shared vocabulary of the inventory. Everything above the storage layer —
 * API routes, React components — speaks in these types only, so that swapping
 * the JSON driver for DynamoDB never changes a single line of UI code.
 */

/**
 * The inventory is scoped to an owner so the storage layer already looks the
 * way a shared, hosted database needs to look. There is a single local user
 * today, but this is the value that becomes the DynamoDB partition key.
 */
export const DEFAULT_OWNER_ID = "local";

/** ManaBox records finish as a printing variant rather than a boolean. */
export type CardFinish = "normal" | "foil" | "etched";

/** Which app a collection was exported from. */
export type CollectionSource = "manabox" | "deckbox";

/**
 * How an import should treat the cards already in the inventory.
 *
 * "replace" — wipe the owner's inventory, then insert the file.
 * "append"  — keep what is there and add the file's quantities on top.
 */
export type ImportMode = "replace" | "append";

/**
 * What sort of place a stack of cards sits in.
 *
 * ManaBox calls this the binder type and exports values such as "deck",
 * "binder" and "list". It is a plain string rather than a union so that a value
 * ManaBox invents later is carried through instead of being dropped on import.
 */
export type LocationKind = string;

/** The kind given to cards that have not been filed anywhere. */
export const UNASSIGNED_LOCATION_KIND = "unassigned";

/** Where a stack of cards lives, as chosen at import time or read from a file. */
export type CardLocation = {
	kind: LocationKind,
	/** The deck or binder's name. Empty when the cards are unfiled. */
	name: string,
}

/** One place cards are kept, with what it holds. */
export type InventoryLocation = {
	/** Stable key, and the filter value used by the list endpoint. */
	key: string,
	kind: LocationKind,
	name: string,
	uniqueCards: number,
	totalQuantity: number,
}

/**
 * One physical stack of identical cards.
 *
 * A row is deliberately a row of a ManaBox export, plus an owner. Every column
 * ManaBox writes is kept — including `Added`, which the app has no use for yet
 * but which is the owner's data and would be gone on the next re-import if
 * discarded. Only four fields are the app's own: the two keys, the owner, and
 * the write timestamp.
 *
 * Two rows are the same card only if every property that affects which physical
 * stack it belongs to matches: printing, finish, condition, language,
 * alteration — and where it is kept, because the same card sleeved in a deck
 * and sitting in a binder is two stacks, not one. Those are exactly the fields
 * folded into {@link InventoryCard.id}.
 */
export type InventoryCard = {
	/** Stable, deterministic key. The DynamoDB sort-key suffix. */
	id: string,
	/**
	 * Whose collection this row belongs to, and so also who imported it —
	 * groups grant read access only, so nobody writes into someone else's
	 * collection and the two can never differ.
	 *
	 * Redundant with the DynamoDB partition key and with the owner a local store
	 * files it under, and stored anyway: the moment rows from several people are
	 * merged — which is the whole point of group decklist coverage — a row
	 * without this has lost track of whose card it is.
	 */
	ownerId: string,
	/** Scryfall's UUID for the printing. Empty when an export omits it. */
	scryfallId: string,
	name: string,
	setCode: string,
	setName: string,
	collectorNumber: string,
	finish: CardFinish,
	rarity: string,
	condition: string,
	language: string,
	quantity: number,
	misprint: boolean,
	altered: boolean,
	purchasePrice: number | null,
	purchasePriceCurrency: string | null,
	/**
	 * Which app this row was imported from, so a mixed collection can still say
	 * where each row came from.
	 */
	source: CollectionSource,
	/**
	 * The exporting app's own id for the printing: ManaBox's "ManaBox ID" or
	 * Deckbox's "Printing Id". Named for its role rather than for one app,
	 * because it was `manaboxId` right up until a second importer existed and a
	 * Deckbox row had to lie about what it held.
	 */
	sourceId: string | null,
	/** What sort of place holds these cards, e.g. "deck". */
	locationKind: LocationKind,
	/** The name of that place, e.g. "Mono Red Burn". Empty when unfiled. */
	locationName: string,
	/**
	 * kind and name folded into one key. Stored rather than derived because it
	 * is the partition key of the location index a DynamoDB driver would add.
	 */
	locationKey: string,
	/**
	 * ManaBox's own "Added" column: when the owner added the card in that app.
	 * Null when the export has no such column. Kept because it is theirs, not
	 * because anything reads it yet.
	 */
	addedAt: string | null,
	/** ISO 8601 timestamp of the last write this app made to the row. */
	updatedAt: string,
}

/** Query parameters for a single page of the inventory. */
export type ListOptions = {
	/** Case-insensitive substring match against name, set, number and location. */
	search?: string,
	/** Restricts the page to one deck or binder, by {@link InventoryLocation.key}. */
	locationKey?: string,
	/**
	 * Restricts the page to every location of one kind, e.g. "deck" for
	 * everything sleeved into a deck regardless of which. Ignored when
	 * {@link ListOptions.locationKey} names a single location.
	 */
	locationKind?: string,
	/** Page size. Drivers clamp this to a sane maximum. */
	limit?: number,
	/** Opaque cursor returned by the previous page. */
	cursor?: string | null,
}

/** One page of cards plus the cursor needed to fetch the next one. */
export type CardPage = {
	items: InventoryCard[],
	/** null when this is the last page. */
	nextCursor: string | null,
}

/** Headline numbers for the inventory, cheap enough to return with every page. */
export type InventoryStats = {
	/** Distinct rows, i.e. unique printing/finish/condition combinations. */
	uniqueCards: number,
	/** The sum of every row's quantity. */
	totalQuantity: number,
	/** Distinct set codes represented. */
	setCount: number,
	/** Distinct decks, binders and other places cards are kept. */
	locationCount: number,
	/** ISO 8601 timestamp of the most recent write, or null when empty. */
	lastUpdated: string | null,
}

/** What a write actually did, so the UI can report something truthful. */
export type WriteResult = {
	created: number,
	updated: number,
	/** Quantity across the whole inventory once the write settled. */
	totalQuantity: number,
}

/** The end-to-end result of an import, surfaced directly in the UI. */
export type ImportSummary = {
	mode: ImportMode,
	/** Which app's export was recognised. */
	source: CollectionSource,
	/**
	 * Columns the file had that this app has nowhere to put, named so the user
	 * can see exactly what was not kept rather than assuming everything was.
	 */
	unmappedColumns: string[],
	/** Data rows found in the file. */
	rowsParsed: number,
	/** Rows the parser could not use, e.g. missing a name or a quantity. */
	rowsSkipped: number,
	/** Rows after identical printings within the file were folded together. */
	uniqueCards: number,
	created: number,
	updated: number,
	totalQuantity: number,
	/** Human readable notes about skipped or adjusted rows. Capped in length. */
	warnings: string[],
}
