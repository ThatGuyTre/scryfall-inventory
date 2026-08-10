import type { NextApiRequest, NextApiResponse } from "next";
import { EdhrecUnavailableError, mapWithConcurrency } from "@/src/lib/edhrec/client";
import { DeckCoverage, measureCoverage } from "@/src/lib/edhrec/coverage";
import {
	colorSources,
	CommanderSummary,
	fetchAverageDeck,
	fetchColorRanking,
	fetchTopCommanders,
	parseDeckVariant,
} from "@/src/lib/edhrec/decks";
import { getInventoryRepository } from "@/src/lib/inventory";
import { ApiError, CommanderPool, CommanderSearchResponse } from "@/src/lib/inventory/api";
import { DEFAULT_OWNER_ID } from "@/src/lib/inventory/types";
import { fetchCardsByIds } from "@/src/lib/scryfall/cards";

/**
 * GET /api/commanders
 *
 * Scores EDHREC's most played commanders against the collection.
 *
 * Query parameters:
 *   pool    — "all" to use every card owned, "nodeck" to use only cards that
 *             are not already sleeved into a deck.
 *   variant — which bracket or price tier of deck to measure against.
 *   colors  — color identity filter, e.g. "WUB". Commanders are kept when
 *             their identity fits inside the chosen colors.
 *   page    — 1-based page of the filtered ranking.
 *   limit   — commanders per page.
 *   depth   — how many extra color rankings to widen the candidate pool with.
 *
 * ## What this costs EDHREC
 *
 * One request for the whole hundred-commander ranking, then one request per
 * commander actually shown — so a page view is a bounded burst of `limit`
 * requests, whatever the filter. Color filtering is free because colors come
 * from Scryfall, not from EDHREC.
 *
 * Each step of `depth` adds one color ranking, which costs one or two further
 * requests: EDHREC answers a color request with a redirect, so the first read
 * of a color is a redirect plus the page it names. Responses are cached for a
 * day and identical concurrent requests are collapsed, so paging back to
 * somewhere already seen costs nothing.
 */

/** Commanders measured per page. */
const DEFAULT_PAGE_SIZE = 48;

/**
 * The largest page allowed. Every entry on a page is a request to EDHREC, so
 * this is the size of the burst a cold page view produces; the rate limiter in
 * the EDHREC client is what keeps that burst civil.
 */
const MAX_PAGE_SIZE = 48;

/** Simultaneous requests to EDHREC. Kept low on purpose. */
const EDHREC_CONCURRENCY = 3;

/** The five colors, in the order Magic conventionally lists them. */
const COLORS = ["W", "U", "B", "R", "G"];

/**
 * Reads a query parameter that may arrive repeated.
 *
 * @param value The raw value from req.query
 * @returns The first value, or an empty string
 */
function firstValue(value: string | string[] | undefined): string {
	return (Array.isArray(value) ? value[0] : value) ?? "";
}

/**
 * Reads the requested card pool.
 *
 * Defaults to "nodeck": the useful question is usually "what could I build
 * without taking an existing deck apart", so that is what an unqualified
 * request answers.
 *
 * @param value The raw query value
 * @returns The pool, defaulting to cards outside a deck
 */
function parsePool(value: string | string[] | undefined): CommanderPool {
	return firstValue(value) === "all" ? "all" : "nodeck";
}

/**
 * Reads the color filter, e.g. "WUB" or "wub".
 *
 * @param value The raw query value
 * @returns The chosen colors, deduplicated and in canonical order
 */
function parseColors(value: string | string[] | undefined): string[] {
	const chosen = new Set(firstValue(value).toUpperCase().split("").filter((letter) => COLORS.includes(letter)));

	return COLORS.filter((color) => chosen.has(color));
}

/**
 * Reads a positive integer query parameter.
 *
 * @param value The raw query value
 * @param fallback What to use when it is absent or nonsense
 * @param max The largest value allowed
 * @returns The parsed number
 */
function parseCount(value: string | string[] | undefined, fallback: number, max: number): number {
	const parsed = Number.parseInt(firstValue(value), 10);

	return Number.isFinite(parsed) ? Math.min(max, Math.max(1, parsed)) : fallback;
}

/**
 * Attaches each commander's color identity, taken from Scryfall in one batched
 * lookup rather than a request per commander.
 *
 * @param commanders The ranking from EDHREC
 * @returns The same commanders with their color identity
 */
