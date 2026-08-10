import type { NextApiRequest, NextApiResponse } from "next";
import { getInventoryRepository } from "@/src/lib/inventory";
import { ApiError, InventoryClearResponse, InventoryListResponse } from "@/src/lib/inventory/api";
import { DEFAULT_OWNER_ID } from "@/src/lib/inventory/types";

/**
 * /api/inventory
 *
 * GET    — one page of the inventory, plus the headline stats. Accepts `search`,
 *          `location` (one deck or binder), `kind` (every location of a kind),
 *          `limit` and `cursor`.
 * DELETE — empties the inventory.
 *
 * The handler only ever talks to the repository interface, so it is unchanged
 * whether the cards live in the bundled JSON file or in DynamoDB.
 */

/**
 * Reads a query parameter that may arrive repeated.
 *
 * @param value The raw value from req.query
 * @returns The first value, or an empty string
 */
function firstValue(value: string | string[] | undefined): string {
	if (Array.isArray(value)) {
		return value[0] ?? "";
	}

	return value ?? "";
}

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse<InventoryListResponse | InventoryClearResponse | ApiError>,
) {
	const repository = getInventoryRepository();

	try {
		if (req.method === "GET") {
			const limit = Number.parseInt(firstValue(req.query.limit), 10);

			const [page, stats] = await Promise.all([
				repository.list(DEFAULT_OWNER_ID, {
					search: firstValue(req.query.search),
					locationKey: firstValue(req.query.location),
					locationKind: firstValue(req.query.kind),
					limit: Number.isFinite(limit) ? limit : undefined,
					cursor: firstValue(req.query.cursor) || null,
				}),
				repository.stats(DEFAULT_OWNER_ID),
			]);

			// The inventory is per-user and changes on import, so never cache it.
			res.setHeader("Cache-Control", "no-store");

			return res.status(200).json({ ...page, stats });
		}

		if (req.method === "DELETE") {
			await repository.clear(DEFAULT_OWNER_ID);

			return res.status(200).json({
				cleared: true,
				stats: await repository.stats(DEFAULT_OWNER_ID),
			});
		}

		res.setHeader("Allow", "GET, DELETE");

		return res.status(405).json({ error: `Method ${req.method} is not allowed here.` });
	} catch (error) {
		console.error("Inventory request failed:", error);

		return res.status(500).json({ error: "The inventory could not be read. Check the server logs." });
	}
}
