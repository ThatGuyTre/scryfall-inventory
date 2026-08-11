import type { NextApiRequest, NextApiResponse } from "next";
import { getAccountRepository } from "@/src/lib/accounts";
import { DecklistsResponse } from "@/src/lib/accounts/api";
import { roleInGroup } from "@/src/lib/accounts/access";
import { requireCaller } from "@/src/lib/accounts/session";
import { GroupDecklist } from "@/src/lib/accounts/types";
import { ApiError } from "@/src/lib/inventory/api";

/**
 * /api/groups/[id]/decklists
 *
 * GET    — the group's saved lists, newest first.
 * POST   — save a pasted list.
 * DELETE — remove one.
 *
 * Any member may save a list; the point of a group is to work out together who
 * can supply the cards. The list is stored exactly as pasted rather than as
 * parsed rows, so it can be re-parsed when the parser improves and edited by
 * hand without a round trip through a form.
 */

/** Lists longer than this are not decklists. */
const MAX_TEXT_LENGTH = 100_000;

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse<DecklistsResponse | GroupDecklist | { deleted: true } | ApiError>,
) {
	const caller = await requireCaller(req, res);

	if (!caller) {
		return undefined;
	}

	const groupId = String(req.query.id ?? "");
	const accounts = getAccountRepository();

	try {
		if (!(await roleInGroup(caller.userId, groupId))) {
			return res.status(404).json({ error: "No such group." });
		}

		if (req.method === "GET") {
			res.setHeader("Cache-Control", "no-store");

			return res.status(200).json({ decklists: await accounts.listDecklists(groupId) });
		}

		if (req.method === "POST") {
			const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
			const text = typeof req.body?.text === "string" ? req.body.text : "";

			if (!text.trim()) {
				return res.status(400).json({ error: "Paste a decklist first." });
			}

			if (text.length > MAX_TEXT_LENGTH) {
				return res.status(400).json({ error: "That list is too long to be a decklist." });
			}

			return res.status(201).json(await accounts.saveDecklist(groupId, caller.userId, name, text));
		}

		if (req.method === "DELETE") {
			// Named listId rather than id: the route segment is already [id] for
			// the group, and Next merges route and query parameters, so an `id`
			// query string would collide with the group's own.
			const listId = String(req.query.listId ?? "");

			if (!listId) {
				return res.status(400).json({ error: "Say which list to delete." });
			}

			await accounts.deleteDecklist(groupId, listId);

			return res.status(200).json({ deleted: true });
		}

		res.setHeader("Allow", "GET, POST, DELETE");

		return res.status(405).json({ error: `Method ${req.method} is not allowed here.` });
	} catch (error) {
		console.error("Decklist request failed:", error);

		return res.status(500).json({ error: "That decklist could not be saved. Check the server logs." });
	}
}
