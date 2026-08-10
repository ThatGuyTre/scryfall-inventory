/**
 * Server side reader for EDHREC's JSON.
 *
 * EDHREC publishes no documented public API. The JSON behind its pages is what
 * the site itself fetches, and it is read here the same way a browser would.
 * That is a deliberate trade: it is the only way to answer "how much of this
 * deck do I own", and it comes with two obligations this module takes
 * seriously — identify the client honestly, and do not hammer their servers.
 *
 * Every response is cached for a day and concurrent requests for the same page
 * are collapsed into one, so browsing the finder repeatedly costs EDHREC a
 * handful of requests per day rather than one per page view.
 *
 * If EDHREC changes these paths, the finder degrades to an error message and
 * nothing else in the app is affected.
 */

/** How long a fetched page stays usable. Deck statistics move slowly. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Sent so EDHREC can identify this app rather than see an anonymous scraper. */
const USER_AGENT = "scryfall-inventory/0.2 (personal collection tracker)";

/** Abandon a request that has not answered in this long. */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Minimum gap between requests leaving this process, whatever the concurrency.
 *
 * A page of the finder is one request per commander shown, so a cold page can
 * be dozens of requests at once. Capping the rate at roughly eight a second
 * turns that into a steady trickle rather than a burst, which is the least a
 * site with no public API is owed.
 */
const MIN_REQUEST_INTERVAL_MS = 120;

/** Thrown when EDHREC cannot be reached or answers with something unusable. */
export class EdhrecUnavailableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "EdhrecUnavailableError";
	}
}

type CacheEntry = {
	value: unknown,
	expiresAt: number,
}

/**
 * Held on globalThis so hot reloading in development does not throw the cache
 * away and start fetching EDHREC again on every file save.
 */
const globalForEdhrec = globalThis as typeof globalThis & {
	edhrecCache?: Map<string, CacheEntry>,
	edhrecInFlight?: Map<string, Promise<unknown>>,
};

const cache = globalForEdhrec.edhrecCache ?? new Map<string, CacheEntry>();
globalForEdhrec.edhrecCache = cache;

const inFlight = globalForEdhrec.edhrecInFlight ?? new Map<string, Promise<unknown>>();
globalForEdhrec.edhrecInFlight = inFlight;

/** Serializes the rate limiter, so concurrent callers queue rather than race. */
let rateLimitQueue: Promise<unknown> = Promise.resolve();

/** When the last request was allowed to start. */
let lastRequestAt = 0;

/**
 * Waits for a milliseconds.
 *
 * @param ms How long to wait
 */
function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Waits until this process is allowed to make another request.
 *
 * @returns A promise that settles when the caller may proceed
 */
function waitForTurn(): Promise<void> {
	const turn = rateLimitQueue.then(async () => {
		const sinceLast = Date.now() - lastRequestAt;

		if (sinceLast < MIN_REQUEST_INTERVAL_MS) {
			await delay(MIN_REQUEST_INTERVAL_MS - sinceLast);
		}

		lastRequestAt = Date.now();
	});

	// Keep the queue alive even if a caller aborts.
	rateLimitQueue = turn.catch(() => undefined);

	return turn;
}

/**
 * Fetches a page of EDHREC's JSON, from cache when possible.
 *
 * @param path The path under json.edhrec.com, e.g. "/pages/commanders/year.json"
 * @returns The parsed JSON
 * @throws {EdhrecUnavailableError} When EDHREC cannot be reached
 */
export async function fetchEdhrecJson<T>(path: string): Promise<T> {
	const cached = cache.get(path);

	if (cached && cached.expiresAt > Date.now()) {
		return cached.value as T;
	}

	// Two commanders requested at once must not become two identical requests.
	const pending = inFlight.get(path);

	if (pending) {
		return pending as Promise<T>;
	}

	const request = (async () => {
		try {
			await waitForTurn();

			const response = await fetch(`https://json.edhrec.com${path}`, {
				headers: {
					"Accept": "application/json",
					"User-Agent": USER_AGENT,
				},
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			});

			if (!response.ok) {
				throw new EdhrecUnavailableError(
					`EDHREC answered with status ${response.status} for ${path}.`,
				);
			}

			const value = await response.json();

			cache.set(path, { value, expiresAt: Date.now() + CACHE_TTL_MS });

			return value;
		} catch (error) {
			if (error instanceof EdhrecUnavailableError) {
				throw error;
			}

			throw new EdhrecUnavailableError(`EDHREC could not be reached: ${(error as Error).message}`);
		} finally {
			inFlight.delete(path);
		}
	})();

	inFlight.set(path, request);

	return request as Promise<T>;
}

/**
 * Runs tasks with a ceiling on how many are in flight at once.
 *
 * Used so that measuring a page of commanders does not open a dozen
 * simultaneous connections to EDHREC.
 *
 * @param items The inputs to process
 * @param concurrency The most tasks to run at once
 * @param task What to do with each input
 * @returns The results, in the order the inputs were given
 */
export async function mapWithConcurrency<T, R>(
	items: T[],
	concurrency: number,
	task: (item: T) => Promise<R>,
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let next = 0;

	async function worker() {
		while (next < items.length) {
			const index = next++;
			results[index] = await task(items[index]);
		}
	}

	await Promise.all(
		Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
	);

	return results;
}
