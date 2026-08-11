import type { NextApiRequest, NextApiResponse } from "next";
import { getAccountRepository } from "@/src/lib/accounts";
import { requireCaller } from "@/src/lib/accounts/session";
import { ProfileEdit, UserProfile } from "@/src/lib/accounts/types";
import { ApiError } from "@/src/lib/inventory/api";

/**
 * /api/profile
 *
 * GET   — the signed-in person's profile.
 * PATCH — change the fields they own: display name, first name, last name.
 *
 * The email is deliberately not editable. It belongs to the identity provider,
 * and letting it be changed here would put the two out of step with no way to
 * reconcile them.
 */

/**
 * Narrows an untrusted body to the fields a person may change.
 *
 * @param body The request body
 * @returns Only the recognised string fields
 */
function readEdit(body: unknown): ProfileEdit {
	const candidate = (body ?? {}) as Record<string, unknown>;
	const edit: ProfileEdit = {};

	for (const field of ["username", "firstName", "lastName"] as const) {
		if (typeof candidate[field] === "string") {
			edit[field] = candidate[field] as string;
		}
	}

	return edit;
}

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse<UserProfile | ApiError>,
) {
	const caller = await requireCaller(req, res);

	if (!caller) {
		return undefined;
	}

	const accounts = getAccountRepository();

	try {
		if (req.method === "GET") {
			// The row is created at sign-in, so a missing one means the store was
			// cleared underneath a live session rather than a new user.
			const profile = await accounts.upsertUser(caller.userId, {
				email: caller.email,
				username: caller.email.split("@")[0] ?? "",
			});

			res.setHeader("Cache-Control", "no-store");

			return res.status(200).json(profile);
		}

		if (req.method === "PATCH") {
			const edit = readEdit(req.body);

			if (Object.keys(edit).length === 0) {
				return res.status(400).json({ error: "Nothing to change." });
			}

			return res.status(200).json(await accounts.updateUser(caller.userId, edit));
		}

		res.setHeader("Allow", "GET, PATCH");

		return res.status(405).json({ error: `Method ${req.method} is not allowed here.` });
	} catch (error) {
		console.error("Profile request failed:", error);

		return res.status(500).json({ error: "Your profile could not be read. Check the server logs." });
	}
}
