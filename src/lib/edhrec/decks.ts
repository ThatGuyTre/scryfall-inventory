import { normalizeCardName } from "../inventory/card";
import { EdhrecUnavailableError, fetchEdhrecJson } from "./client";

/**
 * Turns EDHREC's commander pages into a representative 100 card deck.
 *
 * EDHREC does not publish "the" decklist for a commander — it publishes how
 * often each card is played alongside it, plus the average number of creatures,
 * instants, lands and so on that its decks contain. Those two things together
 * describe a typical deck, and that is what is reconstructed here: fill each
 * type's average slot count with the most played cards of that type.
 *
 * The result is honest about what it is. It is not a specific person's list, it
 * is the average deck for that commander, which is exactly the right thing to
 * measure a collection against.
 */

/** One card as EDHREC lists it. */
type CardView = {
	name?: string,
	num_decks?: number,
}

/** One of EDHREC's grouped card lists, e.g. every creature played. */
type CardList = {
	tag?: string,
	cardviews?: CardView[],
}

/** The commander's own card, as EDHREC describes it. */
type CommanderCard = {
	name?: string,
	color_identity?: string[],
	num_decks?: number,
	image_uris?: { normal?: string, art_crop?: string }[],
}

/** The shape of a commander page, reduced to the parts used here. */
type CommanderPage = {
	creature?: number,
	instant?: number,
	sorcery?: number,
	artifact?: number,
	enchantment?: number,
	planeswalker?: number,
	battle?: number,
	basic?: number,
	nonbasic?: number,
	container?: {
		json_dict?: {
			cardlists?: CardList[],
			card?: CommanderCard,
		},
	},
}

/** The shape of a commander ranking page. */
type RankingPage = {
	/** Color pages answer with this instead, e.g. "/commanders/azorius". */
	redirect?: string,
	container?: {
		json_dict?: {
			cardlists?: {
				cardviews?: {
					id?: string,
					name?: string,
					sanitized?: string,
					slug?: string,
					num_decks?: number,
				}[],
			}[],
		},
	},
}

/**
 * Which slice of EDHREC's decks to average.
 *
 * "any" is the aggregate page — every deck for that commander. The rest are
 * EDHREC's own sub-pages: the five Commander brackets, plus its two price
 * tiers. Each is a different average deck, so a cEDH build and a budget build
 * are scored against genuinely different card lists.
 */
export type DeckVariant = "any" | "exhibition" | "core" | "upgraded" | "optimized" | "cedh" | "budget" | "expensive";

/** The variants offered, in the order they are shown. */
export const DECK_VARIANTS: { value: DeckVariant, label: string }[] = [
	{ value: "any", label: "Most Played Cards" },
	{ value: "exhibition", label: "B1: Exhibition" },
	{ value: "core", label: "B2: Core" },
	{ value: "upgraded", label: "B3: Upgraded" },
	{ value: "optimized", label: "B4: Optimized" },
	{ value: "cedh", label: "B5: cEDH" },
	{ value: "budget", label: "Budget" },
	{ value: "expensive", label: "Expensive" },
];

/**
 * Narrows an untrusted value to a {@link DeckVariant}.
 *
 * @param value The value supplied by the client
 * @returns The variant, defaulting to "any"
 */
export function parseDeckVariant(value: unknown): DeckVariant {
	return DECK_VARIANTS.some((variant) => variant.value === value)
		? value as DeckVariant
		: "any";
}

/** A commander in EDHREC's popularity ranking. */
export type CommanderSummary = {
	slug: string,
	name: string,
	/** Scryfall's id for the commander, used to look up its color identity. */
	scryfallId: string,
	/** How many decks on EDHREC run this commander. */
	numDecks: number,
}

/** The average deck for one commander, at one variant. */
export type AverageDeck = {
	slug: string,
	name: string,
	variant: DeckVariant,
	artCrop: string,
	edhrecUrl: string,
	colorIdentity: string[],
	numDecks: number,
	/** Basic lands in the average deck. Assumed available, never counted as missing. */
	basicLands: number,
	/** The commander plus every non-basic card, by name. */
	cards: string[],
}

/**
 * Which EDHREC card lists fill which slot, and which page counter says how many
 * of that slot a typical deck runs.
 *
 * Artifacts and lands are spread across two lists apiece on EDHREC, so both are
 * merged before the top cards are taken.
 */
/** The basic land types, normalized for comparison. */
const BASIC_LAND_TYPES = ["plains", "island", "swamp", "mountain", "forest", "wastes"];

