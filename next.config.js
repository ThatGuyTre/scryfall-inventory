const { version } = require("./package.json");

/** @type {import('next').NextConfig} */
const nextConfig = {
	reactStrictMode: false,

	/*
		The header shows the app's version. Reading it from package.json here
		means it is set once, at build time, from the single place a version is
		already recorded — rather than a string in the markup that quietly goes
		stale. Only the version string reaches the browser, not package.json.
	*/
	env: {
		NEXT_PUBLIC_APP_VERSION: version,
	},
}

module.exports = nextConfig
