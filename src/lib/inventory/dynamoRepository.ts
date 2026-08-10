import { InventoryRepository } from "./repository";

/**
 * The planned external driver: a single DynamoDB table.
 *
 * Nothing here is wired up yet — it is reached only when INVENTORY_DRIVER is
 * set to "dynamodb" — but the table design is recorded now, while the shape of
 * {@link InventoryRepository} is still being decided, so the interface stays
 * implementable on DynamoDB rather than accidentally assuming a filesystem.
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
 * `sk` is `"CARD#" + buildSortKey(card)`, which is exactly the ordering the
 * JSON driver uses, so both drivers page through the inventory identically.
 *
 * GSI-1 is keyed on the location *kind* and sorted by the full location key
 * followed by the card's sort key. That one index serves both filters the UI
 * offers:
 *
 *   - every deck        → Query gsi1pk = "OWNER#local#KIND#deck"
 *   - one named deck    → the same Query plus
 *                         `begins_with(gsi1sk, "deck#mono-red-burn#")`
 *
 * `InventoryCard.locationKey` is stored rather than derived precisely so it can
 * be built into that sort key.
 *
 * ## How each method maps
 *
 * - `list`      → Query on pk, ascending by sk — or on GSI-1 when a
 *                 `locationKey` or `locationKind` is given, as above, in which
 *                 case results are ordered within the location rather than
 *                 across the whole inventory. `search` becomes a FilterExpression
 *                 over name, setCode, setName, collectorNumber and
 *                 locationName. `cursor` is the base64url encoded sk of the
 *                 last item, fed back as ExclusiveStartKey. A prefix search
 *                 could later become `begins_with(sk, "CARD#" + term)` and skip
 *                 the filter entirely.
 * - `stats`     → A counters item at sk = "STATS", maintained by the write
 *                 paths with atomic ADD. Recomputing by scanning the partition
 *                 would work but costs a full read per page load.
 * - `locations` → Roll-up items at sk = "LOC#<locationKey>", maintained by the
 *                 write paths the same way, so listing decks is one Query with
 *                 `begins_with(sk, "LOC#")` rather than a scan of every card.
 * - `sample`    → Give each card a random attribute at write time and put it in
 *                 a GSI; then a sample is one Query per card from a random
 *                 starting value with Limit 1. Reading the whole partition and
 *                 picking in memory also works and is simpler, but costs the
 *                 whole collection to show ten cards.
 * - `nameIndex` → Query the partition projecting only name, quantity and
 *                 locationKind. This is the one genuinely expensive read; if it
 *                 becomes hot, keep a roll-up item per normalized card name.
 * - `mergeMany` → BatchWriteItem cannot add to a counter, so this is a fan-out
 *                 of UpdateItem calls using
 *                 `ADD quantity :q SET #name = :name, updatedAt = :now, ...`
 *                 with a 25-at-a-time concurrency limit. The `created` count
 *                 comes from ReturnValues: "UPDATED_OLD" — an absent old value
 *                 means the row was new.
 * - `replaceAll`→ Query the partition for keys only, BatchWriteItem the deletes
 *                 in chunks of 25, then BatchWriteItem the new rows. Not atomic;
 *                 a "generation" attribute on each row plus a generation counter
 *                 on the owner item is the standard way to make the swap
 *                 effectively atomic if that matters later.
 * - `clear`     → The delete half of `replaceAll`.
 *
 * ## To implement
 *
 * 1. `npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb`
 * 2. Fill in the methods below against a DynamoDBDocumentClient.
 * 3. Set INVENTORY_DRIVER=dynamodb, INVENTORY_TABLE and the usual AWS
 *    credential/region variables. No caller changes.
 */

export type DynamoRepositoryOptions = {
	/** Table name. Defaults to the INVENTORY_TABLE environment variable. */
	tableName?: string,
	/** AWS region. Defaults to the AWS_REGION environment variable. */
	region?: string,
}

/**
 * Creates the DynamoDB backed repository.
 *
 * @param options Table and region overrides
 * @returns A repository backed by DynamoDB
 * @throws Always, until the driver is implemented
 */
export function createDynamoInventoryRepository(options: DynamoRepositoryOptions = {}): InventoryRepository {
	const tableName = options.tableName ?? process.env.INVENTORY_TABLE;

	throw new Error(
		"The \"dynamodb\" inventory driver is not implemented yet. " +
		`Table requested: ${tableName ?? "(INVENTORY_TABLE not set)"}. ` +
		"Unset INVENTORY_DRIVER to use the bundled JSON store, or implement " +
		"src/lib/inventory/dynamoRepository.ts using the table design documented there.",
	);
}
