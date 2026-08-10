import {
	Alert,
	AlertIcon,
	Badge,
	Box,
	Button,
	Card,
	CardBody,
	Heading,
	HStack,
	Input,
	InputGroup,
	InputLeftElement,
	Select,
	Spinner,
	Stack,
	StatGroup,
	Table,
	TableContainer,
	Tbody,
	Td,
	Text,
	Th,
	Thead,
	Tr,
} from "@chakra-ui/react";
import { SearchIcon } from "@chakra-ui/icons";
import { useRouter } from "next/router";
import { useCallback, useEffect, useState } from "react";
import { clearInventory, fetchInventoryLocations, fetchInventoryPage } from "@/src/lib/inventory/api";
import { InventoryCard, InventoryLocation, InventoryStats, UNASSIGNED_LOCATION_KIND } from "@/src/lib/inventory/types";
import ImportStat from "./ImportStat";
import { formatCount, formatTimestamp, locationColorScheme, locationLabel, titleCase } from "./format";

/**
 * Browses whatever has been imported from ManaBox.
 *
 * Rows are paged rather than loaded whole: a real collection runs to tens of
 * thousands of rows, and the page cursor is the same one a hosted database
 * would hand back, so this screen does not change when the storage does.
 *
 * The chosen deck or binder lives in the URL, so a filtered view can be linked
 * to — which is how the deck page opens a single deck.
 */

/** Rows fetched per request. */
const PAGE_SIZE = 50;

/** How long to wait after the last keystroke before searching. */
const SEARCH_DEBOUNCE_MS = 300;

/** Marks a filter value as "every location of this kind" rather than one location. */
const KIND_PREFIX = "kind:";

/**
 * Names a whole-kind filter, e.g. "deck" becomes "Just in decks".
 *
 * @param kind The location kind
 * @returns The option label
 */
function kindFilterLabel(kind: string): string {
	if (kind === UNASSIGNED_LOCATION_KIND) {
		return "Just unassigned";
	}

	return `Just in ${titleCase(kind).toLowerCase()}s`;
}

/**
 * Names the group a kind's individual locations sit under, e.g. "Decks".
 *
 * @param kind The location kind
 * @returns The group label
 */
function kindGroupLabel(kind: string): string {
	if (kind === UNASSIGNED_LOCATION_KIND) {
		return "Unassigned";
	}

	return `${titleCase(kind)}s`;
}

