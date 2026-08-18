import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
	BatchWriteCommand,
	DynamoDBDocumentClient,
	QueryCommand,
	UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import type { QueryCommandInput, QueryCommandOutput } from "@aws-sdk/lib-dynamodb";
import { buildSortKey, normalizeCardName } from "./card";
import { CardNameIndex, clampLimit, InventoryRepository, NameIndexOptions } from "./repository";
import {
	CardPage,
	InventoryCard,
	InventoryLocation,
	InventoryStats,
	ListOptions,
	WriteResult,
} from "./types";

/**
 * The external driver: a single DynamoDB table.
 *
 * Reached when INVENTORY_DRIVER is "dynamodb". Every caller goes through
 * {@link InventoryRepository}, so nothing above the storage layer changes.
 *
 * ## Table design
 *
 * One table, on-demand billing, plus one secondary index for locations:
 *
 * | Attribute  | Role         | Example                                     |
 * | ---------- | ------------ | ------------------------------------------- |
 * | pk         | Partition    | "OWNER#local"                               |
 * | sk         | Sort         | "CARD#erebos-god-of-the-dead#a1b2...#foil"  |
 * | gsi1pk     | GSI-1 part.  | "OWNER#local#KIND#deck"                     |
 * | gsi1sk     | GSI-1 sort   | "deck#mono-red-burn#erebos...#a1b2..."      |
 * | ...        | Attributes   | the fields of InventoryCard                 |
 *
 * `sk` is `"CARD#" + buildSortKey(card)`, which is exactly the ordering the JSON
 * driver uses, so both drivers page through the inventory identically.
 *
 * GSI-1 is keyed on the location *kind* and sorted by the full location key
 * followed by the card's sort key. That one index serves both filters the UI
 * offers:
 *
 *   - every deck        → Query gsi1pk = "OWNER#local#KIND#deck"
 *   - one named deck    → the same Query plus
 *                         `begins_with(gsi1sk, "deck#mono-red-burn#")`
 *
 * ## A row is a row
 *
 * There are no roll-up or counter items. `stats`, `locations` and `nameIndex`
 * aggregate the owner's partition on read, projecting only the attributes each
 * one needs. Maintained counters would make those reads O(1), and they would
 * also be a second source of truth that drifts the first time a write fails
 * half way — and the aggregate a page needs is not always the aggregate a
 * counter kept. Aggregating on read cannot be wrong.
 *
 * This is the same trade the rest of the app already makes: collections are
 * small enough to fetch whole (a five thousand card collection is tens of
 * kilobytes projected), and ownership matching for group decklists is done in
 * memory for exactly this reason.
 *
 * ## Two DynamoDB behaviors this has to work around
 *
 * **Limit applies before FilterExpression.** A filtered Query returns up to
 * `Limit` *scanned* items and then discards the ones that do not match, so a
 * page can come back short while more matches exist further on. Asking once and
 * returning what came back would silently truncate a search. {@link queryPage}
 * therefore keeps querying until it has a full page or the partition is
 * exhausted.
 *
 * **`contains()` is case sensitive.** The JSON driver's search is a
 * case-insensitive substring match over five fields. To get the same answer
 * server-side, each row stores a lowercase `searchText` attribute holding those
 * five fields joined by a separator no query string can contain. Without it,
 * searching would mean reading the whole partition and filtering in memory.
 */

/** Attributes this driver adds for indexing, which are not part of a card. */
const INTERNAL_ATTRIBUTES = [ "pk", "sk", "gsi1pk", "gsi1sk", "searchText" ] as const;

/**
 * Joins the searchable fields.
 *
 * A control character, so a search term can never match across the boundary
 * between two fields — joining with nothing would let "instant" match a card
 * whose name ends in "ins" sitting in a set starting "tant". Built with
 * fromCharCode rather than written literally, because an invisible byte in
 * source survives neither an editor that trims control characters nor a
 * copy-paste, and losing it would silently widen every search.
 */
const SEARCH_SEPARATOR = String.fromCharCode(1);

/** DynamoDB accepts at most 25 items per BatchWriteItem call. */
const BATCH_SIZE = 25;

