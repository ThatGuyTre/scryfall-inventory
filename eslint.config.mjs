import coreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";

/*
	ESLint 9 flat config. This replaces the old .eslintrc.json — Next 16
	removed `next lint`, so linting now runs through the `eslint` binary
	directly (see the "lint" script in package.json). The rules below are
	the same ones the project has always used.
*/
const config = [
	{
		ignores: [".next/**", "out/**", "build/**", "node_modules/**", "next-env.d.ts"],
	},

	...coreWebVitals,
	...nextTypescript,
	...tseslint.configs.recommended,

	{
		rules: {
			// I suggest you add those two rules:
			"@typescript-eslint/no-unused-vars": "warn",
			"@typescript-eslint/no-explicit-any": "warn",
			"indent": ["warn", "tab", { SwitchCase: 1 }],
			"quotes": ["warn", "double"],
		},
	},

	{
		// next.config.js is CommonJS by necessity — Next loads it before any
		// module system is set up — so require() is correct there.
		files: ["*.config.js"],
		rules: {
			"@typescript-eslint/no-require-imports": "off",
		},
	},
];

export default config;
