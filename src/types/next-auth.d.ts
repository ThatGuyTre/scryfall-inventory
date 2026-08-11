import type { DefaultSession } from "next-auth";

/**
 * Widens next-auth's session type with the fields this app puts on it.
 *
 * Without this, `session.user.id` is a type error even though the callback in
 * pages/api/auth/[...nextauth].ts sets it. Declaring it here keeps every
 * consumer honest about what a session actually carries.
 */
declare module "next-auth" {
	interface Session {
		user: {
			/** The identity provider's id — Cognito's `sub`, or a local stand-in. */
			id: string,
			/** The chosen display name, as stored on the profile. */
			username: string,
		} & DefaultSession["user"],
	}
}

declare module "next-auth/jwt" {
	interface JWT {
		userId?: string,
		username?: string,
	}
}
