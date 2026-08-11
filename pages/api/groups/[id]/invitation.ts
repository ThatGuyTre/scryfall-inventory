import type { NextApiRequest, NextApiResponse } from "next";
import { getAccountRepository } from "@/src/lib/accounts";
import { membershipStatus } from "@/src/lib/accounts/access";
import { requireCaller } from "@/src/lib/accounts/session";
import { ApiError } from "@/src/lib/inventory/api";

/**
 * POST /api/groups/[id]/invitation
 *
 * Answers an invitation. Body: `{ action: "accept" | "decline" }`.
 *
 * Separate from the members route on purpose. That one is the owner deciding who
 * is asked; this one is the invitee deciding for themselves, and the two need
 * opposite permissions — an owner may not accept on someone's behalf, and an
 * invitee may not add anyone.
 *
 * Declining deletes the membership. There is no record of a refusal, because the
 * only thing such a record could do is stop an owner asking again.
 */
export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse<{ status: "accepted" | "declined" } | ApiError>,
) {
	const caller = await requireCaller(req, res);

	if (!caller) {
		return undefined;
	}

	if (req.method !== "POST") {
		res.setHeader("Allow", "POST");

		return res.status(405).json({ error: `Method ${req.method} is not allowed here.` });
	}

	const groupId = String(req.query.id ?? "");
	const action = req.body?.action;

	if (action !== "accept" && action !== "decline") {
		return res.status(400).json({ error: "Say whether to accept or decline." });
	}

	try {
		const status = await membershipStatus(caller.userId, groupId);

		if (!status) {
			// Nothing to answer, and no confirmation that the group exists.
			return res.status(404).json({ error: "No invitation for you here." });
		}

		if (status === "accepted") {
			return res.status(400).json({ error: "You are already in that group." });
		}

		const accounts = getAccountRepository();

		if (action === "accept") {
			await accounts.acceptInvitation(groupId, caller.userId);

			return res.status(200).json({ status: "accepted" });
		}

		await accounts.declineInvitation(groupId, caller.userId);

		return res.status(200).json({ status: "declined" });
	} catch (error) {
		console.error("Invitation request failed:", error);

		return res.status(500).json({ error: "That invitation could not be answered. Check the server logs." });
	}
}
