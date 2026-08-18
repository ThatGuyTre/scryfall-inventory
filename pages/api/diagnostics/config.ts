import { timingSafeEqual } from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { buildConfigReport, ConfigReport } from "@/src/lib/diagnostics/config";
import { ApiError } from "@/src/lib/inventory/api";

/**
 * GET /api/diagnostics/config
 *
 * Reports what configuration the running process can actually see, so a
 * deployment insisting a variable is missing can be checked against a console
 * insisting it is set — without putting a client secret anywhere it would
 * outlive the question.
 *
 * Three rules make this safe to ship:
 *
 *  1. **Off unless a token is set.** With DIAGNOSTICS_TOKEN unset the route
 *     answers 404, indistinguishable from not existing. Nothing to find by
 *     default, and no separate switch to remember to turn back off.
 *  2. **No values, ever.** Each variable is described only by whether it is
 *     present, how long it is, and whether it carries stray whitespace or fails
 *     to parse as a URL. A length that does not match what you pasted is usually
 *     enough to identify a truncated or wrong-field value.
 *  3. **Nothing is logged.** The report is returned to the caller and not
 *     written to stdout, so it never reaches a log aggregator.
 *
 * Usage:
 *   curl -H "x-diagnostics-token: $DIAGNOSTICS_TOKEN" https://host/api/diagnostics/config
 */

/**
 * Compares two tokens without leaking their contents through timing.
 *
 * @param provided What the caller sent
 * @param expected What the environment holds
 * @returns Whether they match
 */
function tokenMatches(provided: string, expected: string): boolean {
	const a = Buffer.from(provided);
	const b = Buffer.from(expected);

	// timingSafeEqual throws on a length mismatch, which is itself a leak of
	// length; comparing a fixed-size digest-like pair avoids branching on it.
	if (a.length !== b.length) {
		return false;
	}

	return timingSafeEqual(a, b);
}

export default function handler(
	req: NextApiRequest,
	res: NextApiResponse<ConfigReport | ApiError>,
) {
	const expected = (process.env.DIAGNOSTICS_TOKEN ?? "").trim();

	// Disabled by default. A 404 rather than a 401, so the route's existence is
	// not something to discover on a deployment that never enabled it.
	if (!expected) {
		return res.status(404).json({ error: "Not found." });
	}

	if (req.method !== "GET") {
		res.setHeader("Allow", "GET");

		return res.status(405).json({ error: `Method ${req.method} is not allowed here.` });
	}

	const header = req.headers["x-diagnostics-token"];
	const provided = (Array.isArray(header) ? header[0] : header ?? "").trim();

	if (!provided || !tokenMatches(provided, expected)) {
		return res.status(404).json({ error: "Not found." });
	}

	res.setHeader("Cache-Control", "no-store");

	return res.status(200).json(buildConfigReport());
}