async function withColorIdentity(
	commanders: CommanderSummary[],
): Promise<(CommanderSummary & { colorIdentity: string[] })[]> {
	const details = await fetchCardsByIds(commanders.map((commander) => commander.scryfallId));

	return commanders.map((commander) => ({
		...commander,
		colorIdentity: details.get(commander.scryfallId)?.colorIdentity ?? [],
	}));
}

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse<CommanderSearchResponse | ApiError>,
) {
	if (req.method !== "GET") {
		res.setHeader("Allow", "GET");

		return res.status(405).json({ error: `Method ${req.method} is not allowed here.` });
	}

	const pool = parsePool(req.query.pool);
	const variant = parseDeckVariant(firstValue(req.query.variant));
	const colors = parseColors(req.query.colors);
	const limit = parseCount(req.query.limit, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
	const page = parseCount(req.query.page, 1, 1000);
	const sources = colorSources(colors);
	const depth = Math.min(sources.length, Math.max(0, Number.parseInt(firstValue(req.query.depth), 10) || 0));

	try {
		const repository = getInventoryRepository();

		// "Cards not already in a deck" is the whole collection minus anything
		// filed under a location of kind "deck".
		const index = await repository.nameIndex(DEFAULT_OWNER_ID, {
			excludeLocationKinds: pool === "nodeck" ? ["deck"] : [],
		});

		const cardsInPool = Object.values(index).reduce((total, quantity) => total + quantity, 0);

		// The overall top 100 is always the starting pool. Widening pulls in
		// EDHREC's per-color rankings, which go far deeper into each identity.
		const candidates = new Map<string, CommanderSummary>();

		for (const commander of await fetchTopCommanders()) {
			candidates.set(commander.slug, commander);
		}

		for (const source of sources.slice(0, depth)) {
			try {
				for (const commander of await fetchColorRanking(source)) {
					const existing = candidates.get(commander.slug);

					// Keep whichever entry reports more decks; the counts are
					// absolute, so the union stays sortable by popularity.
					if (!existing || commander.numDecks > existing.numDecks) {
						candidates.set(commander.slug, commander);
					}
				}
			} catch (error) {
				// A color page that will not load should not lose the pool
				// already gathered.
				console.error(`Could not widen with "${source.key}":`, error);
			}
		}

		const ranking = (await withColorIdentity([...candidates.values()]))
			.sort((left, right) => right.numDecks - left.numDecks);

		// A commander is buildable in the chosen colors when its identity fits
		// inside them, which is also how a colorless commander stays visible
		// whatever is selected. No colors chosen means no filtering at all.
		const filtered = colors.length === 0
			? ranking
			: ranking.filter((commander) => commander.colorIdentity.every((color) => colors.includes(color)));

		const pageCount = Math.max(1, Math.ceil(filtered.length / limit));
		const currentPage = Math.min(page, pageCount);
		const start = (currentPage - 1) * limit;
		const visible = filtered.slice(start, start + limit);

		// Only the commanders on this page are fetched from EDHREC.
		const measured = await mapWithConcurrency(visible, EDHREC_CONCURRENCY, async (commander) => {
			try {
				return measureCoverage(await fetchAverageDeck(commander.slug, variant), index);
			} catch (error) {
				// One unreadable commander page should not lose the other seven.
				console.error(`Could not measure "${commander.slug}" at "${variant}":`, error);
				return null;
			}
		});

		const decks = measured
			.filter((deck): deck is DeckCoverage => deck !== null)
			.sort((left, right) => right.coverage - left.coverage);

		if (decks.length === 0 && visible.length > 0) {
			throw new EdhrecUnavailableError("No commander decks could be read from EDHREC.");
		}

		// EDHREC data is cached for a day upstream; there is no reason for the
		// browser to hold a copy that could outlive an import.
		res.setHeader("Cache-Control", "no-store");

		return res.status(200).json({
			pool,
			variant,
			colors: colors,
			cardsInPool,
			page: currentPage,
			pageCount,
			pageSize: limit,
			totalCommanders: ranking.length,
			matchingCommanders: filtered.length,
			depth,
			/** What another step of depth would pull in, or null when exhausted. */
			nextSource: depth < sources.length ? sources[depth].label : null,
			decks,
		});
	} catch (error) {
		if (error instanceof EdhrecUnavailableError) {
			return res.status(502).json({
				error: `EDHREC is not answering right now, so decks cannot be scored. ${error.message}`,
			});
		}

		console.error("Scoring commander decks failed:", error);

		return res.status(500).json({ error: "The commander search failed. Check the server logs." });
	}
}
