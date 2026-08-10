import type { NextApiRequest, NextApiResponse } from "next";
import { ApiError, InventoryImportRequest } from "@/src/lib/inventory/api";
import { ManaBoxFormatError } from "@/src/lib/inventory/manabox";
import { importManaBoxCsv, parseCardLocation, parseImportMode } from "@/src/lib/inventory/service";
import { DEFAULT_OWNER_ID, ImportSummary } from "@/src/lib/inventory/types";

/**
 * POST /api/inventory/import
 *
 * Accepts the text of a ManaBox .csv export together with the mode chosen by
 * the user, and either replaces or appends to the stored inventory.
 *
 * The file is sent as JSON rather than multipart form data: the browser has
 * already read it with FileReader, and this avoids pulling in a multipart
 * parser for a single field.
 */
export const config = {
	api: {
		// A large personal collection exports to a few megabytes of CSV, well
		// past the 1mb default. The cap still exists so a runaway upload is
		// rejected rather than buffered into memory.
		bodyParser: { sizeLimit: "32mb" },
	},
};

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse<ImportSummary | ApiError>,
) {
	if (req.method !== "POST") {
		res.setHeader("Allow", "POST");

		return res.status(405).json({ error: `Method ${req.method} is not allowed here.` });
	}

	const body = req.body as Partial<InventoryImportRequest> | undefined;
	const mode = parseImportMode(body?.mode);

	if (!mode) {
		return res.status(400).json({ error: "Choose whether to append to or replace the inventory." });
	}

	if (typeof body?.csv !== "string" || !body.csv.trim()) {
		return res.status(400).json({ error: "No CSV content was uploaded." });
	}

	try {
		const summary = await importManaBoxCsv(
			DEFAULT_OWNER_ID,
			body.csv,
			mode,
			parseCardLocation(body.location),
		);

		return res.status(200).json(summary);
	} catch (error) {
		// A bad file is the user's problem to fix, so say what is wrong with it.
		if (error instanceof ManaBoxFormatError) {
			return res.status(400).json({ error: error.message });
		}

		console.error("ManaBox import failed:", error);

		return res.status(500).json({ error: "The import failed. Check the server logs." });
	}
}