/** How many UpdateItem calls a merge keeps in flight. */
const WRITE_CONCURRENCY = 25;

export type DynamoRepositoryOptions = {
	/** Table name. Defaults to the INVENTORY_TABLE environment variable. */
	tableName?: string,
	/** AWS region. Defaults to the AWS_REGION environment variable. */
	region?: string,
	/** An existing document client, for tests. */
	client?: DynamoDBDocumentClient,
}

/** The shape stored for one card. */
type CardItem = InventoryCard & {
	pk: string,
	sk: string,
	gsi1pk: string,
	gsi1sk: string,
	searchText: string,
}

/** A DynamoDB primary key, as a cursor has to carry it. */
type LastKey = Record<string, unknown>;

/**
 * The partition holding one owner's cards.
 *
 * @param ownerId The inventory owner
 * @returns The partition key
 */
function partitionKey(ownerId: string): string {
	return `OWNER#${ownerId}`;
}

/**
 * The GSI-1 partition for one owner's cards of a given location kind.
 *
 * @param ownerId The inventory owner
 * @param locationKind The kind, e.g. "deck"
 * @returns The index partition key
 */
function kindKey(ownerId: string, locationKind: string): string {
	return `OWNER#${ownerId}#KIND#${locationKind.trim().toLowerCase()}`;
}

/**
 * Builds the lowercase blob the search filter runs against.
 *
 * The fields are exactly those {@link matchesSearch} looks at, so the two
 * drivers agree on what a search term matches.
 *
 * @param card The card to index
 * @returns The searchable text
 */
function buildSearchText(card: InventoryCard): string {
	return [
		card.name,
		card.setCode,
		card.setName,
		card.collectorNumber,
		card.locationName,
	].join(SEARCH_SEPARATOR).toLowerCase();
}

/**
 * Converts a card into the item stored for it.
 *
 * @param card The card
 * @returns The item, with its keys and search text
 */
function toItem(card: InventoryCard): CardItem {
	const sortKey = buildSortKey(card);

	return {
		...card,
		pk: partitionKey(card.ownerId),
		sk: `CARD#${sortKey}`,
		gsi1pk: kindKey(card.ownerId, card.locationKind),
		gsi1sk: `${card.locationKey}#${sortKey}`,
		searchText: buildSearchText(card),
	};
}

/**
 * Strips this driver's own attributes back off an item.
 *
 * @param item The stored item
 * @returns The card as the rest of the app expects it
 */
function toCard(item: Record<string, unknown>): InventoryCard {
	const card = { ...item };

	for (const attribute of INTERNAL_ATTRIBUTES) {
		delete card[attribute];
	}

	return card as unknown as InventoryCard;
}

/**
 * Encodes a LastEvaluatedKey as an opaque cursor.
 *
 * The JSON driver's cursor is an encoded sort key, which is enough for it
 * because it pages an in-memory array. A GSI query needs all four key
 * attributes of the last item, and when a query spans several locations the
 * index sort key cannot be rebuilt from a card's sort key alone — so this
 * driver carries the whole key instead. Cursors are opaque and only ever handed
 * back to the driver that issued them.
 *
 * @param key The key DynamoDB returned
 * @returns A base64url cursor safe for a query string
 */
function encodeKeyCursor(key: LastKey): string {
	return Buffer.from(JSON.stringify(key), "utf8").toString("base64url");
}

/**
 * Decodes a cursor produced by {@link encodeKeyCursor}.
 *
 * Anything unrecognizable decodes to null, meaning "start from the beginning",
 * rather than throwing. A cursor sitting in a bookmarked URL can outlive a
 * driver change, and a stale one should show the first page rather than an
 * error.
 *
 * @param cursor The cursor supplied by the client
 * @returns The key, or null
 */
function decodeKeyCursor(cursor: string | null | undefined): LastKey | null {
	if (!cursor) {
		return null;
	}

	try {
		const parsed: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));

		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return null;
		}

		return parsed as LastKey;
	} catch {
		return null;
	}
}

