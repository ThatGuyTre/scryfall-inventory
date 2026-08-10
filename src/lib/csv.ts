/**
 * A small RFC 4180 CSV reader.
 *
 * ManaBox exports quote any field that contains a comma (card names such as
 * "Erebos, God of the Dead" are common), so a naive text.split(",") loses data.
 * This is deliberately dependency free — the app only ever needs to read one
 * well formed export, not a general purpose CSV toolkit.
 */

/**
 * Splits raw CSV text into rows of raw string fields.
 *
 * Handles quoted fields, escaped quotes (""), embedded commas and newlines,
 * CRLF line endings and a leading UTF-8 byte order mark.
 *
 * @param text The raw contents of a .csv file
 * @returns One string array per non-empty row, including the header row
 */
export function parseCsvRows(text: string): string[][] {
	// Strip a UTF-8 byte order mark; some ManaBox exports include one.
	const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let inQuotes = false;

	function endField() {
		row.push(field);
		field = "";
	}

	function endRow() {
		endField();
		rows.push(row);
		row = [];
	}

	for (let i = 0; i < input.length; i++) {
		const char = input[i];

		if (inQuotes) {
			if (char !== "\"") {
				field += char;
			} else if (input[i + 1] === "\"") {
				// An escaped quote inside a quoted field.
				field += "\"";
				i++;
			} else {
				inQuotes = false;
			}
			continue;
		}

		switch (char) {
			case "\"":
				inQuotes = true;
				break;
			case ",":
				endField();
				break;
			case "\r":
				// Swallowed; the following \n closes the row.
				break;
			case "\n":
				endRow();
				break;
			default:
				field += char;
		}
	}

	// Flush whatever is left when the file does not end in a newline.
	if (field.length > 0 || row.length > 0) {
		endRow();
	}

	// Drop blank trailing lines.
	return rows.filter((entry) => !(entry.length === 1 && entry[0].trim() === ""));
}

/**
 * Reduces a column heading to a comparison key so that "Set code", "set_code"
 * and "SetCode" all resolve to the same field. ManaBox has renamed columns
 * between app versions, so matching loosely keeps older exports working.
 *
 * @param header A raw column heading
 * @returns The heading lowercased with every non-alphanumeric character removed
 */
export function normalizeHeader(header: string): string {
	return header.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

export type CsvRecords = {
	headers: string[],
	records: Record<string, string>[],
}

/**
 * Parses CSV text into records keyed by normalized column heading.
 *
 * Rows with fewer fields than the header are padded with empty strings rather
 * than rejected, so a truncated final line does not fail the whole import.
 *
 * @param text The raw contents of a .csv file
 * @returns The normalized headers and one record per data row
 */
export function parseCsvRecords(text: string): CsvRecords {
	const rows = parseCsvRows(text);

	if (rows.length === 0) {
		return { headers: [], records: [] };
	}

	const headers = rows[0].map(normalizeHeader);
	const records = rows.slice(1).map((row) => {
		const record: Record<string, string> = {};

		headers.forEach((header, index) => {
			if (header) {
				record[header] = (row[index] ?? "").trim();
			}
		});

		return record;
	});

	return { headers, records };
}
