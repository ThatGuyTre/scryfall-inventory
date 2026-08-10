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

	/**
	 * The inventory used to live at /searchyourinventory. Bookmarks, and any
	 * installed copy of the app whose service worker cached the old path, are
	 * sent to the new one rather than a 404.
	 */
	async redirects() {
		return [
			{
				source: "/searchyourinventory",
				destination: "/inventory",
				permanent: false,
			},
		];
	},
}

module.exports = nextConfig
