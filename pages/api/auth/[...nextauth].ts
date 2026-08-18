import { createHash } from "crypto";
import NextAuth, { type AuthOptions } from "next-auth";
import CognitoProvider from "next-auth/providers/cognito";
import CredentialsProvider from "next-auth/providers/credentials";
import { getAccountRepository } from "@/src/lib/accounts";

/**
 * Sign-in.
 *
 * Two providers, chosen by whether AWS is configured:
 *
 *  - **Cognito**, when COGNITO_CLIENT_ID, COGNITO_CLIENT_SECRET and
 *    COGNITO_ISSUER are all set. Cognito owns emails and passwords; this app
 *    never sees a password.
 *  - **Local**, otherwise. Type an email address and you are signed in as that
 *    person, with no password check at all.
 *
 * The local provider exists so the whole application can be built and used
 * before any AWS resources exist. It is refused outright when NODE_ENV is
 * production unless ALLOW_LOCAL_SIGNIN is explicitly set, because "sign in as
 * anyone by typing their address" is not a thing to leave switched on by
 * accident.
 *
 * Everything downstream reads `session.user.id` and does not care which provider
 * supplied it, so turning Cognito on is a matter of setting three variables.
 */

/**
 * True when the Cognito environment is complete.
 *
 * Amplify Hosting injects Console-configured environment variables — including
 * ones marked secret — as plain `process.env` at build and runtime, so no
 * special SDK call is needed to read them.
 */
export function isCognitoConfigured(): boolean {
	return Boolean(
		process.env.COGNITO_CLIENT_ID &&
		process.env.COGNITO_CLIENT_SECRET &&
		process.env.COGNITO_ISSUER,
	);
}

/** True when signing in by typing an email address is permitted. */
export function isLocalSignInAllowed(): boolean {
	if (process.env.ALLOW_LOCAL_SIGNIN === "true") {
		return true;
	}

	return process.env.NODE_ENV !== "production" && !isCognitoConfigured();
}

/**
 * Derives a stable id from an email address.
 *
 * Local sign-in has no directory to allocate ids from, so the address itself is
 * hashed into a UUID-shaped value. The same address always gives the same id,
 * which is what makes a local account survive a restart. Cognito's `sub` will
 * replace this entirely.
 *
 * @param email The address signed in with
 * @returns A deterministic UUID-shaped id
 */
export function localUserId(email: string): string {
	const hex = createHash("sha256").update(email.trim().toLowerCase()).digest("hex");

	return [
		hex.slice(0, 8),
		hex.slice(8, 12),
		// Version 8, the "custom" UUID version, since this is not random.
		`8${hex.slice(13, 16)}`,
		`8${hex.slice(17, 20)}`,
		hex.slice(20, 32),
	].join("-");
}

const providers: AuthOptions["providers"] = [];

if (isCognitoConfigured()) {
	providers.push(CognitoProvider({
		clientId: process.env.COGNITO_CLIENT_ID as string,
		clientSecret: process.env.COGNITO_CLIENT_SECRET as string,
		issuer: process.env.COGNITO_ISSUER as string,
	}));
}

if (isLocalSignInAllowed()) {
	providers.push(CredentialsProvider({
		id: "local",
		name: "Local account",
		credentials: {
			email: { label: "Email", type: "email", placeholder: "you@example.com" },
			username: { label: "Display name", type: "text", placeholder: "Optional" },
		},
		/**
		 * Accepts any address. There is no password to check because there are no
		 * passwords: this is a development stand-in for Cognito.
		 *
		 * @param credentials What was typed
		 * @returns The user, or null when no address was given
		 */
		async authorize(credentials) {
			const email = credentials?.email?.trim().toLowerCase();

			if (!email || !email.includes("@")) {
				return null;
			}

			return {
				id: localUserId(email),
				email,
				name: credentials?.username?.trim() || email.split("@")[0],
			};
		},
	}));
}

export const authOptions: AuthOptions = {
	providers,
	session: { strategy: "jwt" },
	// next-auth insists on a secret. Signing dev tokens with a fixed string is
	// fine; a deployment sets its own and must, since this one is in the repo.
	secret: process.env.NEXTAUTH_SECRET ?? "development-only-secret-do-not-use-in-production",
	pages: {
		signIn: "/signin",
	},
	callbacks: {
		/**
		 * Puts the user id on the token, and creates the profile row on first
		 * sign-in. This is the only place a user record is brought into
		 * existence, so it must be safe to run on every sign-in.
		 */
		async jwt({ token, user, account }) {
			// `user` is only present on the sign-in itself, not on later reads.
			if (user) {
				// Cognito's subject claim is the id; local sign-in already made one.
				const id = account?.provider === "cognito" ? (token.sub as string) : (user.id as string);
				const email = user.email ?? "";

				const profile = await getAccountRepository().upsertUser(id, {
					email,
					username: user.name ?? email.split("@")[0] ?? "",
				});

				token.userId = profile.id;
				token.username = profile.username;
			}

			return token;
		},

		/**
		 * Copies the id onto the session, which is what the browser sees.
		 */
		async session({ session, token }) {
			if (session.user) {
				session.user.id = (token.userId as string) ?? (token.sub as string) ?? "";
				session.user.username = (token.username as string) ?? "";
			}

			return session;
		},
	},
};

export default NextAuth(authOptions);
