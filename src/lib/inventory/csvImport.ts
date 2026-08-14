import { detectCsvFormat } from "./csvFormat";
import { parseDeckboxCsv } from "./deckbox";
import { CollectionFormatError, CollectionParseResult, parseManaBoxCsv } from "./manabox";
import { CollectionSource } from "./types";

/**
 * Picks the right importer for a collection CSV.
 *
 * The format is decided by the header rather than being chosen by the user, so
 * there is no dropdown to get wrong and no way for a Deckbox file to be read as
 * a ManaBox one. The import form shows what was detected before anything is
 * sent, and this dispatch is the same detection running again on the server —
 * because a client's opinion about a file is not something to trust.
 */

/** A parse, plus what it was parsed as. */
export type CollectionImportResult = CollectionParseResult & {
	source: CollectionSource,
	/** Columns the file had that this app has nowhere to put. */
	unmappedColumns: string[],
}

/**
 * Parses a collection CSV from whichever app exported it.
 *
 * @param csvText The raw contents of the .csv file
 * @param importedAt ISO timestamp stamped onto every row produced
 * @param ownerId Whose collection these rows belong to
 * @returns The cards to store, with the format that was recognised
 * @throws {CollectionFormatError} When the file is not a recognised export
 */
export function parseCollectionCsv(
	csvText: string,
	importedAt: string,
	ownerId: string,
): CollectionImportResult {
	const detected = detectCsvFormat(csvText);

	if (!detected.source) {
		throw new CollectionFormatError(
			detected.reason ?? "That file is not a ManaBox or Deckbox export.",
		);
	}

	const parsed = detected.source === "deckbox"
		? parseDeckboxCsv(csvText, importedAt, ownerId)
		: parseManaBoxCsv(csvText, importedAt, ownerId);

	return { ...parsed, source: detected.source, unmappedColumns: detected.unmappedColumns };
}
