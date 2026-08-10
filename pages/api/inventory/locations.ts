import type { NextApiRequest, NextApiResponse } from "next";
import { getInventoryRepository } from "@/src/lib/inventory";
import { ApiError, InventoryLocationsResponse } from "@/src/lib/inventory/api";
import { DEFAULT_OWNER_ID } from "@/src/lib/inventory/types";

/**
 * GET /api/inventory/locations
 *
 * Every deck, binder and other place cards are kept, with what each one holds.
 * Feeds the filter on the inventory page and the list on the deck page.
 */
export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse<InventoryLocationsResponse | ApiError>,
) {
	if (req.method !== "GET") {
		res.setHeader("Allow", "GET");

		return res.status(405).json({ error: `Method ${req.method} is not allowed here.` });
	}

	try {
		const locations = await getInventoryRepository().locations(DEFAULT_OWNER_ID);

		res.setHeader("Cache-Control", "no-store");

		return res.status(200).json({ locations });
	} catch (error) {
		console.error("Listing inventory locations failed:", error);

		return res.status(500).json({ error: "The locations could not be read. Check the server logs." });
	}
}
