import type { NextApiRequest, NextApiResponse } from "next";
import { getInventoryRepository } from "@/src/lib/inventory";
import { ApiError, InventoryShowcaseResponse, ShowcaseCard } from "@/src/lib/inventory/api";
import { DEFAULT_OWNER_ID } from "@/src/lib/inventory/types";
import { fetchCardsByIds } from "@/src/lib/scryfall/cards";

/**
 * GET /api/inventory/showcase
 *
 * A handful of cards from the collection, with art and text from Scryfall, for
 * the home page.
 *
 * The cards are drawn individually at random from the whole inventory. An
 * earlier version read a page from a random cursor, which was cheaper but
 * wrong: cards are ordered by name, so it returned ten alphabetical neighbours
 * rather than ten cards from across the collection.
 */

/** How many cards the home page shows. */
const DEFAULT_SHOWCASE_SIZE = 10;

/** The most any caller can ask for, since each one costs a Scryfall lookup. */
const MAX_SHOWCASE_SIZE = 30;

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse<InventoryShowcaseResponse | ApiError>,
) {
	if (req.method !== "GET") {
		res.setHeader("Allow", "GET");

		return res.status(405).json({ error: `Method ${req.method} is not allowed here.` });
	}

	const requested = Number.parseInt(String(req.query.limit ?? ""), 10);
	const limit = Number.isFinite(requested)
		? Math.min(MAX_SHOWCASE_SIZE, Math.max(1, requested))
		: DEFAULT_SHOWCASE_SIZE;

	try {
		const repository = getInventoryRepository();
		const stats = await repository.stats(DEFAULT_OWNER_ID);

		if (stats.uniqueCards === 0) {
			res.setHeader("Cache-Control", "no-store");

			return res.status(200).json({ cards: [], uniqueCards: 0, totalQuantity: 0 });
		}

		const chosen = await repository.sample(DEFAULT_OWNER_ID, limit);
		const details = await fetchCardsByIds(chosen.map((card) => card.scryfallId));

		const cards: ShowcaseCard[] = chosen.map((card) => {
			const detail = details.get(card.scryfallId);

			return {
				key: card.id,
				title: card.name,
				// Cards imported without a Scryfall id, or dropped from
				// Scryfall, still list — just without art or rules text.
				description: detail?.oracleText ?? "",
				imageSrc: detail?.artCrop ?? "",
				imageAlt: card.name,
				scryfall_uri: detail?.scryfallUri ?? "",
				quantity: card.quantity,
				locationKind: card.locationKind,
				locationName: card.locationName,
			};
		});

		res.setHeader("Cache-Control", "no-store");

		return res.status(200).json({
			cards,
			uniqueCards: stats.uniqueCards,
			totalQuantity: stats.totalQuantity,
		});
	} catch (error) {
		console.error("Building the showcase failed:", error);

		return res.status(500).json({ error: "Your collection could not be read. Check the server logs." });
	}
}
