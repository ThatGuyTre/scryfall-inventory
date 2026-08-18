/**
 * Reporting on configuration without disclosing it.
 *
 * The problem this solves: a deployment insists a variable is not set while the
 * hosting console insists it is, and there is no safe way to look. Logging the
 * value would put a client secret in CloudWatch, where it lives far longer than
 * the debugging session and is readable by anyone with log access.
 *
 * So nothing here ever returns a value. For each variable it reports only
 * whether it is present and how long it is, plus the failures a truthiness check
 * hides: a value that is only whitespace, or one carrying a trailing newline
 * from a copy-paste, or an issuer that does not parse as a URL. Length alone is
 * usually enough to spot a truncated or wrong-field paste.
 */

/** What can be said about one variable without disclosing it. */
export type VariableReport = {
	name: string,
	/** Whether it holds anything at all once trimmed. */
	set: boolean,
	/** Length of the raw value, before trimming. Zero when unset. */
	length: number,
	/**
	 * True when the raw value differs from its trimmed form — almost always a
	 * newline or space picked up pasting into a console field. Such a value is
	 * truthy, so a naive check reports it as configured while whatever consumes
	 * it fails on the whitespace.
	 */
	hasSurroundingWhitespace: boolean,
	/** Set when the value is expected to be a URL and is not one. */
	malformedUrl?: boolean,
}

/** The whole picture, safe to return over HTTP to an authorized caller. */
export type ConfigReport = {
	nodeEnv: string,
	/** Whether the process looks like an Amplify Hosting compute runtime. */
	looksLikeAmplify: boolean,
	variables: VariableReport[],
	/** Conclusions drawn from the above, in the app's own terms. */
	conclusions: {
		cognitoConfigured: boolean,
		missingForCognito: string[],
		localSignInAllowed: boolean,
		/** Providers the sign-in page will offer, by id. */
		providers: string[],
	},
	/** Things worth fixing, most important first. */
	warnings: string[],
}

/** Variables the app reads, and whether each must parse as a URL. */
const WATCHED: { name: string, url?: boolean }[] = [
	{ name: "COGNITO_CLIENT_ID" },
	{ name: "COGNITO_CLIENT_SECRET" },
	{ name: "COGNITO_ISSUER", url: true },
	{ name: "NEXTAUTH_URL", url: true },
	{ name: "NEXTAUTH_SECRET" },
	{ name: "ALLOW_LOCAL_SIGNIN" },
	{ name: "INVENTORY_DRIVER" },
	{ name: "INVENTORY_TABLE" },
	{ name: "ACCOUNTS_DRIVER" },
	{ name: "AWS_REGION" },
];

/**
 * Describes one variable without disclosing it.
 *
 * @param name The variable to describe
 * @param expectUrl Whether the value should parse as a URL
 * @returns The report
 */
function describe(name: string, expectUrl = false): VariableReport {
	const raw = process.env[name];

	if (raw === undefined) {
		return { name, set: false, length: 0, hasSurroundingWhitespace: false };
	}

	const trimmed = raw.trim();

	const report: VariableReport = {
		name,
		set: trimmed.length > 0,
		length: raw.length,
		hasSurroundingWhitespace: raw !== trimmed,
	};

	if (expectUrl && trimmed) {
		try {
			new URL(trimmed);
		} catch {
			report.malformedUrl = true;
		}
	}

	return report;
}

/**
 * Builds the configuration report.
 *
 * @returns What the runtime can see, described but not disclosed
 */
export function buildConfigReport(): ConfigReport {
	const variables = WATCHED.map((watched) => describe(watched.name, watched.url));
	const byName = new Map(variables.map((variable) => [variable.name, variable]));
	const isSet = (name: string) => byName.get(name)?.set === true;

	const cognitoVars = ["COGNITO_CLIENT_ID", "COGNITO_CLIENT_SECRET", "COGNITO_ISSUER"];
	const missingForCognito = cognitoVars.filter((name) => !isSet(name));
	const cognitoConfigured = missingForCognito.length === 0;
	const isProduction = process.env.NODE_ENV === "production";

	const localSignInAllowed = byName.get("ALLOW_LOCAL_SIGNIN")?.set
		? (process.env.ALLOW_LOCAL_SIGNIN ?? "").trim() === "true"
		: !isProduction && !cognitoConfigured;

	const providers = [
		...(cognitoConfigured ? ["cognito"] : []),
		...(localSignInAllowed ? ["local"] : []),
	];

	const warnings: string[] = [];

	if (providers.length === 0) {
		warnings.push("No sign-in provider is available, so the sign-in page has nothing to offer.");
	}

	for (const variable of variables) {
		if (variable.hasSurroundingWhitespace) {
			warnings.push(`${variable.name} has leading or trailing whitespace. It counts as set but will be used verbatim.`);
		}

		if (variable.malformedUrl) {
			warnings.push(`${variable.name} does not parse as a URL.`);
		}
	}

	if (isProduction && !isSet("NEXTAUTH_URL")) {
		warnings.push(
			"NEXTAUTH_URL is not set. next-auth falls back to http://localhost:3000, " +
			"which breaks OAuth redirects and any server-side call into its own API.",
		);
	}

	if (isProduction && !isSet("NEXTAUTH_SECRET")) {
		warnings.push("NEXTAUTH_SECRET is not set, so sessions are signed with the development fallback in the repository.");
	}

	if (isProduction && localSignInAllowed) {
		warnings.push("Local sign-in is enabled in production: anyone can sign in as anyone by typing an address.");
	}

	if (isSet("INVENTORY_DRIVER") && (process.env.INVENTORY_DRIVER ?? "").trim() === "dynamodb" && !isSet("INVENTORY_TABLE")) {
		warnings.push("INVENTORY_DRIVER is dynamodb but INVENTORY_TABLE is not set.");
	}

	return {
		nodeEnv: process.env.NODE_ENV ?? "unknown",
		// Amplify's compute runtime sets these; useful for telling "my variable is
		// missing" apart from "I am not running where I think I am".
		looksLikeAmplify: Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME || process.env._HANDLER || process.env.AWS_EXECUTION_ENV),
		variables,
		conclusions: { cognitoConfigured, missingForCognito, localSignInAllowed, providers },
		warnings,
	};
}
