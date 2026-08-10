import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import { buildSortKey, decodeCursor, encodeCursor, matchesSearch, normalizeCardName } from "./card";
import { CardNameIndex, clampLimit, InventoryRepository, NameIndexOptions } from "./repository";
import {
	CardPage,
	INVENTORY_SCHEMA_VERSION,
	InventoryCard,
	InventoryLocation,
	InventoryStats,
	ListOptions,
	WriteResult,
} from "./types";

/**
 * The bundled inventory store: a single JSON document on disk.
 *
 * This is the "internal database" — no server to run, no credentials, and the
 * file is trivial to inspect while developing. It is deliberately the simplest
 * thing that satisfies {@link InventoryRepository}, because the interface, not
 * this file, is the part meant to outlive the prototype.
 *
 * Two limitations are worth knowing before this reaches a real deployment, and
 * both are reasons the DynamoDB driver exists:
 *
 *  - The document is rewritten whole on every write, so it suits a personal
 *    collection rather than concurrent users.
 *  - Serverless filesystems are ephemeral, so on a platform like Vercel the
 *    file resets when the instance recycles.
 */

/** The on-disk document. Owners are nested so one file can hold several. */
type InventoryDocument = {
	version: number,
	owners: Record<string, Record<string, InventoryCard>>,
}

export type JsonRepositoryOptions = {
	/** Absolute path of the JSON document. Defaults to src/data/inventory.json. */
	filePath?: string,
}

/**
 * Resolves where the inventory document lives.
 *
 * @param options Caller supplied overrides
 * @returns An absolute path to the JSON document
 */
function resolveFilePath(options: JsonRepositoryOptions): string {
	if (options.filePath) {
		return options.filePath;
	}

	if (process.env.INVENTORY_FILE) {
		return path.resolve(process.env.INVENTORY_FILE);
	}

	return path.join(process.cwd(), "src", "data", "inventory.json");
}

/**
 * Creates a JSON file backed inventory repository.
 *
 * @param options Optional overrides, mainly for tests
 * @returns A repository that reads and writes a single JSON document
 */
