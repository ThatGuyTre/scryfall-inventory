/**
 * Server side lookup of card details from Scryfall.
 *
 * The inventory stores Scryfall's id but nothing that can be drawn on screen —
 * no art, no oracle text — because that data belongs to Scryfall and would go
 * stale in our file. This fetches it on demand instead.
 *
 * Two things make that affordable:
 *
 *  - Scryfall's collection endpoint takes up to 75 identifiers per request, so
 *    a screenful of cards is one round trip rather than one per card.
 *  - Printings do not change, so results are cached for the life of the
 *    process and a page reload costs nothing.
 *
 * Scryfall asks for a descriptive User-Agent and no more than ten requests a
 * second; both are honored below.
 */

/** The fields the app actually renders. */
export type ScryfallCardDetails = {
	id: string,
	name: string,
	oracleText: string,
	/** Cropped artwork, the image the card list has always shown. */
	artCrop: string,
	scryfallUri: string,
	/**
	 * Color identity as single letters, e.g. ["W","U","B"].
	 *
	 * The commander finder filters on this. Taking it from Scryfall rather than
	 * from EDHREC is what keeps color filtering free: one batched lookup
	 * covers the whole commander ranking, so filtering never costs an EDHREC
	 * request.
	 */
	colorIdentity: string[],
}

/** Scryfall's documented maximum identifiers per collection request. */
const MAX_IDENTIFIERS_PER_REQUEST = 75;

/** Pause between consecutive requests, per Scryfall's rate limit guidance. */
const REQUEST_SPACING_MS = 100;

/** Sent so Scryfall can identify this app, as their API guidelines ask. */
const USER_AGENT = "scryfall-inventory/0.2 (personal collection tracker)";

/**
 * RFC 4122 UUID, which is what Scryfall accepts as an `id` identifier.
 *
 * This matters more than it looks: Scryfall rejects the *whole batch* with a
 * 400 if a single identifier is malformed. A CSV row carrying a placeholder id
 * would otherwise blank every card on the page rather than just itself.
 */
const SCRYFALL_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Cached across requests, and across hot reloads in development, because a
 * printing's art and text never change.
 */
const globalForScryfall = globalThis as typeof globalThis & {
	scryfallCardCache?: Map<string, ScryfallCardDetails>,
};

const cache = globalForScryfall.scryfallCardCache ?? new Map<string, ScryfallCardDetails>();
globalForScryfall.scryfallCardCache = cache;

/**
 * Waits for a number of milliseconds.
 *
 * @param ms How long to wait
 */
function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Reduces a Scryfall API card to the fields this app renders.
 *
 * Double faced cards keep their art and text on the faces rather than on the
 * card itself, hence the fallbacks.
 *
 * @param data One card object from the Scryfall API
 * @returns The details, or null when the card has no id
 */
function toDetails(data: Record<string, unknown>): ScryfallCardDetails | null {
	const id = typeof data.id === "string" ? data.id : "";

	if (!id) {
		return null;
	}

	const faces = Array.isArray(data.card_faces) ? data.card_faces as Record<string, unknown>[] : [];
	const imageUris = data.image_uris as Record<string, string> | undefined;
	const faceImageUris = faces[0]?.image_uris as Record<string, string> | undefined;

	return {
		id,
		name: typeof data.name === "string" ? data.name : "Unknown card",
		oracleText: (data.oracle_text as string) || (faces[0]?.oracle_text as string) || "",
		artCrop: imageUris?.art_crop || faceImageUris?.art_crop || "",
		scryfallUri: (data.scryfall_uri as string) || "",
		colorIdentity: Array.isArray(data.color_identity) ? data.color_identity as string[] : [],
	};
}

/**
 * Splits a list into chunks of at most `size`.
 *
 * @param values The list to split
 * @param size The largest chunk to produce
 * @returns The chunks, in order
 */
function chunk<T>(values: T[], size: number): T[][] {
	const chunks: T[][] = [];

	for (let i = 0; i < values.length; i += size) {
		chunks.push(values.slice(i, i + size));
	}

	return chunks;
}

/**
 * Looks up card details by Scryfall id.
 *
 * Ids that are malformed, or that Scryfall does not recognize, are simply
 * absent from the result rather than throwing, so one bad id cannot blank a
 * whole page of cards.
 *
 * @param ids The Scryfall ids to look up, duplicates and rubbish tolerated
 * @returns The details found, keyed by Scryfall id
 */
export async function fetchCardsByIds(ids: string[]): Promise<Map<string, ScryfallCardDetails>> {
	const wanted = [...new Set(ids.filter((id) => SCRYFALL_ID_PATTERN.test(id)))];
	const found = new Map<string, ScryfallCardDetails>();
	const missing: string[] = [];

	for (const id of wanted) {
		const cached = cache.get(id);

		if (cached) {
			found.set(id, cached);
		} else {
			missing.push(id);
		}
	}

	const batches = chunk(missing, MAX_IDENTIFIERS_PER_REQUEST);

	for (const [index, batch] of batches.entries()) {
		if (index > 0) {
			await delay(REQUEST_SPACING_MS);
		}

		try {
			const response = await fetch("https://api.scryfall.com/cards/collection", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Accept": "application/json",
					"User-Agent": USER_AGENT,
				},
				body: JSON.stringify({ identifiers: batch.map((id) => ({ id })) }),
			});

			if (!response.ok) {
				console.error(`Scryfall collection lookup failed with status ${response.status}.`);
				continue;
			}

			const body = await response.json() as { data?: Record<string, unknown>[] };

			for (const card of body.data ?? []) {
				const details = toDetails(card);

				if (details) {
					cache.set(details.id, details);
					found.set(details.id, details);
				}
			}
		} catch (error) {
			// A screen of cards without art beats a page that will not load.
			console.error("Scryfall collection lookup failed:", error);
		}
	}

	return found;
}
