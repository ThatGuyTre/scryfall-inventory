import type { NextApiRequest, NextApiResponse } from "next";
import { getAccountRepository } from "@/src/lib/accounts";
import { GroupListResponse } from "@/src/lib/accounts/api";
import { requireCaller } from "@/src/lib/accounts/session";
import { GroupSummary } from "@/src/lib/accounts/types";
import { ApiError } from "@/src/lib/inventory/api";

/**
 * /api/groups
 *
 * GET  — the groups the caller belongs to.
 * POST — create one, with the caller as its owner and first member.
 */
export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse<GroupListResponse | GroupSummary | ApiError>,
) {
	const caller = await requireCaller(req, res);

	if (!caller) {
		return undefined;
	}

	const accounts = getAccountRepository();

	try {
		if (req.method === "GET") {
			const entries = await accounts.listGroupsForUser(caller.userId);

			res.setHeader("Cache-Control", "no-store");

			return res.status(200).json({
				groups: entries.map(({ group, role, status, memberCount, invitedCount }) => ({
					...group,
					role,
					status,
					memberCount,
					invitedCount,
				})),
			});
		}

		if (req.method === "POST") {
			const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";

			if (!name) {
				return res.status(400).json({ error: "Give the group a name." });
			}

			const group = await accounts.createGroup(caller.userId, name);

			return res.status(201).json({
				...group,
				role: "owner",
				status: "accepted",
				memberCount: 1,
				invitedCount: 0,
			});
		}

		res.setHeader("Allow", "GET, POST");

		return res.status(405).json({ error: `Method ${req.method} is not allowed here.` });
	} catch (error) {
		console.error("Groups request failed:", error);

		return res.status(500).json({ error: "Your groups could not be read. Check the server logs." });
	}
}