export function createJsonInventoryRepository(options: JsonRepositoryOptions = {}): InventoryRepository {
	const filePath = resolveFilePath(options);

	// The parsed document is held in memory so that reads do not hit the disk
	// on every request; it is dropped only if a write fails.
	let document: InventoryDocument | null = null;

	// Sorted views of each owner's cards, rebuilt lazily after a write. Listing
	// is the hot path, so the sort is paid for once rather than per request.
	let sortedByOwner = new Map<string, InventoryCard[]>();

	// Writes are serialized through this chain. Within a single Node process
	// that is enough to stop two imports interleaving and losing rows.
	let writeQueue: Promise<unknown> = Promise.resolve();

	/**
	 * Loads the document from disk, or starts an empty one if it is missing.
	 *
	 * @returns The in-memory document
	 */
	async function load(): Promise<InventoryDocument> {
		if (document) {
			return document;
		}

		try {
			// The path is resolved at runtime, which the bundler cannot follow.
			// Left alone it assumes the worst and traces the entire project
			// into the server bundle, so the read is opted out of tracing.
			const raw = await readFile(/* turbopackIgnore: true */ filePath, "utf8");
			const parsed = JSON.parse(raw) as Partial<InventoryDocument>;

			document = {
				version: parsed.version ?? INVENTORY_SCHEMA_VERSION,
				owners: parsed.owners ?? {},
			};
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;

			// A missing file simply means nothing has been imported yet.
			if (code !== "ENOENT") {
				console.error("Could not read the inventory file, starting empty:", error);
			}

			document = { version: INVENTORY_SCHEMA_VERSION, owners: {} };
		}

		return document;
	}

	/**
	 * Writes the document to disk atomically: a temporary file is written in
	 * full and then renamed over the original, so an interrupted write can
	 * never leave a half-serialized inventory behind.
	 *
	 * @param next The document to persist
	 */
	async function persist(next: InventoryDocument): Promise<void> {
		const temporaryPath = `${filePath}.tmp`;

		await mkdir(path.dirname(filePath), { recursive: true });
		await writeFile(temporaryPath, JSON.stringify(next, null, "\t"), "utf8");
		await rename(temporaryPath, filePath);
	}

	/**
	 * Runs a mutation with exclusive access to the document and persists the
	 * result. The in-memory copy is dropped if the write throws, so the next
	 * read re-reads whatever actually made it to disk.
	 *
	 * @param mutate Receives the owner's cards keyed by id and returns a result
	 * @returns Whatever the mutation returned
	 */
	function withWriteLock<T>(ownerId: string, mutate: (cards: Record<string, InventoryCard>) => T): Promise<T> {
		const run = writeQueue.then(async () => {
			const current = await load();
			const cards = current.owners[ownerId] ?? {};
			const result = mutate(cards);

			current.owners[ownerId] = cards;
			sortedByOwner.delete(ownerId);

			try {
				await persist(current);
			} catch (error) {
				// Force a re-read; the cache may no longer match the disk.
				document = null;
				sortedByOwner = new Map();
				throw error;
			}

			return result;
		});

		// Keep the chain alive even when a caller's write rejects.
		writeQueue = run.catch(() => undefined);

		return run;
	}

	/**
	 * Returns the owner's cards in sort-key order, building the view on demand.
	 *
	 * @param ownerId The inventory owner
	 * @returns The sorted cards, shared and therefore not to be mutated
	 */
	async function sortedCards(ownerId: string): Promise<InventoryCard[]> {
		const cached = sortedByOwner.get(ownerId);

		if (cached) {
			return cached;
		}

		const current = await load();
		const cards = Object.values(current.owners[ownerId] ?? {});

		// Ordered by raw code unit, not localeCompare, because cursors are
		// compared with < and > and the two orderings have to agree exactly.
		cards.sort((left, right) => {
			const leftKey = buildSortKey(left);
			const rightKey = buildSortKey(right);

			if (leftKey === rightKey) {
				return 0;
			}

			return leftKey < rightKey ? -1 : 1;
		});

		sortedByOwner.set(ownerId, cards);

		return cards;
	}

	/**
	 * Totals the quantity across an owner's cards.
	 *
	 * @param cards The owner's cards keyed by id
	 * @returns The summed quantity
	 */
	function totalQuantityOf(cards: Record<string, InventoryCard>): number {
		return Object.values(cards).reduce((total, card) => total + card.quantity, 0);
	}

	return {
		driver: "json",

		async list(ownerId: string, options: ListOptions = {}): Promise<CardPage> {
			const limit = clampLimit(options.limit);
			const search = (options.search ?? "").trim().toLowerCase();
			const locationKey = (options.locationKey ?? "").trim();
			// A single location is more specific than a whole kind, so naming
			// one wins over asking for all decks.
			const locationKind = locationKey ? "" : (options.locationKind ?? "").trim().toLowerCase();
			const after = decodeCursor(options.cursor);

			const cards = await sortedCards(ownerId);
			const items: InventoryCard[] = [];
			let nextCursor: string | null = null;

			for (const card of cards) {
				const sortKey = buildSortKey(card);

				// Cursors point at the last item returned, so resume past it.
				if (after && sortKey <= after) {
					continue;
				}

				if (locationKey && card.locationKey !== locationKey) {
					continue;
				}

				if (locationKind && card.locationKind.toLowerCase() !== locationKind) {
					continue;
				}

				if (!matchesSearch(card, search)) {
					continue;
				}

				if (items.length === limit) {
					// One extra match exists, so hand back a cursor.
					nextCursor = encodeCursor(buildSortKey(items[items.length - 1]));
					break;
				}

				items.push(card);
			}

			return { items, nextCursor };
		},

		async stats(ownerId: string): Promise<InventoryStats> {
			const cards = await sortedCards(ownerId);
			const sets = new Set<string>();
			const locationKeys = new Set<string>();
			let totalQuantity = 0;
			let lastUpdated: string | null = null;

			for (const card of cards) {
				totalQuantity += card.quantity;

				if (card.setCode) {
					sets.add(card.setCode.toLowerCase());
				}

				locationKeys.add(card.locationKey);

				if (!lastUpdated || card.updatedAt > lastUpdated) {
					lastUpdated = card.updatedAt;
				}
			}

			return {
				uniqueCards: cards.length,
				totalQuantity,
				setCount: sets.size,
				locationCount: locationKeys.size,
				lastUpdated,
			};
		},

		async sample(ownerId: string, count: number): Promise<InventoryCard[]> {
			const cards = await sortedCards(ownerId);

			if (cards.length <= count) {
				return [...cards];
			}

			// Draw distinct indices rather than shuffling the whole array: the
			// collection can run to tens of thousands of rows and the home page
			// only wants ten of them.
			const chosen = new Set<number>();
			const picked: InventoryCard[] = [];

			while (picked.length < count) {
				const index = Math.floor(Math.random() * cards.length);

				if (!chosen.has(index)) {
					chosen.add(index);
					picked.push(cards[index]);
				}
			}

			return picked;
		},

		async locations(ownerId: string): Promise<InventoryLocation[]> {
			const cards = await sortedCards(ownerId);
			const byKey = new Map<string, InventoryLocation>();

			for (const card of cards) {
				const existing = byKey.get(card.locationKey);

				if (existing) {
					existing.uniqueCards++;
					existing.totalQuantity += card.quantity;
				} else {
					byKey.set(card.locationKey, {
						key: card.locationKey,
						kind: card.locationKind,
						name: card.locationName,
						uniqueCards: 1,
						totalQuantity: card.quantity,
					});
				}
			}

			// Grouped by kind so the decks sit together, named before unnamed.
			return [...byKey.values()].sort((left, right) => {
				if (left.kind !== right.kind) {
					return left.kind < right.kind ? -1 : 1;
				}

				return left.name.localeCompare(right.name);
			});
		},

		async nameIndex(ownerId: string, options: NameIndexOptions = {}): Promise<CardNameIndex> {
			const excluded = new Set((options.excludeLocationKinds ?? []).map((kind) => kind.toLowerCase()));
			const cards = await sortedCards(ownerId);
			const index: CardNameIndex = {};

			for (const card of cards) {
				if (excluded.has(card.locationKind.toLowerCase())) {
					continue;
				}

				const key = normalizeCardName(card.name);

				if (key) {
					index[key] = (index[key] ?? 0) + card.quantity;
				}
			}

			return index;
		},

		mergeMany(ownerId: string, incoming: InventoryCard[]): Promise<WriteResult> {
			return withWriteLock(ownerId, (cards) => {
				let created = 0;
				let updated = 0;

				for (const card of incoming) {
					const existing = cards[card.id];

					if (existing) {
						// Quantities add; the newer row wins on everything else,
						// which is how a DynamoDB "ADD quantity" update behaves.
						cards[card.id] = {
							...existing,
							...card,
							quantity: existing.quantity + card.quantity,
							purchasePrice: card.purchasePrice ?? existing.purchasePrice,
							purchasePriceCurrency: card.purchasePriceCurrency ?? existing.purchasePriceCurrency,
						};
						updated++;
					} else {
						cards[card.id] = card;
						created++;
					}
				}

				return { created, updated, totalQuantity: totalQuantityOf(cards) };
			});
		},

		replaceAll(ownerId: string, incoming: InventoryCard[]): Promise<WriteResult> {
			return withWriteLock(ownerId, (cards) => {
				for (const id of Object.keys(cards)) {
					delete cards[id];
				}

				for (const card of incoming) {
					cards[card.id] = card;
				}

				return { created: incoming.length, updated: 0, totalQuantity: totalQuantityOf(cards) };
			});
		},

		async clear(ownerId: string): Promise<void> {
			await withWriteLock(ownerId, (cards) => {
				for (const id of Object.keys(cards)) {
					delete cards[id];
				}
			});
		},
	};
}
