import type { NextApiRequest, NextApiResponse } from "next";
import { getAccountRepository } from "@/src/lib/accounts";
import { describeMembers, roleInGroup, summariseGroup } from "@/src/lib/accounts/access";
import { GroupDetailResponse } from "@/src/lib/accounts/api";
import { requireCaller } from "@/src/lib/accounts/session";
import { ApiError } from "@/src/lib/inventory/api";

/**
 * /api/groups/[id]/members
 *
 * POST   — add someone by the email address they signed up with.
 * DELETE — remove someone.
 *
 * Only a group's owner may change who is in it. Members can see each other but
 * cannot invite, which keeps the answer to "who can read my collection" in the
 * hands of the person who created the group.
 *
 * Both verbs answer with the whole refreshed group, so the caller never has to
 * make a second request to see the result.
 */
export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse<GroupDetailResponse | ApiError>,
) {
	const caller = await requireCaller(req, res);

	if (!caller) {
		return undefined;
	}

	const groupId = String(req.query.id ?? "");
	const accounts = getAccountRepository();

	try {
		const role = await roleInGroup(caller.userId, groupId);

		if (!role) {
			return res.status(404).json({ error: "No such group." });
		}

		if (role !== "owner") {
			return res.status(403).json({ error: "Only the group's owner can change who is in it." });
		}

		if (req.method === "POST") {
			const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";

			if (!email.includes("@")) {
				return res.status(400).json({ error: "That does not look like an email address." });
			}

			const invited = await accounts.findUserByEmail(email);

			// Inviting someone who has never signed in would create a membership
			// pointing at nobody, so say so plainly instead.
			if (!invited) {
				return res.status(404).json({
					error: "Nobody has signed in with that address yet. They need an account first.",
				});
			}

			await accounts.addMember(groupId, invited.id);
		} else if (req.method === "DELETE") {
			const userId = String(req.query.userId ?? "");

			if (!userId) {
				return res.status(400).json({ error: "Say who to remove." });
			}

			await accounts.removeMember(groupId, userId);
		} else {
			res.setHeader("Allow", "POST, DELETE");

			return res.status(405).json({ error: `Method ${req.method} is not allowed here.` });
		}

		const group = await summariseGroup(groupId, caller.userId);

		if (!group) {
			return res.status(404).json({ error: "No such group." });
		}

		return res.status(200).json({ group, members: await describeMembers(groupId), role });
	} catch (error) {
		// removeMember refuses to strip a group of its owner; that is a rule the
		// caller broke rather than a fault, so it reads back as a 400.
		const message = error instanceof Error ? error.message : "";

		if (message.includes("owner cannot be removed")) {
			return res.status(400).json({ error: message });
		}

		console.error("Group member request failed:", error);

		return res.status(500).json({ error: "That change could not be made. Check the server logs." });
	}
}