/**
 * Tests whether a card is a basic land.
 *
 * This matters more than it looks. EDHREC's "lands" list is ordered by play
 * rate, and basics are the most played lands there are — Forest, Island, Plains
 * and Swamp sit at positions two through five. Filling the non-basic land slots
 * from that list therefore spent four of them on basics, which displaced four
 * real lands from the deck and quietly counted basics towards coverage despite
 * the page saying they were excluded.
 *
 * @param name The card name as EDHREC gives it
 * @returns Whether it is a basic land, snow-covered ones included
 */
function isBasicLand(name: string): boolean {
	const normalized = normalizeCardName(name);

	return BASIC_LAND_TYPES.some((type) => normalized === type || normalized === `snowcovered${type}`);
}

const DECK_SLOTS: { count: keyof CommanderPage, tags: string[] }[] = [
	{ count: "creature", tags: ["creatures"] },
	{ count: "instant", tags: ["instants"] },
	{ count: "sorcery", tags: ["sorceries"] },
	{ count: "artifact", tags: ["manaartifacts", "utilityartifacts"] },
	{ count: "enchantment", tags: ["enchantments"] },
	{ count: "planeswalker", tags: ["planeswalkers"] },
	{ count: "battle", tags: ["battles"] },
	{ count: "nonbasic", tags: ["lands", "utilitylands"] },
];

/**
 * Fetches EDHREC's most played commanders.
 *
 * This is one request for the whole ranking — a hundred commanders — which is
 * why paging and color filtering can happen without touching EDHREC again.
 * Only the commanders actually shown cost a further request each.
 *
 * @returns The commanders, most played first
 * @throws {EdhrecUnavailableError} When EDHREC cannot be reached
 */
export async function fetchTopCommanders(): Promise<CommanderSummary[]> {
	const commanders = await fetchRanking("/pages/commanders/year.json");

	if (commanders.length === 0) {
		throw new EdhrecUnavailableError("EDHREC returned no commanders.");
	}

	return commanders;
}

/**
 * Reads a commander ranking page, following the redirect that EDHREC answers
 * color requests with — /pages/commanders/wu.json says "/commanders/azorius"
 * rather than returning the list directly.
 *
 * @param path The ranking page to read
 * @returns The commanders it ranks, most played first
 */
