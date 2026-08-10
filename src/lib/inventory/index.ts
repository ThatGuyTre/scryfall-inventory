import { createDynamoInventoryRepository } from "./dynamoRepository";
import { createJsonInventoryRepository } from "./jsonRepository";
import { InventoryRepository } from "./repository";

/**
 * Chooses the storage driver.
 *
 * Everything that touches the inventory goes through this one function, so the
 * bundled JSON store can be swapped for a hosted database by setting a single
 * environment variable. No API route or component knows which driver it is
 * talking to.
 */

/** The drivers this build knows how to construct. */
export type InventoryDriver = "json" | "dynamodb";

/**
 * The repository is a module-level singleton, deliberately *not* cached on
 * globalThis.
 *
 * Caching it globally looks appealing — it would survive Next's hot reloading
 * and keep a single write queue — but globalThis outlives the module, so after
 * an edit the new code would keep calling into the old closure. That is not
 * theoretical: it served an inventory whose stats predated a field the rebuilt
 * page already expected, and crashed the page. A repository is behavior, not
 * data, so a reload should rebuild it.
 *
 * Caches of external data are a different matter and do live on globalThis, in
 * the Scryfall and EDHREC clients: those hold fetched responses rather than
 * code, and throwing them away on every save would mean refetching constantly.
 */
let repository: InventoryRepository | null = null;

/**
 * Reads the configured driver name.
 *
 * @returns The driver named by INVENTORY_DRIVER, defaulting to "json"
 */
function resolveDriver(): InventoryDriver {
	const configured = (process.env.INVENTORY_DRIVER ?? "json").trim().toLowerCase();

	if (configured === "json" || configured === "dynamodb") {
		return configured;
	}

	console.warn(`Unknown INVENTORY_DRIVER "${configured}", falling back to "json".`);

	return "json";
}

/**
 * Returns the process-wide inventory repository, building it on first use.
 *
 * @returns The repository for the configured driver
 */
export function getInventoryRepository(): InventoryRepository {
	if (!repository) {
		repository = resolveDriver() === "dynamodb"
			? createDynamoInventoryRepository()
			: createJsonInventoryRepository();
	}

	return repository;
}

export type { InventoryRepository } from "./repository";
