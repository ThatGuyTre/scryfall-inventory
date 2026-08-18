import { loadSecrets } from "@/src/lib/config/secretStore";

/**
 * Which sign-in providers exist, and why.
 *
 * This is the single source of truth, deliberately free of any next-auth import
 * so a page can ask "what can I sign in with?" without a network call to its own
 * API. The sign-in page used to answer that question with `getProviders()`,
 * which fetches `${NEXTAUTH_URL}/api/auth/providers` — and with NEXTAUTH_URL
 * unset that URL defaults to http://localhost:3000, so on a real host the
 * request went nowhere, returned null, and the page reported that nothing was
 * configured whatever the environment actually held.
 *
 * Everything here is async because Cognito's credentials are not necessarily in
 * the environment. On Amplify they live in Parameter Store and are fetched at
 * runtime; see `src/lib/config/secretStore.ts` for why that is the arrangement
 * rather than baking them into the build.
 */

/** The variables Cognito sign-in needs. All three, or it is not configured. */
export const COGNITO_VARS = ["COGNITO_CLIENT_ID", "COGNITO_CLIENT_SECRET", "COGNITO_ISSUER"] as const;

/** A provider as the sign-in page needs to describe it. */
export type ProviderDescriptor = {
	id: string,
	name: string,
}

/** A resolved view of configuration, whatever it came from. */
export type Config = {
	/**
	 * Reads one setting.
	 *
	 * @param name The setting to read
	 * @returns The trimmed value, or an empty string
	 */
	read: (name: string) => string,
	/** Names that came from Parameter Store rather than the environment. */
	fromSecrets: string[],
	/** Why Parameter Store could not be read, if it could not. */
	secretError: string | null,
	/** The Parameter Store path consulted, or null when there was none. */
	secretPath: string | null,
}

/**
 * Resolves configuration from the environment and Parameter Store.
 *
 * The environment wins where both hold a name. That ordering makes local
 * development and an emergency override behave predictably, and costs nothing in
 * production, where a secret's name is absent from the environment by design —
 * Amplify secrets are not environment variables.
 *
 * @returns A resolved view, which never throws on read
 */
export async function resolveConfig(): Promise<Config> {
	const secrets = await loadSecrets();

	const fromSecrets = Object.keys(secrets.values).filter(
		(name) => !(process.env[name] ?? "").trim(),
	);

	return {
		read(name: string): string {
			const fromEnv = (process.env[name] ?? "").trim();

			if (fromEnv) {
				return fromEnv;
			}

			return (secrets.values[name] ?? "").trim();
		},
		fromSecrets,
		secretError: secrets.error,
		secretPath: secrets.path,
	};
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

/** Which of the Cognito settings are missing or blank. */
export function missingCognitoVars(config: Config): string[] {
	return COGNITO_VARS.filter((name) => !config.read(name));
}

/** True when all three Cognito settings carry a value. */
export function isCognitoConfigured(config: Config): boolean {
	return missingCognitoVars(config).length === 0;
}

/**
 * True when signing in by typing an email address is permitted.
 *
 * Refused in production unless ALLOW_LOCAL_SIGNIN is set, because "sign in as
 * anyone by typing their address" is not a thing to leave on by accident.
 */
export function isLocalSignInAllowed(config: Config): boolean {
	if (config.read("ALLOW_LOCAL_SIGNIN") === "true") {
		return true;
	}

	return process.env.NODE_ENV !== "production" && !isCognitoConfigured(config);
}

/**
 * Describes the providers this deployment offers.
 *
 * Computed from resolved configuration, with no request to this app's own API,
 * so it cannot disagree with what the auth route will build from the same call.
 *
 * @returns One descriptor per available provider
 */
export async function describeProviders(): Promise<ProviderDescriptor[]> {
	const config = await resolveConfig();
	const providers: ProviderDescriptor[] = [];

	if (isCognitoConfigured(config)) {
		providers.push({ id: "cognito", name: "Cognito" });
	}

	if (isLocalSignInAllowed(config)) {
		providers.push({ id: "local", name: "Local account" });
	}

	return providers;
}
