/*
	The service worker behind the installable app.

	Hand written rather than generated, because the caching this site needs is
	small enough to read in one sitting and a build plugin would be one more
	dependency to keep patched.

	Three rules, in order:

	  1. Anything that is not a same-origin GET — the inventory API included —
	     goes straight to the network. Inventory data must never be served from
	     a cache, or an import would appear not to have happened.
	  2. Build output under /_next/static is content hashed, so it is immutable
	     and answered from the cache first.
	  3. Everything else, including page navigations, is network first with the
	     cache as the offline fallback.
*/

// Bumping this version drops every previously cached response.
// v3: the import page moved from /importfrommanabox to /import, and the groups
// pages are new, so anything an earlier install cached has to go.
const CACHE_NAME = "scryfall-inventory-v3";

// Fetched on install so the app opens at least once with no connection.
const PRECACHE_URLS = [
	"/",
	"/inventory",
	"/import",
	"/manifest.webmanifest",
	"/icons/icon-192.png",
	"/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME)
			// addAll is all-or-nothing, so a single 404 would abort the install.
			.then((cache) => Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url))))
			.then(() => self.skipWaiting()),
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches.keys()
			.then((keys) => Promise.all(
				keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
			))
			.then(() => self.clients.claim()),
	);
});

self.addEventListener("fetch", (event) => {
	const request = event.request;
	const url = new URL(request.url);

	// Rule 1: never cache anything but same-origin reads, and never the API.
	if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
		return;
	}

	// Rule 2: hashed build output can be trusted forever.
	if (url.pathname.startsWith("/_next/static/")) {
		event.respondWith(
			caches.match(request).then((cached) => cached || fetchAndCache(request)),
		);
		return;
	}

	// Rule 3: fresh when online, cached when not.
	event.respondWith(
		fetchAndCache(request).catch(() => caches.match(request).then((cached) => cached || offlineFallback(request))),
	);
});

/**
 * Fetches a request and stores a copy of a successful response.
 *
 * @param {Request} request The request to fetch
 * @returns {Promise<Response>} The network response
 */
function fetchAndCache(request) {
	return fetch(request).then((response) => {
		// Opaque and error responses are not worth keeping.
		if (response.ok && response.type === "basic") {
			const copy = response.clone();
			caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
		}

		return response;
	});
}

/**
 * Answers an offline navigation with the cached home page, so the app shell
 * still opens rather than showing the browser's error screen.
 *
 * @param {Request} request The request that could not be served
 * @returns {Promise<Response>} A cached page, or a 504
 */
function offlineFallback(request) {
	if (request.mode === "navigate") {
		return caches.match("/").then((cached) => cached || new Response("Offline", { status: 504 }));
	}

	return new Response("Offline", { status: 504 });
}