async function fetchRanking(path: string): Promise<CommanderSummary[]> {
	let page = await fetchEdhrecJson<RankingPage>(path);

	if (page.redirect) {
		const slug = page.redirect.replace(/^\/commanders\//, "").replace(/\/$/, "");

		if (!slug || slug.includes("..")) {
			return [];
		}

		page = await fetchEdhrecJson<RankingPage>(`/pages/commanders/${slug}.json`);
	}

	return (page.container?.json_dict?.cardlists?.[0]?.cardviews ?? [])
		.map((view) => ({
			slug: view.sanitized ?? view.slug ?? "",
			name: view.name ?? "",
			scryfallId: view.id ?? "",
			numDecks: view.num_decks ?? 0,
		}))
		.filter((commander) => commander.slug && commander.name);
}

/** One extra ranking page that can be pulled in to widen the search. */
export type CommanderSource = {
	/** Color letters in WUBRG order, or "colorless". */
	key: string,
	/** What to call it in the UI, e.g. "Azorius" is described as "White, Blue". */
	label: string,
}

/** The five colors in the order Magic conventionally lists them. */
const COLOR_ORDER = ["W", "U", "B", "R", "G"];

/**
 * Puts a color identity into WUBRG order.
 *
 * Done here, where the deck is built, rather than in the component that draws
 * the tags: the order is a property of the data, not of one way of displaying
 * it, and sorting during render would mean mutating state in place.
 *
 * @param colors The identity as EDHREC gives it, in any order
 * @returns The same colors in WUBRG order, with anything unrecognized last
 */
function sortColorIdentity(colors: string[]): string[] {
	return [
		...COLOR_ORDER.filter((color) => colors.includes(color)),
		// Nothing outside WUBRG is expected, but dropping it silently would be
		// worse than showing it.
		...colors.filter((color) => !COLOR_ORDER.includes(color)),
	];
}

/** Full names, for describing a source without hardcoding EDHREC's guild names. */
const COLOR_NAMES: Record<string, string> = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" };

/**
 * Lists the extra ranking pages worth pulling in for a color selection.
 *
 * EDHREC's overall top 100 contains only a handful of, say, mono-white
 * commanders, so filtering it hard leaves very little. Its color pages rank
 * each exact color identity separately and go much deeper. A selection of
 * white therefore has two further sources — mono-white, and colorless, since
 * a colorless commander is buildable in any colors.
 *
 * Sources come back in the order they are worth fetching: the exact selection
 * first, then progressively smaller subsets, then colorless.
 *
 * @param colors The selected colors
 * @returns The sources, most relevant first
 */
export function colorSources(colors: string[]): CommanderSource[] {
	const selected = COLOR_ORDER.filter((color) => colors.includes(color));

	if (selected.length === 0) {
		return [];
	}

	const subsets: string[][] = [];

	// Every non-empty subset, via the bits of a counter.
	for (let mask = 1; mask < (1 << selected.length); mask++) {
		subsets.push(selected.filter((_, index) => mask & (1 << index)));
	}

	// Biggest first: those are the closest match to what was asked for.
	subsets.sort((left, right) => right.length - left.length);

	const sources = subsets.map((subset) => ({
		key: subset.join("").toLowerCase(),
		label: subset.map((color) => COLOR_NAMES[color]).join(", "),
	}));

	return [...sources, { key: "colorless", label: "Colorless" }];
}

/**
 * Reads one color ranking.
 *
 * @param source The source to read, from {@link colorSources}
 * @returns The commanders of exactly that color identity
 */
export function fetchColorRanking(source: CommanderSource): Promise<CommanderSummary[]> {
	return fetchRanking(`/pages/commanders/${source.key}.json`);
}

/**
 * Takes the most played cards from a set of EDHREC lists.
 *
 * @param lists Every list on the page, keyed by tag
 * @param tags Which lists to draw from
 * @param count How many cards the slot needs
 * @param taken Names already used by another slot, so nothing is counted twice
 * @returns The chosen card names
 */
function fillSlot(lists: Map<string, CardView[]>, tags: string[], count: number, taken: Set<string>): string[] {
	if (count <= 0) {
		return [];
	}

	const pool = tags
		.flatMap((tag) => lists.get(tag) ?? [])
		.filter((view): view is CardView & { name: string } => Boolean(view.name))
		// Basics are counted separately, from the page's own basic-land figure,
		// so they must never take a slot or reach the owned/missing lists.
		.filter((view) => !isBasicLand(view.name))
		// Most played first, so a slot is filled with the cards a deck is most
		// likely to actually contain.
		.sort((left, right) => (right.num_decks ?? 0) - (left.num_decks ?? 0));

	const chosen: string[] = [];

	for (const view of pool) {
		if (chosen.length >= count) {
			break;
		}

		if (taken.has(view.name)) {
			continue;
		}

		taken.add(view.name);
		chosen.push(view.name);
	}

	return chosen;
}

/**
 * Builds the average deck for one commander at one variant.
 *
 * EDHREC serves each bracket and price tier as its own page with an identical
 * shape, so the only difference between variants is the path — and the type
 * counts that come back, which is exactly the point: a cEDH average runs six
 * basic lands where an Exhibition average runs fifteen.
 *
 * @param slug EDHREC's slug for the commander, e.g. "atraxa-praetors-voice"
 * @param variant Which slice of EDHREC's decks to average
 * @returns The average deck
 * @throws {EdhrecUnavailableError} When EDHREC cannot be reached or the page is unusable
 */
export async function fetchAverageDeck(slug: string, variant: DeckVariant = "any"): Promise<AverageDeck> {
	const path = variant === "any"
		? `/pages/commanders/${slug}.json`
		: `/pages/commanders/${slug}/${variant}.json`;

	const page = await fetchEdhrecJson<CommanderPage>(path);
	const json = page.container?.json_dict;
	const commander = json?.card;

	if (!commander?.name) {
		throw new EdhrecUnavailableError(`EDHREC returned no commander card for "${slug}".`);
	}

	const lists = new Map<string, CardView[]>();

	for (const list of json?.cardlists ?? []) {
		if (list.tag) {
			lists.set(list.tag, list.cardviews ?? []);
		}
	}

	// The commander is the one card every deck definitely runs.
	const taken = new Set<string>([commander.name]);
	const cards = [commander.name];

	for (const slot of DECK_SLOTS) {
		const count = (page[slot.count] as number | undefined) ?? 0;
		cards.push(...fillSlot(lists, slot.tags, count, taken));
	}

	return {
		slug,
		name: commander.name,
		variant,
		artCrop: commander.image_uris?.[0]?.art_crop ?? "",
		edhrecUrl: `https://edhrec.com/commanders/${slug}`,
		colorIdentity: sortColorIdentity(commander.color_identity ?? []),
		numDecks: commander.num_decks ?? 0,
		basicLands: page.basic ?? 0,
		cards,
	};
}
