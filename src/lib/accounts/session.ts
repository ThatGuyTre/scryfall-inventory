import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { ANONYMOUS_OWNER_ID } from "./types";

/**
 * Reading the signed-in user on the server.
 *
 * Every API route that touches stored data goes through here, so there is one
 * place that decides who a caller is and one place to change when the identity
 * provider does.
 */

/** Who is calling, if anyone. */
export type Caller = {
	userId: string,
	email: string,
}

/**
 * Reads the caller from the request's session.
 *
 * @param req The request
 * @param res The response, which getServerSession needs for cookie handling
 * @returns The caller, or null when nobody is signed in
 */
export async function readCaller(req: NextApiRequest, res: NextApiResponse): Promise<Caller | null> {
	const session = await getServerSession(req, res, authOptions);

	if (!session?.user?.id) {
		return null;
	}

	return { userId: session.user.id, email: session.user.email ?? "" };
}

/**
 * Reads the caller, or answers 401 and returns null.
 *
 * Anonymous visitors are a supported way to use this app, but only against data
 * in their own browser — anything that reads or writes the server needs an
 * account, and saying so with a status code beats a confusing empty result.
 *
 * @param req The request
 * @param res The response
 * @returns The caller, or null once a 401 has been sent
 */
export async function requireCaller(req: NextApiRequest, res: NextApiResponse): Promise<Caller | null> {
	const caller = await readCaller(req, res);

	if (!caller) {
		res.status(401).json({ error: "Sign in to use this. Nothing is saved for signed-out visitors." });
		return null;
	}

	return caller;
}

/**
 * The collection a request should read or write.
 *
 * Signed-in callers get their own; signed-out ones get the anonymous bucket,
 * which exists so that local development and the demo path have somewhere to
 * put a collection without inventing a user.
 *
 * @param caller The caller, or null
 * @returns The owner id to use
 */
export function ownerIdFor(caller: Caller | null): string {
	return caller?.userId ?? ANONYMOUS_OWNER_ID;
}
