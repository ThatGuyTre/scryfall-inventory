/**
 * Which sign-in providers exist, and why.
 *
 * This is the single source of truth, deliberately free of any next-auth import
 * so a page can ask "what can I sign in with?" without a network call. The
 * sign-in page used to answer that question with `getProviders()`, which fetches
 * `${NEXTAUTH_URL}/api/auth/providers` — and with NEXTAUTH_URL unset that URL
 * defaults to http://localhost:3000, so on a real host the request went nowhere,
 * returned null, and the page reported that nothing was configured whatever the
 * environment actually held.
 */

/** The variables Cognito sign-in needs. All three, or it is not configured. */
export const COGNITO_VARS = ["COGNITO_CLIENT_ID", "COGNITO_CLIENT_SECRET", "COGNITO_ISSUER"] as const;

/** A provider as the sign-in page needs to describe it. */
export type ProviderDescriptor = {
	id: string,
	name: string,
}

/**
 * Reads an environment variable, treating whitespace-only as unset.
 *
 * Values pasted into a hosting console routinely carry a trailing newline or
 * space. Such a value is truthy, so a naive check calls it configured and the
 * failure surfaces much later as a malformed issuer URL.
 *
 * @param name The variable to read
 * @returns The trimmed value, or an empty string
 */
export function readEnv(name: string): string {
	return (process.env[name] ?? "").trim();
}

/** Which of the Cognito variables are missing or blank. */
export function missingCognitoVars(): string[] {
	return COGNITO_VARS.filter((name) => !readEnv(name));
}

/** True when all three Cognito variables carry a value. */
export function isCognitoConfigured(): boolean {
	return missingCognitoVars().length === 0;
}

/**
 * True when signing in by typing an email address is permitted.
 *
 * Refused in production unless ALLOW_LOCAL_SIGNIN is set, because "sign in as
 * anyone by typing their address" is not a thing to leave on by accident.
 */
export function isLocalSignInAllowed(): boolean {
	if (readEnv("ALLOW_LOCAL_SIGNIN") === "true") {
		return true;
	}

	return process.env.NODE_ENV !== "production" && !isCognitoConfigured();
}

/**
 * Describes the providers this deployment offers.
 *
 * Computed from the environment, with no request and no next-auth involvement,
 * so it cannot disagree with what the auth route will build.
 *
 * @returns One descriptor per available provider
 */
export function describeProviders(): ProviderDescriptor[] {
	const providers: ProviderDescriptor[] = [];

	if (isCognitoConfigured()) {
		providers.push({ id: "cognito", name: "Cognito" });
	}

	if (isLocalSignInAllowed()) {
		providers.push({ id: "local", name: "Local account" });
	}

	return providers;
}
