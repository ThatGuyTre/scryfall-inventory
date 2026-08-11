import { getInventoryRepository } from "./index";
import { parseManaBoxCsv } from "./manabox";
import { ImportMode, ImportSummary } from "./types";

/**
 * The one operation that sits above the storage layer: importing a ManaBox
 * export. It lives here rather than in the API route so that the route stays a
 * thin HTTP wrapper, and rather than in a driver so that every driver — the
 * JSON one today, DynamoDB later — gets the same import behavior for free.
 */

/**
 * Imports a ManaBox CSV export into an owner's inventory.
 *
 * @param ownerId The inventory owner
 * @param csvText The raw contents of the exported .csv file
 * @param mode "replace" to overwrite the inventory, "append" to add to it
 * @returns A summary of what was parsed and what was written
 * @throws {ManaBoxFormatError} When the file is not a usable ManaBox export
 */
export async function importManaBoxCsv(
	ownerId: string,
	csvText: string,
	mode: ImportMode,
): Promise<ImportSummary> {
	const importedAt = new Date().toISOString();
	const parsed = parseManaBoxCsv(csvText, importedAt, ownerId);
	const repository = getInventoryRepository();

	const result = mode === "replace"
		? await repository.replaceAll(ownerId, parsed.cards)
		: await repository.mergeMany(ownerId, parsed.cards);

	return {
		mode,
		rowsParsed: parsed.rowsParsed,
		rowsSkipped: parsed.rowsSkipped,
		uniqueCards: parsed.cards.length,
		created: result.created,
		updated: result.updated,
		totalQuantity: result.totalQuantity,
		warnings: parsed.warnings,
	};
}

/**
 * Narrows an untrusted value to an {@link ImportMode}.
 *
 * @param value The value supplied by the client
 * @returns The mode, or null when it is not one we support
 */
export function parseImportMode(value: unknown): ImportMode | null {
	return value === "replace" || value === "append" ? value : null;
}