/**
 * Runs `worker` over every item, at most `limit` at a time.
 *
 * A merge of a five thousand row import is five thousand UpdateItem calls;
 * issuing them all at once exhausts sockets and invites throttling, and issuing
 * them one at a time takes minutes.
 *
 * @param items The work
 * @param limit How many to keep in flight
 * @param worker What to do with each item
 * @returns Each result, in the order the items were given
 */
async function mapWithConcurrency<T, R>(
	items: T[],
	limit: number,
	worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let next = 0;

	async function run(): Promise<void> {
		while (next < items.length) {
			const index = next++;
			results[index] = await worker(items[index], index);
		}
	}

	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));

	return results;
}

/**
 * Creates the DynamoDB backed repository.
 *
 * @param options Table, region and client overrides
 * @returns A repository backed by DynamoDB
 * @throws When no table name is configured
 */
export function createDynamoInventoryRepository(options: DynamoRepositoryOptions = {}): InventoryRepository {
	const tableName = options.tableName ?? (process.env.INVENTORY_TABLE ?? "").trim();

	if (!tableName) {
		throw new Error(
			"The \"dynamodb\" inventory driver needs a table name. Set INVENTORY_TABLE, " +
			"or unset INVENTORY_DRIVER to use the bundled JSON store.",
		);
	}

	const region = options.region ?? process.env.AWS_REGION;

	const client = options.client ?? DynamoDBDocumentClient.from(
		new DynamoDBClient(region ? { region } : {}),
		// Undefined values are dropped rather than rejected, so an optional field
		// the parser left unset does not fail the whole write. Nulls are kept:
		// `purchasePrice: null` means "known to be absent" and is part of the row.
		{ marshallOptions: { removeUndefinedValues: true } },
	);

	/**
	 * Reads every item a query matches, following pagination to the end.
	 *
	 * @param input The query, without ExclusiveStartKey
	 * @returns Every matching item
	 */
	async function queryAll(input: QueryCommandInput): Promise<Record<string, unknown>[]> {
		const items: Record<string, unknown>[] = [];
		let startKey: LastKey | undefined = undefined;

		do {
			const response: QueryCommandOutput = await client.send(new QueryCommand({
				...input,
				ExclusiveStartKey: startKey,
			}));

			items.push(...(response.Items ?? []));
			startKey = response.LastEvaluatedKey;
		} while (startKey);

		return items;
	}

	/**
	 * Reads one page, continuing past short pages caused by filtering.
	 *
	 * DynamoDB applies Limit before FilterExpression, so a filtered query can
	 * return fewer rows than asked for while more matches remain. Returning that
	 * short page would look like the end of the inventory and quietly hide
	 * results.
	 *
	 * @param input The query, without ExclusiveStartKey or Limit
	 * @param limit How many items the caller wants
	 * @param startKey Where to resume, or null to start at the beginning
	 * @returns The items and the key to resume after, if any
	 */
	async function queryPage(
		input: QueryCommandInput,
		limit: number,
		startKey: LastKey | null,
	): Promise<{ items: Record<string, unknown>[], lastKey: LastKey | null }> {
		const items: Record<string, unknown>[] = [];
		let cursor: LastKey | undefined = startKey ?? undefined;
		let lastKey: LastKey | null = null;

		do {
			const response: QueryCommandOutput = await client.send(new QueryCommand({
				...input,
				// Ask for only what is still missing. DynamoDB counts this against
				// items scanned, so over-asking wastes read capacity on a filtered
				// query and under-asking costs another round trip.
				Limit: limit - items.length,
				ExclusiveStartKey: cursor,
			}));

			for (const item of response.Items ?? []) {
				if (items.length < limit) {
					items.push(item);
				}
			}

			cursor = response.LastEvaluatedKey;

			// Only hand back a cursor when the page filled and there is more to
			// read. A page that ends with the partition has no next page.
			lastKey = items.length >= limit && cursor ? cursor : null;
		} while (items.length < limit && cursor);

		return { items, lastKey };
	}

	/**
	 * Deletes every one of an owner's card rows.
	 *
	 * @param ownerId The inventory owner
	 * @returns How many rows were deleted
	 */
	async function deleteAll(ownerId: string): Promise<number> {
		const keys = await queryAll({
			TableName: tableName,
			KeyConditionExpression: "pk = :pk AND begins_with(sk, :cardPrefix)",
			ExpressionAttributeValues: { ":pk": partitionKey(ownerId), ":cardPrefix": "CARD#" },
			ProjectionExpression: "pk, sk",
		});

		await writeInBatches(keys.map((key) => ({
			DeleteRequest: { Key: { pk: key.pk, sk: key.sk } },
		})));

		return keys.length;
	}

	/**
	 * Sends write requests in batches, retrying whatever DynamoDB defers.
	 *
	 * BatchWriteItem is not all-or-nothing: it can accept some requests and
	 * return the rest as UnprocessedItems, which is normal under throttling
	 * rather than an error. Dropping those loses rows silently.
	 *
	 * @param requests Put or Delete requests
	 */
	async function writeInBatches(requests: Record<string, unknown>[]): Promise<void> {
		const batches: Record<string, unknown>[][] = [];

		for (let index = 0; index < requests.length; index += BATCH_SIZE) {
			batches.push(requests.slice(index, index + BATCH_SIZE));
		}

		await mapWithConcurrency(batches, 4, async (batch) => {
			let pending = batch;

			for (let attempt = 0; pending.length > 0 && attempt < 8; attempt++) {
				if (attempt > 0) {
					// Exponential backoff, which is what unprocessed items are
					// asking for: the table is busy, not broken.
					await new Promise((resolve) => setTimeout(resolve, 50 * 2 ** (attempt - 1)));
				}

				const response = await client.send(new BatchWriteCommand({
					RequestItems: { [tableName]: pending },
				}));

				pending = (response.UnprocessedItems?.[tableName] ?? []) as Record<string, unknown>[];
			}

			if (pending.length > 0) {
				throw new Error(
					`DynamoDB left ${pending.length} write(s) unprocessed after 8 attempts. ` +
					"The table is being throttled; nothing was lost, but this write is incomplete.",
				);
			}
		});
	}

	/**
	 * Sums the owner's quantity across every row.
	 *
	 * A counter item would make this free, at the cost of a second source of
	 * truth. It is one projected read of the partition and only runs after a
	 * write, not on a page load.
	 *
	 * @param ownerId The inventory owner
	 * @returns The total quantity held
	 */
	async function totalQuantity(ownerId: string): Promise<number> {
		const items = await queryAll({
			TableName: tableName,
			KeyConditionExpression: "pk = :pk AND begins_with(sk, :cardPrefix)",
			ExpressionAttributeValues: { ":pk": partitionKey(ownerId), ":cardPrefix": "CARD#" },
			ProjectionExpression: "quantity",
		});

		return items.reduce((total, item) => total + (Number(item.quantity) || 0), 0);
	}

	return {
		driver: "dynamodb",

		async list(ownerId: string, options: ListOptions = {}): Promise<CardPage> {
			const limit = clampLimit(options.limit);
			const search = (options.search ?? "").trim().toLowerCase();
			const locationKey = (options.locationKey ?? "").trim();
			// A single location is more specific than a whole kind, so naming one
			// wins over asking for all decks — matching the JSON driver.
			const locationKind = locationKey ? "" : (options.locationKind ?? "").trim();
			const startKey = decodeKeyCursor(options.cursor);

			const values: Record<string, unknown> = {};
			const names: Record<string, string> = {};
			const filters: string[] = [];

			let input: QueryCommandInput;

			if (locationKey) {
				// The kind is the first segment of the location key, so the index
				// partition is known without another lookup.
				const kind = locationKey.split("#")[0];

				values[":gsi1pk"] = kindKey(ownerId, kind);
				values[":locationPrefix"] = `${locationKey}#`;
				values[":locationKey"] = locationKey;

				// begins_with narrows the read; the exact filter is what makes it
				// correct. An unnamed location's key is just its kind, so the
				// prefix "deck#" would otherwise also match every named deck.
				names["#locationKey"] = "locationKey";
				filters.push("#locationKey = :locationKey");

				input = {
					TableName: tableName,
					IndexName: "gsi1",
					KeyConditionExpression: "gsi1pk = :gsi1pk AND begins_with(gsi1sk, :locationPrefix)",
				};
			} else if (locationKind) {
				values[":gsi1pk"] = kindKey(ownerId, locationKind);

				input = {
					TableName: tableName,
					IndexName: "gsi1",
					KeyConditionExpression: "gsi1pk = :gsi1pk",
				};
			} else {
				values[":pk"] = partitionKey(ownerId);
				values[":cardPrefix"] = "CARD#";

				input = {
					TableName: tableName,
					KeyConditionExpression: "pk = :pk AND begins_with(sk, :cardPrefix)",
				};
			}

			if (search) {
				values[":search"] = search;
				names["#searchText"] = "searchText";
				filters.push("contains(#searchText, :search)");
			}

			const { items, lastKey } = await queryPage({
				...input,
				ExpressionAttributeValues: values,
				...(Object.keys(names).length > 0 ? { ExpressionAttributeNames: names } : {}),
				...(filters.length > 0 ? { FilterExpression: filters.join(" AND ") } : {}),
			}, limit, startKey);

			return {
				items: items.map(toCard),
				nextCursor: lastKey ? encodeKeyCursor(lastKey) : null,
			};
		},

		async stats(ownerId: string): Promise<InventoryStats> {
			const items = await queryAll({
				TableName: tableName,
				KeyConditionExpression: "pk = :pk AND begins_with(sk, :cardPrefix)",
				ExpressionAttributeValues: { ":pk": partitionKey(ownerId), ":cardPrefix": "CARD#" },
				// setCode and locationKey are not reserved words; updatedAt is not
				// either. Aliased anyway so adding a field later cannot break the
				// projection in a way that only shows up at runtime.
				ProjectionExpression: "quantity, #setCode, #locationKey, #updatedAt",
				ExpressionAttributeNames: {
					"#setCode": "setCode",
					"#locationKey": "locationKey",
					"#updatedAt": "updatedAt",
				},
			});

			const sets = new Set<string>();
			const locationKeys = new Set<string>();
			let total = 0;
			let lastUpdated: string | null = null;

			for (const item of items) {
				total += Number(item.quantity) || 0;

				const setCode = typeof item.setCode === "string" ? item.setCode : "";

				if (setCode) {
					sets.add(setCode.toLowerCase());
				}

				locationKeys.add(String(item.locationKey ?? ""));

				const updatedAt = typeof item.updatedAt === "string" ? item.updatedAt : "";

				if (updatedAt && (!lastUpdated || updatedAt > lastUpdated)) {
					lastUpdated = updatedAt;
				}
			}

			return {
				uniqueCards: items.length,
				totalQuantity: total,
				setCount: sets.size,
				locationCount: locationKeys.size,
				lastUpdated,
			};
		},

		async sample(ownerId: string, count: number): Promise<InventoryCard[]> {
			// Reads the partition and picks in memory. The alternative — a random
			// attribute in its own index, queried once per card — avoids reading
			// the collection to show ten cards, but needs an index the table does
			// not have. Revisit when a collection makes this read hurt.
			const items = await queryAll({
				TableName: tableName,
				KeyConditionExpression: "pk = :pk AND begins_with(sk, :cardPrefix)",
				ExpressionAttributeValues: { ":pk": partitionKey(ownerId), ":cardPrefix": "CARD#" },
			});

			const cards = items.map(toCard);

			if (cards.length <= count) {
				return cards;
			}

			// Draw distinct indices rather than shuffling: a collection can run to
			// tens of thousands of rows and the home page wants ten of them.
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
			const items = await queryAll({
				TableName: tableName,
				KeyConditionExpression: "pk = :pk AND begins_with(sk, :cardPrefix)",
				ExpressionAttributeValues: { ":pk": partitionKey(ownerId), ":cardPrefix": "CARD#" },
				ProjectionExpression: "quantity, #locationKey, #locationKind, #locationName",
				ExpressionAttributeNames: {
					"#locationKey": "locationKey",
					"#locationKind": "locationKind",
					"#locationName": "locationName",
				},
			});

			const byKey = new Map<string, InventoryLocation>();

			for (const item of items) {
				const key = String(item.locationKey ?? "");
				const existing = byKey.get(key);
				const quantity = Number(item.quantity) || 0;

				if (existing) {
					existing.uniqueCards++;
					existing.totalQuantity += quantity;
				} else {
					byKey.set(key, {
						key,
						kind: String(item.locationKind ?? ""),
						name: String(item.locationName ?? ""),
						uniqueCards: 1,
						totalQuantity: quantity,
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

			const items = await queryAll({
				TableName: tableName,
				KeyConditionExpression: "pk = :pk AND begins_with(sk, :cardPrefix)",
				ExpressionAttributeValues: { ":pk": partitionKey(ownerId), ":cardPrefix": "CARD#" },
				// "name" is a DynamoDB reserved word, so it has to be aliased.
				ProjectionExpression: "#name, quantity, #locationKind",
				ExpressionAttributeNames: { "#name": "name", "#locationKind": "locationKind" },
			});

			const index: CardNameIndex = {};

			for (const item of items) {
				const locationKind = String(item.locationKind ?? "").toLowerCase();

				if (excluded.has(locationKind)) {
					continue;
				}

				const key = normalizeCardName(String(item.name ?? ""));

				if (key) {
					index[key] = (index[key] ?? 0) + (Number(item.quantity) || 0);
				}
			}

			return index;
		},

		async mergeMany(ownerId: string, incoming: InventoryCard[]): Promise<WriteResult> {
			let created = 0;
			let updated = 0;

			await mapWithConcurrency(incoming, WRITE_CONCURRENCY, async (card) => {
				const item = toItem({ ...card, ownerId });

				// Everything except the keys and the quantity is overwritten by the
				// newer row; the quantity is added to. BatchWriteItem cannot add, so
				// this is one UpdateItem per card.
				const setNames: Record<string, string> = {};
				const setValues: Record<string, unknown> = { ":quantity": card.quantity };
				const assignments: string[] = [];

				for (const [ key, value ] of Object.entries(item)) {
					if (key === "pk" || key === "sk" || key === "quantity") {
						continue;
					}

					// A null price means the incoming row does not know one. Leaving
					// the attribute alone keeps whatever was already recorded, which
					// is what the JSON driver's `card.purchasePrice ?? existing` does.
					if ((key === "purchasePrice" || key === "purchasePriceCurrency") && value === null) {
						continue;
					}

					setNames[`#${key}`] = key;
					setValues[`:${key}`] = value;
					assignments.push(`#${key} = :${key}`);
				}

				const response = await client.send(new UpdateCommand({
					TableName: tableName,
					Key: { pk: item.pk, sk: item.sk },
					UpdateExpression: `SET ${assignments.join(", ")} ADD quantity :quantity`,
					ExpressionAttributeNames: setNames,
					ExpressionAttributeValues: setValues,
					// An absent old quantity means there was no row to update, which
					// is how a merge tells a new row from an incremented one without
					// reading first.
					ReturnValues: "UPDATED_OLD",
				}));

				if (response.Attributes?.quantity === undefined) {
					created++;
				} else {
					updated++;
				}
			});

			return { created, updated, totalQuantity: await totalQuantity(ownerId) };
		},

		async replaceAll(ownerId: string, incoming: InventoryCard[]): Promise<WriteResult> {
			// Delete then insert, which is not atomic: a failure between the two
			// leaves the inventory empty rather than unchanged. Making the swap
			// effectively atomic needs a generation attribute on every row and a
			// generation counter on the owner, which is worth adding when several
			// people can import into one collection. Today an import is one person
			// replacing their own cards, and the file they imported from is still
			// on their disk.
			await deleteAll(ownerId);

			const items = incoming.map((card) => toItem({ ...card, ownerId }));

			await writeInBatches(items.map((item) => ({ PutRequest: { Item: item } })));

			return {
				created: items.length,
				updated: 0,
				totalQuantity: items.reduce((total, item) => total + item.quantity, 0),
			};
		},

		async clear(ownerId: string): Promise<void> {
			await deleteAll(ownerId);
		},
	};
}
