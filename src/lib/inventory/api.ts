import { DeckCoverage } from "../edhrec/coverage";
import { DeckVariant } from "../edhrec/decks";
import { CardLocation, ImportMode, ImportSummary, InventoryCard, InventoryLocation, InventoryStats } from "./types";

/**
 * The wire contract between the inventory pages and /api/inventory.
 *
 * Types live here so the route and the components that call it cannot drift
 * apart, and the fetch helpers live here so no component hand-rolls error
 * handling. Nothing in this file touches the filesystem — it is safe to import
 * from the browser, unlike the storage modules beside it.
 */

/** Every route answers failures with this shape. */
export type ApiError = {
	error: string,
}

/** GET /api/inventory */
export type InventoryListResponse = {
	items: InventoryCard[],
	/** null when the last page has been reached. */
	nextCursor: string | null,
	stats: InventoryStats,
}

/** One card on the home page, the inventory row joined to Scryfall's art. */
export type ShowcaseCard = {
	key: string,
	title: string,
	description: string,
	imageSrc: string,
	imageAlt: string,
	scryfall_uri: string,
	quantity: number,
	locationKind: string,
	locationName: string,
}

/** GET /api/inventory/showcase */
export type InventoryShowcaseResponse = {
	cards: ShowcaseCard[],
	uniqueCards: number,
	totalQuantity: number,
}

/** GET /api/inventory/locations */
export type InventoryLocationsResponse = {
	locations: InventoryLocation[],
}

/** POST /api/inventory/import */
export type InventoryImportRequest = {
	mode: ImportMode,
	/** The raw text of the ManaBox .csv file. */
	csv: string,
	/** Where to file rows whose export names no binder or deck. */
	location?: CardLocation,
}

/**
 * Which cards the commander finder may build from.
 *
 * "all"    — every card in the collection.
 * "nodeck" — only cards that are not already sleeved into a deck.
 */
export type CommanderPool = "all" | "nodeck";

/** GET /api/commanders */
export type CommanderSearchResponse = {
	pool: CommanderPool,
	/** Which bracket or price tier was measured. */
	variant: DeckVariant,
	/** The color identity filter that was applied, empty when unfiltered. */
	colors: string[],
	/** How many cards the chosen pool contains. */
	cardsInPool: number,
	/** 1-based page of the filtered ranking. */
	page: number,
	/** How many pages the filtered ranking has. */
	pageCount: number,
	/** Commanders measured per page. */
	pageSize: number,
	/** How many commanders are in the candidate pool. */
	totalCommanders: number,
	/** How many of them survived the color filter. */
	matchingCommanders: number,
	/** How many extra color rankings were pulled in. */
	depth: number,
	/** What widening once more would add, or null when there is nothing left. */
	nextSource: string | null,
	/** Commander decks on this page, best covered first. */
	decks: DeckCoverage[],
}

/** DELETE /api/inventory */
export type InventoryClearResponse = {
	cleared: true,
	stats: InventoryStats,
}

/**
 * Reads a fetch response, turning a non-2xx into a thrown Error carrying the
 * server's message rather than a generic status code.
 *
 * @param response The response to read
 * @returns The parsed JSON body
 * @throws When the response is not successful or is not JSON
 */
async function readJson<T>(response: Response): Promise<T> {
	const body = await response.json().catch(() => null);

	if (!response.ok) {
		const message = (body as ApiError | null)?.error;
		throw new Error(message || `Request failed with status ${response.status}.`);
	}

	if (body === null) {
		throw new Error("The server returned an unreadable response.");
	}

	return body as T;
}

/**
 * Fetches one page of the inventory.
 *
 * @param options Search term, page size and cursor from the previous page
 * @param signal Abort signal, used to cancel superseded searches
 * @returns The page of cards, the next cursor and the current stats
 */
export async function fetchInventoryPage(
	options: {
		search?: string,
		locationKey?: string,
		locationKind?: string,
		limit?: number,
		cursor?: string | null,
	} = {},
	signal?: AbortSignal,
): Promise<InventoryListResponse> {
	const query = new URLSearchParams();

	if (options.search) {
		query.set("search", options.search);
	}

	if (options.locationKey) {
		query.set("location", options.locationKey);
	}

	if (options.locationKind) {
		query.set("kind", options.locationKind);
	}

	if (options.limit) {
		query.set("limit", String(options.limit));
	}

	if (options.cursor) {
		query.set("cursor", options.cursor);
	}

	const response = await fetch(`/api/inventory?${query.toString()}`, { signal });

	return readJson<InventoryListResponse>(response);
}

/**
 * Uploads a ManaBox export.
 *
 * @param csv The raw text of the .csv file
 * @param mode "replace" to overwrite the inventory, "append" to add to it
 * @returns A summary of what was parsed and written
 */
export async function importManaBoxFile(
	csv: string,
	mode: ImportMode,
	location?: CardLocation,
): Promise<ImportSummary> {
	const body: InventoryImportRequest = { csv, mode, location };

	const response = await fetch("/api/inventory/import", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});

	return readJson<ImportSummary>(response);
}

/**
 * Fetches a sample of the collection for the home page.
 *
 * @param limit How many cards to show
 * @param signal Abort signal, used to cancel a superseded load
 * @returns The cards, with the collection totals for context
 */
export async function fetchShowcase(limit: number, signal?: AbortSignal): Promise<InventoryShowcaseResponse> {
	const response = await fetch(`/api/inventory/showcase?limit=${limit}`, { signal });

	return readJson<InventoryShowcaseResponse>(response);
}

/**
 * Fetches every deck, binder and other place cards are kept.
 *
 * @param signal Abort signal, used to cancel a superseded load
 * @returns The locations, ordered by kind then name
 */
export async function fetchInventoryLocations(signal?: AbortSignal): Promise<InventoryLocation[]> {
	const response = await fetch("/api/inventory/locations", { signal });
	const body = await readJson<InventoryLocationsResponse>(response);

	return body.locations;
}

/** What the commander finder is asking for. */
export type CommanderQuery = {
	pool: CommanderPool,
	variant: DeckVariant,
	/** Color identity letters, e.g. ["W","U"]. Empty means no filter. */
	colors: string[],
	page: number,
	limit: number,
	/** How many extra color rankings to widen the candidate pool with. */
	depth: number,
}

/**
 * Scores popular commander decks against the collection.
 *
 * @param query Pool, variant, color filter and page
 * @param signal Abort signal, used to cancel a superseded load
 * @returns The page of decks, best covered first
 */
export async function fetchCommanderDecks(
	query: CommanderQuery,
	signal?: AbortSignal,
): Promise<CommanderSearchResponse> {
	const params = new URLSearchParams({
		pool: query.pool,
		variant: query.variant,
		page: String(query.page),
		limit: String(query.limit),
		depth: String(query.depth),
	});

	if (query.colors.length > 0) {
		params.set("colors", query.colors.join(""));
	}

	const response = await fetch(`/api/commanders?${params.toString()}`, { signal });

	return readJson<CommanderSearchResponse>(response);
}

/**
 * Deletes every card in the inventory.
 *
 * @returns The stats of the now-empty inventory
 */
export async function clearInventory(): Promise<InventoryClearResponse> {
	const response = await fetch("/api/inventory", { method: "DELETE" });

	return readJson<InventoryClearResponse>(response);
}