export default function InventoryBrowser() {
	const router = useRouter();

	const [ search, setSearch ] = useState<string>("");
	const [ appliedSearch, setAppliedSearch ] = useState<string>("");
	const [ filterOverride, setFilterOverride ] = useState<string | null>(null);
	const [ locations, setLocations ] = useState<InventoryLocation[]>([]);
	const [ cards, setCards ] = useState<InventoryCard[]>([]);
	const [ stats, setStats ] = useState<InventoryStats | null>(null);
	const [ nextCursor, setNextCursor ] = useState<string | null>(null);
	const [ isLoading, setIsLoading ] = useState<boolean>(true);
	const [ isLoadingMore, setIsLoadingMore ] = useState<boolean>(false);
	const [ isClearing, setIsClearing ] = useState<boolean>(false);
	const [ confirmingClear, setConfirmingClear ] = useState<boolean>(false);
	const [ error, setError ] = useState<string | null>(null);

	/*
		The filter is read from the query string rather than copied into state
		on mount. Copying it would mean writing state from an effect, and the
		first render would briefly show the unfiltered list.

		One select drives two different filters, so its value is encoded: a
		"kind:" prefix means every location of that kind, anything else is a
		single location's key. Location keys are lowercase alphanumerics and
		"#", so the prefix can never collide with one.
	*/
	const queryFilter = !router.isReady
		? ""
		: typeof router.query.kind === "string" && router.query.kind
			? `${KIND_PREFIX}${router.query.kind}`
			: typeof router.query.location === "string" ? router.query.location : "";

	const filter = filterOverride ?? queryFilter;
	const isKindFilter = filter.startsWith(KIND_PREFIX);
	const locationKind = isKindFilter ? filter.slice(KIND_PREFIX.length) : "";
	const locationKey = isKindFilter ? "" : filter;

	// Typing should not fire a request per keystroke, so the term that is
	// actually sent lags the input box by a moment.
	useEffect(() => {
		const timer = setTimeout(() => setAppliedSearch(search.trim()), SEARCH_DEBOUNCE_MS);

		return () => clearTimeout(timer);
	}, [search]);

	// Reloads the first page whenever the search term or the filter changes.
	// The abort signal drops the response of a search the user has moved past,
	// so a slow early request cannot overwrite a fast later one.
	useEffect(() => {
		if (!router.isReady) {
			return;
		}

		const controller = new AbortController();

		async function load() {
			setIsLoading(true);
			setError(null);

			try {
				const page = await fetchInventoryPage(
					{ search: appliedSearch, locationKey, locationKind, limit: PAGE_SIZE },
					controller.signal,
				);

				setCards(page.items);
				setNextCursor(page.nextCursor);
				setStats(page.stats);
			} catch (caught) {
				if (!controller.signal.aborted) {
					setError(caught instanceof Error ? caught.message : "Could not load the inventory.");
				}
			} finally {
				if (!controller.signal.aborted) {
					setIsLoading(false);
				}
			}
		}

		load();

		return () => controller.abort();
	}, [appliedSearch, locationKey, locationKind, router.isReady]);

	// The list of decks and binders only changes on import or clear, so it is
	// refreshed alongside the stats rather than on every keystroke.
	useEffect(() => {
		const controller = new AbortController();

		fetchInventoryLocations(controller.signal)
			.then(setLocations)
			.catch(() => {
				// The filter is a convenience; losing it is not worth an error
				// banner over the cards the user actually came to see.
			});

		return () => controller.abort();
	}, [stats?.uniqueCards, stats?.lastUpdated]);

	/**
	 * Applies a location filter and records it in the URL, so a filtered view
	 * can be linked to — which is how My Binders opens a single deck.
	 *
	 * @param next A location key, a "kind:" value, or "" for everything
	 */
	function changeFilter(next: string) {
		setFilterOverride(next);

		const query = { ...router.query };

		delete query.location;
		delete query.kind;

		if (next.startsWith(KIND_PREFIX)) {
			query.kind = next.slice(KIND_PREFIX.length);
		} else if (next) {
			query.location = next;
		}

		router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
	}

	/**
	 * Appends the next page of results to the table.
	 */
	const loadMore = useCallback(async () => {
		if (!nextCursor || isLoadingMore) {
			return;
		}

		setIsLoadingMore(true);

		try {
			const page = await fetchInventoryPage({
				search: appliedSearch,
				locationKey,
				locationKind,
				limit: PAGE_SIZE,
				cursor: nextCursor,
			});

			setCards((previous) => [...previous, ...page.items]);
			setNextCursor(page.nextCursor);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Could not load more cards.");
		} finally {
			setIsLoadingMore(false);
		}
	}, [appliedSearch, isLoadingMore, locationKey, locationKind, nextCursor]);

	/**
	 * Empties the inventory, asking for a second click first.
	 */
	async function handleClear() {
		if (!confirmingClear) {
			setConfirmingClear(true);
			return;
		}

		setIsClearing(true);
		setConfirmingClear(false);
		setError(null);

		try {
			const response = await clearInventory();

			setCards([]);
			setNextCursor(null);
			setStats(response.stats);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Could not clear the inventory.");
		} finally {
			setIsClearing(false);
		}
	}

	const isEmpty = !isLoading && cards.length === 0;
	const isFiltered = Boolean(appliedSearch || filter);

	/*
		The filter list is derived from the locations rather than held in state,
		so it cannot fall out of step with them. Decks lead, then binders, then
		whatever else, with unfiled cards last.
	*/
	const locationsByKind = new Map<string, InventoryLocation[]>();
	const quantityByKind = new Map<string, number>();

	for (const location of locations) {
		const kind = location.kind.toLowerCase();
		locationsByKind.set(kind, [...(locationsByKind.get(kind) ?? []), location]);
		quantityByKind.set(kind, (quantityByKind.get(kind) ?? 0) + location.totalQuantity);
	}

	const KIND_ORDER = ["deck", "binder", "list", "box"];

	const orderedKinds = [...locationsByKind.keys()].sort((left, right) => {
		const leftRank = KIND_ORDER.indexOf(left);
		const rightRank = KIND_ORDER.indexOf(right);

		// Unfiled cards sit at the end; unknown kinds just before them.
		const rank = (kind: string, index: number) => (
			kind === UNASSIGNED_LOCATION_KIND ? 99 : index === -1 ? 98 : index
		);

		return rank(left, leftRank) - rank(right, rightRank) || left.localeCompare(right);
	});

	const kindsWorthGrouping = orderedKinds.filter((kind) => (locationsByKind.get(kind) ?? []).length > 1);

	return (
		<Box maxW="1600px" m="auto" px={{ base: 3, md: "1vh" }} py={{ base: 4, md: "4vh" }}>
			<Stack spacing={{ base: 4, md: 6 }}>

				{/* Stacks on a phone so the buttons never squeeze the heading. */}
				<Stack direction={{ base: "column", md: "row" }} justify="space-between" align={{ base: "stretch", md: "flex-start" }} spacing={3}>
					<Heading size={{ base: "md", md: "lg" }} color="gray">Your Inventory</Heading>
					<Stack direction={{ base: "column", sm: "row" }} spacing={2}>
						<Button colorScheme="green" onClick={() => router.push("/importfrommanabox")}>
							Import from ManaBox
						</Button>
						<Button
							variant="outline"
							colorScheme="red"
							isLoading={isClearing}
							isDisabled={!stats || stats.uniqueCards === 0}
							onClick={handleClear}
						>
							{confirmingClear ? "Click again to confirm" : "Clear inventory"}
						</Button>
					</Stack>
				</Stack>

				{stats ? (
					<Card background="offWhite" borderRadius={5}>
						<CardBody px={{ base: 3, md: 5 }}>
							{/* flexWrap lets the figures fall onto a second line rather than shrink to nothing. */}
							<StatGroup flexWrap="wrap" gap={4}>
								<ImportStat label="Unique cards" value={formatCount(stats.uniqueCards)} />
								<ImportStat label="Cards held" value={formatCount(stats.totalQuantity)} />
								<ImportStat label="Sets" value={formatCount(stats.setCount)} />
								<ImportStat label="Decks & binders" value={formatCount(stats.locationCount)} />
								<ImportStat label="Last import" value={formatTimestamp(stats.lastUpdated)} />
							</StatGroup>
						</CardBody>
					</Card>
				) : null}

				<Stack direction={{ base: "column", md: "row" }} spacing={3}>
					<InputGroup maxW={{ base: "100%", md: "480px" }}>
						<InputLeftElement pointerEvents="none">
							<SearchIcon color="desaturatedGreen" />
						</InputLeftElement>
						<Input
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							placeholder="Search by name, set or collector number"
							background="offWhite"
							borderColor="desaturatedGreen"
							_focusVisible={{ borderColor: "darkGreen", boxShadow: "0 0 0 1px #2d6a4f" }}
						/>
					</InputGroup>

					<Select
						maxW={{ base: "100%", md: "340px" }}
						value={filter}
						onChange={(event) => changeFilter(event.target.value)}
						background="offWhite"
						borderColor="desaturatedGreen"
						_focusVisible={{ borderColor: "darkGreen", boxShadow: "0 0 0 1px #2d6a4f" }}
						aria-label="Filter by deck or binder"
					>
						<option value="">Everywhere</option>

						{/*
							Whole-kind options come first, then each individual
							place grouped under its kind. A kind only earns a
							"just in these" entry once there are two or more of
							them to group; with one deck, picking the deck is
							the same thing.
						*/}
						{kindsWorthGrouping.length > 0 ? (
							<optgroup label="By kind">
								{kindsWorthGrouping.map((kind) => (
									<option key={kind} value={`${KIND_PREFIX}${kind}`}>
										{kindFilterLabel(kind)} ({formatCount(quantityByKind.get(kind) ?? 0)})
									</option>
								))}
							</optgroup>
						) : null}

						{orderedKinds.map((kind) => (
							<optgroup key={kind} label={kindGroupLabel(kind)}>
								{(locationsByKind.get(kind) ?? []).map((location) => (
									<option key={location.key} value={location.key}>
										{locationLabel(location.kind, location.name)} ({formatCount(location.totalQuantity)})
									</option>
								))}
							</optgroup>
						))}
					</Select>
				</Stack>

				{error ? (
					<Alert status="error" borderRadius={5}>
						<AlertIcon />
						{error}
					</Alert>
				) : null}

				{isLoading ? (
					<HStack justify="center" py={10}>
						<Spinner color="desaturatedGreen" />
						<Heading color="gray" size="lg">Loading...</Heading>
					</HStack>
				) : null}

				{isEmpty ? (
					<Card background="offWhite" borderRadius={5}>
						<CardBody>
							<Stack spacing={3} align="flex-start">
								<Heading size="md" color="gray">
									{isFiltered ? "No cards match that." : "Nothing here yet."}
								</Heading>
								<Text color="darkGreen">
									{isFiltered
										? "Try a different name, set code, collector number or deck."
										: "Import a ManaBox .csv export to fill your inventory."}
								</Text>
								{isFiltered ? null : (
									<Button colorScheme="green" onClick={() => router.push("/importfrommanabox")}>
										Import from ManaBox
									</Button>
								)}
							</Stack>
						</CardBody>
					</Card>
				) : null}

				{cards.length > 0 ? (
					/*
						Eight columns will not fit on a phone. The ones that
						identify a card stay at every width; rarity, condition
						and language appear as the screen grows. TableContainer
						scrolls sideways if even that is too much.
					*/
					<TableContainer background="offWhite" borderRadius={5}>
						<Table size="sm" variant="simple">
							<Thead>
								<Tr>
									<Th color="darkGreen" isNumeric>Qty</Th>
									<Th color="darkGreen">Name</Th>
									<Th color="darkGreen">Location</Th>
									<Th color="darkGreen">Set</Th>
									<Th color="darkGreen" isNumeric display={{ base: "none", sm: "table-cell" }}>No.</Th>
									<Th color="darkGreen">Finish</Th>
									<Th color="darkGreen" display={{ base: "none", lg: "table-cell" }}>Rarity</Th>
									<Th color="darkGreen" display={{ base: "none", md: "table-cell" }}>Condition</Th>
									<Th color="darkGreen" display={{ base: "none", lg: "table-cell" }}>Language</Th>
								</Tr>
							</Thead>
							<Tbody>
								{cards.map((card) => (
									<Tr
										key={card.id}
										_hover={{
											background: "#c5d8df",
											transition: "background 0.2s ease-in-out",
										}}
									>
										<Td isNumeric fontWeight="bold" color="gray">{card.quantity}</Td>
										<Td color="gray" whiteSpace="normal" minW="180px">
											{card.name}
											{card.altered ? <Badge ml={2} colorScheme="purple">Altered</Badge> : null}
											{card.misprint ? <Badge ml={2} colorScheme="orange">Misprint</Badge> : null}
										</Td>
										<Td whiteSpace="normal">
											<Badge colorScheme={locationColorScheme(card.locationKind)}>
												{locationLabel(card.locationKind, card.locationName)}
											</Badge>
										</Td>
										<Td color="darkGreen" whiteSpace="normal">
											{card.setCode || "—"}
											{card.setName ? (
												<Text as="span" color="gray" fontSize="xs" display={{ base: "none", xl: "inline" }}> · {card.setName}</Text>
											) : null}
										</Td>
										<Td isNumeric color="darkGreen" display={{ base: "none", sm: "table-cell" }}>{card.collectorNumber || "—"}</Td>
										<Td>
											{card.finish === "normal" ? (
												<Text color="darkGreen">Normal</Text>
											) : (
												<Badge colorScheme={card.finish === "foil" ? "green" : "teal"}>
													{titleCase(card.finish)}
												</Badge>
											)}
										</Td>
										<Td color="darkGreen" display={{ base: "none", lg: "table-cell" }}>{titleCase(card.rarity)}</Td>
										<Td color="darkGreen" display={{ base: "none", md: "table-cell" }}>{titleCase(card.condition)}</Td>
										<Td color="darkGreen" display={{ base: "none", lg: "table-cell" }}>{card.language.toUpperCase()}</Td>
									</Tr>
								))}
							</Tbody>
						</Table>
					</TableContainer>
				) : null}

				{nextCursor ? (
					<Button
						alignSelf="center"
						variant="outline"
						borderColor="desaturatedGreen"
						isLoading={isLoadingMore}
						loadingText="Loading"
						onClick={loadMore}
					>
						Load more
					</Button>
				) : null}

			</Stack>
		</Box>
	);
}
