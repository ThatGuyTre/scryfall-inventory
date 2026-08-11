import type { NextApiRequest, NextApiResponse } from "next";
import { describeMembers, roleInGroup, summariseGroup } from "@/src/lib/accounts/access";
import { GroupDetailResponse } from "@/src/lib/accounts/api";
import { requireCaller } from "@/src/lib/accounts/session";
import { ApiError } from "@/src/lib/inventory/api";

/**
 * GET /api/groups/[id]
 *
 * One group with its members, each carrying how many cards they hold so the UI
 * can say what is on offer before anyone fetches a collection.
 *
 * Only members may read a group. A non-member gets 404 rather than 403, so the
 * existence of a group is not something outsiders can probe for.
 */
export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse<GroupDetailResponse | ApiError>,
) {
	const caller = await requireCaller(req, res);

	if (!caller) {
		return undefined;
	}

	if (req.method !== "GET") {
		res.setHeader("Allow", "GET");

		return res.status(405).json({ error: `Method ${req.method} is not allowed here.` });
	}

	const groupId = String(req.query.id ?? "");

	try {
		const role = await roleInGroup(caller.userId, groupId);

		if (!role) {
			return res.status(404).json({ error: "No such group." });
		}

		const group = await summariseGroup(groupId, caller.userId);

		if (!group) {
			return res.status(404).json({ error: "No such group." });
		}

		res.setHeader("Cache-Control", "no-store");

		return res.status(200).json({ group, members: await describeMembers(groupId), role });
	} catch (error) {
		console.error("Group request failed:", error);

		return res.status(500).json({ error: "That group could not be read. Check the server logs." });
	}
}
