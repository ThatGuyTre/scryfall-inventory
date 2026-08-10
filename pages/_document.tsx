import { Head, Html, Main, NextScript } from "next/document";

/**
 *
 * The Document component wraps every rendered page. It carries the markup that
 * lives outside React — the language of the page and the icon, manifest and
 * platform tags that let the site be installed as a progressive web app.
 *
 * @returns The Document component
 *
 */
export default function Document() {
	return (
		<Html lang="en">
			<Head>
				<link rel="manifest" href="/manifest.webmanifest" />
				<link rel="icon" href="/favicon.ico" sizes="any" />
				<link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />
				<link rel="apple-touch-icon" href="/icons/icon-192.png" />

				{/* Colors the browser and task switcher chrome to match the Header. */}
				<meta name="theme-color" content="#74b87d" />

				{/* iOS does not read the manifest, so the same details are repeated here. */}
				<meta name="apple-mobile-web-app-capable" content="yes" />
				<meta name="apple-mobile-web-app-title" content="MTG Inventory Tool" />
				<meta name="apple-mobile-web-app-status-bar-style" content="default" />
			</Head>
			<body>
				<Main />
				<NextScript />
			</body>
		</Html>
	);
}
