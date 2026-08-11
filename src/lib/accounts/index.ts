import { createJsonAccountRepository } from "./jsonRepository";
import { AccountRepository } from "./repository";

/**
 * Chooses the account storage driver.
 *
 * Mirrors getInventoryRepository: one function everything goes through, so the
 * local JSON store becomes a DynamoDB table by setting an environment variable.
 *
 * A module-level singleton, deliberately not cached on globalThis. A repository
 * is behaviour, not data, and a globalThis cache outlives the module — so after
 * an edit the new code would keep calling into the old closure. That has already
 * bitten this project once.
 */
let repository: AccountRepository | null = null;

/**
 * Returns the process-wide account repository, building it on first use.
 *
 * @returns The repository for the configured driver
 */
export function getAccountRepository(): AccountRepository {
	if (!repository) {
		const driver = (process.env.ACCOUNTS_DRIVER ?? "json").trim().toLowerCase();

		if (driver !== "json") {
			console.warn(`Account driver "${driver}" is not implemented yet, using "json".`);
		}

		repository = createJsonAccountRepository();
	}

	return repository;
}

export type { AccountRepository } from "./repository";
