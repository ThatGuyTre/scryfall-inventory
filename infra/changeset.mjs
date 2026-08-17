#!/usr/bin/env node
/**
 * Prepares a CloudFormation change set for infra/stack.yaml, and stops.
 *
 * It deliberately does not deploy. A change set is a diff that CloudFormation
 * has validated but not applied, so you can read exactly which resources would
 * be created or altered and then execute it yourself — or throw it away. This
 * script prints the command that executes it; it never runs that command.
 *
 * Usage:
 *   npm run infra:changeset -- --domain-prefix my-mtg-tool
 *   npm run infra:changeset -- --domain-prefix my-mtg-tool --url https://cards.example.com
 *
 * Requires the AWS CLI, configured with credentials that may create DynamoDB
 * tables and Cognito user pools.
 */

import { spawnSync } from "child_process";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.join(HERE, "stack.yaml");

/**
 * Reads --flag value pairs from the command line.
 *
 * @param {string[]} argv Raw arguments, excluding node and the script
 * @returns {Record<string, string>} The flags, without their leading dashes
 */
function parseFlags(argv) {
	const flags = {};

	for (let i = 0; i < argv.length; i++) {
		if (!argv[i].startsWith("--")) {
			continue;
		}

		const name = argv[i].slice(2);
		const next = argv[i + 1];

		flags[name] = next && !next.startsWith("--") ? next : "true";
	}

	return flags;
}

/**
 * Prints a message and exits non-zero.
 *
 * @param {string} message What went wrong
 */
function fail(message) {
	console.error(`\n  ${message}\n`);
	process.exit(1);
}

const flags = parseFlags(process.argv.slice(2));

if (!existsSync(TEMPLATE)) {
	fail(`Cannot find ${TEMPLATE}`);
}

const domainPrefix = flags["domain-prefix"];

if (!domainPrefix) {
	fail(
		"A Cognito domain prefix is required, and has to be unique across all of AWS.\n" +
		"  Example: npm run infra:changeset -- --domain-prefix tre-mtg-inventory",
	);
}

const project = flags.project ?? "mtg-inventory-tool";
const stackName = flags.stack ?? project;

// The deployed site's origin, if there is one yet. Localhost is always allowed
// so that a freshly created pool works for development straight away.
const siteUrl = flags.url?.replace(/\/$/, "");
const callbacks = ["http://localhost:3000/api/auth/callback/cognito"];
const logouts = ["http://localhost:3000"];

if (siteUrl && siteUrl !== "true") {
	callbacks.push(`${siteUrl}/api/auth/callback/cognito`);
	logouts.push(siteUrl);
}

const args = [
	"cloudformation", "deploy",
	"--template-file", TEMPLATE,
	"--stack-name", stackName,
	// The whole point: validate and diff, do not apply.
	"--no-execute-changeset",
	"--no-fail-on-empty-changeset",
	"--parameter-overrides",
	`ProjectName=${project}`,
	`CognitoDomainPrefix=${domainPrefix}`,
	`CallbackUrls=${callbacks.join(",")}`,
	`LogoutUrls=${logouts.join(",")}`,
];

if (flags.profile) {
	args.push("--profile", flags.profile);
}

if (flags.region) {
	args.push("--region", flags.region);
}

console.log("\n  Preparing a change set. Nothing will be created.\n");
console.log(`    stack     ${stackName}`);
console.log(`    template  ${path.relative(process.cwd(), TEMPLATE)}`);
if (flags.profile) {
	console.log(`    profile   ${flags.profile}`);
}
console.log(`    callbacks ${callbacks.join(", ")}`);
console.log("");

const result = spawnSync("aws", args, { stdio: "inherit", shell: process.platform === "win32" });

if (result.error?.code === "ENOENT") {
	fail("The AWS CLI is not on your PATH. Install it, then run this again.");
}

// `deploy --no-execute-changeset` exits non-zero by design once the change set
// is ready, printing the command to execute it. That is success, not failure.
console.log("\n  Read the change set above, then:\n");
console.log("    1. Review it in the console, or with:");
console.log("         aws cloudformation describe-change-set --change-set-name <arn from above>\n");
console.log("    2. Execute it when you are happy:");
console.log("         aws cloudformation execute-change-set --change-set-name <arn from above>\n");
console.log("    3. Then read the outputs for your .env.local values:");
console.log(`         aws cloudformation describe-stacks --stack-name ${stackName} --query "Stacks[0].Outputs"\n`);
console.log("  infra/AWS-SETUP.md has the rest.\n");
