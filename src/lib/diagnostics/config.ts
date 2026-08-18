import { amplifyAppId } from "@/src/lib/config/secretStore";
import { resolveConfig } from "@/src/lib/accounts/authConfig";

/**
 * Reporting on configuration without disclosing it.
 *
 * The problem this solves: a deployment insists a variable is not set while the
 * hosting console insists it is, and there is no safe way to look. Logging the
 * value would put a client secret in CloudWatch, where it lives far longer than
 * the debugging session and is readable by anyone with log access.
 *
 * So nothing here ever returns a value. For each setting it reports only whether
 * it is present, where it came from, and how long it is, plus the failures a
 * truthiness check hides: a value that is only whitespace, or one carrying a
 * trailing newline from a copy-paste, or an issuer that does not parse as a URL.
 * Length alone is usually enough to spot a truncated or wrong-field paste.
 *
 * Reporting the *source* is what makes an Amplify deployment debuggable at all,
 * since a value can arrive as an environment variable or as a Parameter Store
 * secret, and those two fail for entirely different reasons.
 */

/** Where a setting's value came from. */
export type ValueSource = "environment" | "parameter-store" | "unset"

/** What can be said about one setting without disclosing it. */
export type VariableReport = {
	name: string,
	/** Whether it holds anything at all once trimmed. */
	set: boolean,
	/** Which source supplied it. */
	source: ValueSource,
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

/** What happened when Parameter Store was consulted. */
export type SecretStoreReport = {
	/**
	 * The Amplify app id in use. Not a secret: it is the subdomain of the app's
	 * own URL. Null when the runtime knows of none, which is normal off Amplify.
	 */
	appId: string | null,
	/** The path consulted. Null when there was no app id to build one from. */
	path: string | null,
	/** Whether the path was read without error. */
	readable: boolean,
	/** The failure message, if any. Never a value. */
	error: string | null,
	/** Names found there. Names are not secret; the values they hold are. */
	names: string[],
}

/** The whole picture, safe to return over HTTP to an authorized caller. */
export type ConfigReport = {
	nodeEnv: string,
	/** Whether the process looks like an Amplify Hosting compute runtime. */
	looksLikeAmplify: boolean,
	secretStore: SecretStoreReport,
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

/** Settings the app reads, and whether each must parse as a URL. */
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

/** Settings whose value is sensitive, so their source carries a warning. */
const SENSITIVE = new Set([ "COGNITO_CLIENT_SECRET", "NEXTAUTH_SECRET" ]);

/**
 * Describes one setting without disclosing it.
 *
 * @param name The setting to describe
 * @param raw Its raw value, or undefined when nothing supplies it
 * @param source Where that value came from
 * @param expectUrl Whether the value should parse as a URL
 * @returns The report
 */
function describe(name: string, raw: string | undefined, source: ValueSource, expectUrl = false): VariableReport {
	if (raw === undefined) {
		return { name, set: false, source: "unset", length: 0, hasSurroundingWhitespace: false };
	}

	const trimmed = raw.trim();

	const report: VariableReport = {
		name,
		set: trimmed.length > 0,
		source: trimmed.length > 0 ? source : "unset",
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
export async function buildConfigReport(): Promise<ConfigReport> {
	const config = await resolveConfig();
	const appId = amplifyAppId();

	const variables = WATCHED.map((watched) => {
		const fromEnv = process.env[watched.name];

		if (fromEnv !== undefined && fromEnv.trim()) {
			return describe(watched.name, fromEnv, "environment", watched.url);
		}

		// Not in the environment, so it came either from Parameter Store or from
		// nowhere. resolveConfig has already merged the two.
		const merged = config.read(watched.name);

		if (merged) {
			return describe(watched.name, merged, "parameter-store", watched.url);
		}

		// Preserve an environment value that exists but is only whitespace, since
		// that is a distinct and confusing failure worth reporting as such.
		return describe(watched.name, fromEnv, "environment", watched.url);
	});

	const byName = new Map(variables.map((variable) => [variable.name, variable]));
	const isSet = (name: string) => byName.get(name)?.set === true;

	const cognitoVars = ["COGNITO_CLIENT_ID", "COGNITO_CLIENT_SECRET", "COGNITO_ISSUER"];
	const missingForCognito = cognitoVars.filter((name) => !isSet(name));
	const cognitoConfigured = missingForCognito.length === 0;
	const isProduction = process.env.NODE_ENV === "production";

	const localSignInAllowed = isSet("ALLOW_LOCAL_SIGNIN")
		? config.read("ALLOW_LOCAL_SIGNIN") === "true"
		: !isProduction && !cognitoConfigured;

	const providers = [
		...(cognitoConfigured ? ["cognito"] : []),
		...(localSignInAllowed ? ["local"] : []),
	];

	const looksLikeAmplify = Boolean(
		process.env.AWS_LAMBDA_FUNCTION_NAME || process.env._HANDLER || process.env.AWS_EXECUTION_ENV,
	);

	const warnings: string[] = [];

	if (providers.length === 0) {
		warnings.push("No sign-in provider is available, so the sign-in page has nothing to offer.");
	}

	if (config.secretError) {
		warnings.push(
			"Parameter Store could not be read: " + config.secretError + ". On Amplify " +
			"that usually means no SSR compute role is attached, or the attached role " +
			"lacks ssm:GetParametersByPath and kms:Decrypt for that path. A compute " +
			"role is attached with --compute-role-arn; --iam-service-role-arn is the " +
			"build role and grants the runtime nothing.",
		);
	}

	if (looksLikeAmplify && !appId) {
		warnings.push(
			"This looks like an Amplify runtime but no app id is known, so Parameter " +
			"Store was never consulted. Forward AWS_APP_ID into .env.production in " +
			"amplify.yml, or set AMPLIFY_APP_ID.",
		);
	}

	for (const variable of variables) {
		if (variable.hasSurroundingWhitespace) {
			warnings.push(variable.name + " has leading or trailing whitespace. It counts as set but will be used verbatim.");
		}

		if (variable.malformedUrl) {
			warnings.push(variable.name + " does not parse as a URL.");
		}

		if (SENSITIVE.has(variable.name) && variable.source === "environment" && isProduction) {
			warnings.push(
				variable.name + " came from an environment variable. If amplify.yml " +
				"writes it into .env.production it is readable by anyone who can read " +
				"the deployment artifact; Parameter Store keeps it out of the build.",
			);
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

	if (config.read("INVENTORY_DRIVER") === "dynamodb" && !isSet("INVENTORY_TABLE")) {
		warnings.push("INVENTORY_DRIVER is dynamodb but INVENTORY_TABLE is not set.");
	}

	return {
		nodeEnv: process.env.NODE_ENV ?? "unknown",
		// Amplify's compute runtime sets these; useful for telling "my variable is
		// missing" apart from "I am not running where I think I am".
		looksLikeAmplify,
		secretStore: {
			appId: appId || null,
			path: config.secretPath,
			readable: config.secretError === null && config.secretPath !== null,
			error: config.secretError,
			names: config.fromSecrets,
		},
		variables,
		conclusions: { cognitoConfigured, missingForCognito, localSignInAllowed, providers },
		warnings,
	};
}
