import type { NextApiRequest, NextApiResponse } from "next";
import { getAccountRepository } from "@/src/lib/accounts";
import { mayReadCollection } from "@/src/lib/accounts/access";
import { CollectionResponse } from "@/src/lib/accounts/api";
import { requireCaller } from "@/src/lib/accounts/session";
import { displayNameFor } from "@/src/lib/accounts/types";
import { MatchableCard } from "@/src/lib/decklists/coverage";
import { getInventoryRepository } from "@/src/lib/inventory";
import { ApiError } from "@/src/lib/inventory/api";
import { MAX_PAGE_SIZE } from "@/src/lib/inventory/repository";

/**
 * GET /api/collections/[ownerId]
 *
 * A whole collection, trimmed to the six fields matching needs.
 *
 * This is the one read the client-side matching design depends on. Measured
 * against a real 4,985 card collection it is 315 KB of JSON, 58 KB gzipped —
 * less than one card image — which is why the browser can hold a collection and
 * answer every ownership question locally instead of asking per card.
 *
 * Matching moved to the client; **authority did not**. The caller may read their
 * own collection, or that of anyone they share a group with, and nothing else.
 */

/** Only what matching and display need. Everything else stays on the server. */
function trim(card: {
	name: string,
	quantity: number,
	setCode: string,
	finish: MatchableCard["finish"],
	locationKind: string,
	locationName: string,
}): MatchableCard {
	return {
		name: card.name,
		quantity: card.quantity,
		setCode: card.setCode,
		finish: card.finish,
		locationKind: card.locationKind,
		locationName: card.locationName,
	};
}

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse<CollectionResponse | ApiError>,
) {
	const caller = await requireCaller(req, res);

	if (!caller) {
		return undefined;
	}

	if (req.method !== "GET") {
		res.setHeader("Allow", "GET");

		return res.status(405).json({ error: `Method ${req.method} is not allowed here.` });
	}

	const ownerId = String(req.query.ownerId ?? "");

	try {
		if (!(await mayReadCollection(caller.userId, ownerId))) {
			// 404 rather than 403: whether a collection exists is not something
			// to confirm to someone with no right to read it.
			return res.status(404).json({ error: "No collection you can see." });
		}

		const inventory = getInventoryRepository();
		const cards: MatchableCard[] = [];
		let cursor: string | null = null;

		// Page through the whole collection. The repository interface pages by
		// cursor precisely so this works the same against DynamoDB.
		do {
			const page = await inventory.list(ownerId, { limit: MAX_PAGE_SIZE, cursor });

			cards.push(...page.items.map(trim));
			cursor = page.nextCursor;
		} while (cursor);

		const stats = await inventory.stats(ownerId);
		const profile = ownerId === caller.userId
			? await getAccountRepository().getUser(caller.userId)
			: (await getAccountRepository().getUsers([ownerId]))[ownerId] ?? null;

		res.setHeader("Cache-Control", "no-store");

		return res.status(200).json({
			ownerId,
			displayName: ownerId === caller.userId
				? "You"
				: (profile ? displayNameFor(profile) : "Someone"),
			isSelf: ownerId === caller.userId,
			cards,
			lastUpdated: stats.lastUpdated,
		});
	} catch (error) {
		console.error("Collection request failed:", error);

		return res.status(500).json({ error: "That collection could not be read. Check the server logs." });
	}
}
