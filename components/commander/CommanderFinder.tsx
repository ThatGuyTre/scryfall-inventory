import {
	Alert,
	AlertIcon,
	Box,
	Button,
	ButtonGroup,
	Card,
	CardBody,
	CircularProgress,
	CircularProgressLabel,
	Heading,
	HStack,
	Image,
	Link,
	Radio,
	RadioGroup,
	Select,
	SimpleGrid,
	Spinner,
	Stack,
	Tag,
	Text,
	Wrap,
	WrapItem,
} from "@chakra-ui/react";
import { ChevronLeftIcon, ChevronRightIcon, ExternalLinkIcon, SearchIcon } from "@chakra-ui/icons";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { CommanderPool, fetchCommanderDecks } from "@/src/lib/inventory/api";
import { DeckCoverage, WELL_COVERED_THRESHOLD } from "@/src/lib/edhrec/coverage";
import { DECK_VARIANTS, DeckVariant } from "@/src/lib/edhrec/decks";
import { formatCount } from "@/components/inventory/format";

/**
 * Scores popular commander decks against the collection.
 *
 * The percentage is deliberately explained on screen rather than left to be
 * guessed at: it is the share of an average EDHREC deck for that commander,
 * basic lands excluded, that is already owned.
 *
 * Only the commanders on the current page are fetched from EDHREC. The color
 * filter narrows the ranking before any of that happens, so filtering costs
 * EDHREC nothing — the colors come from Scryfall.
 */

/** Commanders measured per page. Matches the API's own page size. */
const PAGE_SIZE = 48;

/** The five colors, with the badge each gets. */
const COLORS: { letter: string, name: string, scheme: string }[] = [
	{ letter: "W", name: "White", scheme: "yellow" },
	{ letter: "U", name: "Blue", scheme: "blue" },
	{ letter: "B", name: "Black", scheme: "purple" },
	{ letter: "R", name: "Red", scheme: "red" },
	{ letter: "G", name: "Green", scheme: "green" },
];

/** Color of the coverage dial, so a glance says roughly how close a deck is. */
function coverageColor(coverage: number): string {
	if (coverage >= WELL_COVERED_THRESHOLD) {
		return "green.400";
	}

	return coverage >= 30 ? "yellow.400" : "red.400";
}

/**
 * Names a deck variant for display.
 *
 * @param variant The variant to name
 * @returns Its label, e.g. "3 Upgraded"
 */
function variantLabel(variant: DeckVariant): string {
	return DECK_VARIANTS.find((entry) => entry.value === variant)?.label ?? variant;
}

export default function CommanderFinder() {
	const router = useRouter();

	const [ pool, setPool ] = useState<CommanderPool>("nodeck");
	const [ variant, setVariant ] = useState<DeckVariant>("any");
	const [ colors, setColors ] = useState<string[]>([]);
	const [ page, setPage ] = useState<number>(1);

	/*
		How many of EDHREC's per-color rankings to fold into the candidate
		pool. Starts at nothing — the overall top 100 — and grows a step at a
		time when the user asks for more, because each step is another request
		to EDHREC.
	*/
	const [ depth, setDepth ] = useState<number>(0);

	const [ decks, setDecks ] = useState<DeckCoverage[]>([]);
	const [ cardsInPool, setCardsInPool ] = useState<number>(0);
	const [ pageCount, setPageCount ] = useState<number>(1);
	const [ matching, setMatching ] = useState<number>(0);
	const [ total, setTotal ] = useState<number>(0);
	const [ nextSource, setNextSource ] = useState<string | null>(null);
	const [ isWidening, setIsWidening ] = useState<boolean>(false);
	const [ expanded, setExpanded ] = useState<string | null>(null);
	const [ isLoading, setIsLoading ] = useState<boolean>(true);
	const [ error, setError ] = useState<string | null>(null);

	// The color list is rebuilt on every render, so it is joined into a string
	// for the dependency list; an array would re-run this effect endlessly.
	const colorKey = colors.join("");

	// Re-scores whenever anything about the query changes. Changing the query
	// mid-request aborts the old one, so a slow answer cannot overwrite a
	// newer choice.
	useEffect(() => {
		const controller = new AbortController();

		async function load() {
			setIsLoading(true);
			setError(null);

			/*
				Clear the previous results rather than leaving them on screen
				under the spinner. Switching bracket re-measures every deck, so
				the old percentages describe a different question and reading
				them while the new ones load is misleading. An expanded card
				belongs to the old measurement too.
			*/
			setDecks([]);
			setExpanded(null);

			try {
				const response = await fetchCommanderDecks(
					{ pool, variant, colors: colorKey.split("").filter(Boolean), page, limit: PAGE_SIZE, depth },
					controller.signal,
				);

				setDecks(response.decks);
				setCardsInPool(response.cardsInPool);
				setPageCount(response.pageCount);
				setMatching(response.matchingCommanders);
				setTotal(response.totalCommanders);
				setNextSource(response.nextSource);

				// The server clamps the page to what the filter actually has.
				if (response.page !== page) {
					setPage(response.page);
				}
			} catch (caught) {
				if (!controller.signal.aborted) {
					setDecks([]);
					setError(caught instanceof Error ? caught.message : "Could not score any decks.");
				}
			} finally {
				if (!controller.signal.aborted) {
					setIsLoading(false);
					setIsWidening(false);
				}
			}
		}

		load();

		return () => controller.abort();
	}, [pool, variant, colorKey, page, depth]);

	/**
	 * Turns one color on or off, returning to the first page because the
	 * ranking underneath has changed.
	 *
	 * @param letter The color letter, e.g. "U"
	 */
	function toggleColor(letter: string) {
		setColors((current) => (
			current.includes(letter)
				? current.filter((color) => color !== letter)
				: [...current, letter]
		));
		setPage(1);
		// The extra rankings were chosen for the old colors, so start over.
		setDepth(0);
	}

	/**
	 * Pulls in one more of EDHREC's color rankings, which is one or two
	 * further requests to them.
	 */
	function widenSearch() {
		setIsWidening(true);
		setPage(1);
		setDepth((current) => current + 1);
	}

	/**
	 * Renders the invitation to widen the search as another card in the grid.
	 *
	 * It mirrors the shape of a scored deck — art band, title, tags, dial, a
	 * button in the same place — so the grid keeps its rhythm and the card
	 * reads as "one more result you could have" rather than as a stray control.
	 *
	 * @returns The card, or null when there is nothing left to widen with
	 */
	function renderWidenCard() {
		if (!nextSource) {
			return null;
		}

		return (
			<Card
				key="widen"
				background="offWhite"
				borderRadius={5}
				overflow="hidden"
				borderWidth="2px"
				borderStyle="dashed"
				borderColor="desaturatedGreen"
				_hover={{ boxShadow: "0 0 0 3px #74b87d", transition: "box-shadow 0.2s ease-in-out" }}
			>
				{/* Stands in for the commander art, keeping the card the same height. */}
				<Box
					width="100%"
					height={{ base: "110px", md: "130px" }}
					background="desaturatedGreen"
					display="flex"
					alignItems="center"
					justifyContent="center"
				>
					<SearchIcon boxSize={8} color="offWhite" />
				</Box>

				<CardBody px={{ base: 3, md: 5 }}>
					<Stack spacing={3}>

						<Box>
							<Heading size="sm" color="gray" noOfLines={2}>More {nextSource} commanders</Heading>
							<Wrap spacing={1} mt={2}>
								<WrapItem><Tag size="sm" colorScheme="green">{nextSource}</Tag></WrapItem>
								<WrapItem><Tag size="sm" colorScheme="gray">Not yet searched</Tag></WrapItem>
							</Wrap>
						</Box>

						<HStack spacing={3} align="center">
							<CircularProgress
								value={100}
								size="68px"
								thickness="10px"
								color="desaturatedGreen"
								trackColor="lightGray"
								capIsRound
								isIndeterminate={isWidening}
								aria-label="Widen the search"
							>
								<CircularProgressLabel fontWeight="bold" color="gray" fontSize="xl">
									+
								</CircularProgressLabel>
							</CircularProgress>

							<Box>
								<Text color="gray" fontSize="sm" fontWeight="bold">
									{formatCount(matching)} found so far
								</Text>
								<Text color="darkGreen" fontSize="xs">
									EDHREC ranks each color identity separately.
								</Text>
							</Box>
						</HStack>

						<Stack direction={{ base: "column", sm: "row" }} spacing={2}>
							<Button
								size="sm"
								colorScheme="green"
								isLoading={isWidening}
								loadingText="Asking EDHREC"
								onClick={widenSearch}
							>
								Find more
							</Button>
						</Stack>

					</Stack>
				</CardBody>
			</Card>
		);
	}

	/**
	 * Renders a list of card names as separate chips rather than one run-on
	 * sentence — fifty comma separated names is unreadable, and a chip per card
	 * can be scanned. Each one links to that card on Scryfall.
	 *
	 * @param heading What the list is, e.g. "Missing (34)"
	 * @param names The names to show, already capped by the API
	 * @param total How many there are in total, which may exceed names.length
	 * @param scheme Chip colour scheme
	 * @param emptyMessage What to say when there are none
	 * @returns The block
	 */
	function renderCardList(heading: string, names: string[], scheme: string, emptyMessage: string) {
		return (
			<Box>
				<Text fontWeight="bold" color="gray" fontSize="sm" mb={2}>{heading}</Text>

				{names.length === 0 ? (
					<Text color="darkGreen" fontSize="sm">{emptyMessage}</Text>
				) : (
					<Wrap spacing={1}>
						{names.map((name) => (
							<WrapItem key={name}>
								<Tag
									as={Link}
									href={`https://scryfall.com/search?q=${encodeURIComponent(`!"${name}"`)}`}
									isExternal
									size="sm"
									variant="subtle"
									colorScheme={scheme}
									_hover={{ textDecoration: "none", filter: "brightness(0.94)" }}
								>
									{name}
								</Tag>
							</WrapItem>
						))}
					</Wrap>
				)}
			</Box>
		);
	}

	/**
	 * Renders one scored deck.
	 *
	 * @param deck The deck to render
	 * @returns The card
	 */
	function renderDeck(deck: DeckCoverage) {
		const isExpanded = expanded === deck.slug;

		return (
			<Card key={deck.slug} background="offWhite" borderRadius={5} overflow="hidden">
				{deck.artCrop ? (
					<Image
						src={deck.artCrop}
						alt={deck.name}
						width="100%"
						height={{ base: "110px", md: "130px" }}
						objectFit="cover"
					/>
				) : null}

				<CardBody px={{ base: 3, md: 5 }}>
					<Stack spacing={3}>

						<Box>
							<Heading size="sm" color="gray" noOfLines={2}>{deck.name}</Heading>
							<Wrap spacing={1} mt={2}>
								{/*
									Says which average this score is against, so
									a card is still self-explanatory once it has
									been scrolled away from the selector.
								*/}
								<WrapItem>
									<Tag size="sm" variant="outline" colorScheme="gray">
										{variantLabel(deck.variant)}
									</Tag>
								</WrapItem>
								{deck.colorIdentity.map((color) => (
									<WrapItem key={color}>
										<Tag size="sm" colorScheme={COLORS.find((c) => c.letter === color)?.scheme ?? "gray"}>
											{color}
										</Tag>
									</WrapItem>
								))}
								{deck.ownsCommander ? (
									<WrapItem><Tag size="sm" colorScheme="purple">Commander Owned</Tag></WrapItem>
								) : (
									<WrapItem><Tag size="sm" colorScheme="orange">Commander Not Owned</Tag></WrapItem>
								)}
							</Wrap>
						</Box>

						{/*
							The dial carries the percentage inside it, which
							puts the headline number and its bar in the space
							the bar alone used to take.
						*/}
						<HStack spacing={3} align="center">
							<CircularProgress
								value={deck.coverage}
								size="69px"
								thickness="10px"
								color={coverageColor(deck.coverage)}
								trackColor="lightGray"
								capIsRound
								aria-label={`${deck.coverage} percent of this deck is owned`}
							>
								<CircularProgressLabel fontWeight="bold" color="gray" fontSize="md">
									{deck.coverage}%
								</CircularProgressLabel>
							</CircularProgress>

							<Box>
								<Text color="gray" fontSize="sm" fontWeight="bold">
									{formatCount(deck.ownedCount)} of {formatCount(deck.consideredCards)} cards
								</Text>
								<Text color="darkGreen" fontSize="xs">
									{formatCount(deck.basicLands)} basic lands not counted
								</Text>
							</Box>
						</HStack>

						<Stack direction={{ base: "column", sm: "row" }} spacing={2}>
							<Button
								size="sm"
								variant="outline"
								borderColor="desaturatedGreen"
								onClick={() => setExpanded(isExpanded ? null : deck.slug)}
							>
								{isExpanded ? "Hide cards" : "What am I missing?"}
							</Button>
							<Button
								as={Link}
								href={deck.edhrecUrl}
								isExternal
								size="sm"
								variant="ghost"
								color="darkGreen"
								rightIcon={<ExternalLinkIcon />}
							>
								EDHREC
							</Button>
						</Stack>

						{isExpanded ? (
							<Stack spacing={3}>
								{renderCardList(
									`Missing (${formatCount(deck.consideredCards - deck.ownedCount)})`,
									deck.missing,
									"red",
									"Nothing — you can build this.",
								)}
								{renderCardList(
									`Already owned (${formatCount(deck.ownedCount)})`,
									deck.owned,
									"green",
									"None yet.",
								)}
							</Stack>
						) : null}

					</Stack>
				</CardBody>
			</Card>
		);
	}

	return (
		<Box maxW="1600px" m="auto" px={{ base: 3, md: "1vh" }} py={{ base: 4, md: "4vh" }}>
			<Stack spacing={{ base: 4, md: 6 }}>

				<Box>
					<Heading size={{ base: "md", md: "lg" }} color="gray">Find a Commander Deck</Heading>
					<Text color="darkGreen" mt={2}>
						EDHREC&apos;s most played commanders, scored against your collection. The percentage
						is the share of an average deck for that commander that you already own — basic
						lands excluded, since everyone has those.
					</Text>
				</Box>

				<Card background="offWhite" borderRadius={5}>
					<CardBody px={{ base: 3, md: 5 }}>
						<Stack spacing={5}>

							<Box>
								<Text fontWeight="bold" color="gray" mb={2}>Which cards may these decks use?</Text>
								<RadioGroup
									value={pool}
									onChange={(next) => {
										setPool(next as CommanderPool);
										setPage(1);
									}}
								>
									<Stack direction={{ base: "column", md: "row" }} spacing={{ base: 3, md: 8 }}>
										<Radio value="nodeck" colorScheme="green" alignItems="flex-start">
											<Text color="gray" fontWeight="bold">Only cards not in a deck</Text>
											<Text fontSize="sm" color="darkGreen">
												{"Don't worry about taking any decks apart."}
											</Text>
										</Radio>
										<Radio value="all" colorScheme="green" alignItems="flex-start">
											<Text color="gray" fontWeight="bold">Entire collection</Text>
											<Text fontSize="sm" color="darkGreen">
												Every card you own, including cards already sleeved into a deck.
											</Text>
										</Radio>
									</Stack>
								</RadioGroup>
							</Box>

							<Stack direction={{ base: "column", lg: "row" }} spacing={5}>

								<Box>
									<Text fontWeight="bold" color="gray" mb={2}>Deck variant</Text>
									<Select
										value={variant}
										onChange={(event) => {
											setVariant(event.target.value as DeckVariant);
											setPage(1);
										}}
										maxW={{ base: "100%", lg: "220px" }}
										background="white"
										borderColor="desaturatedGreen"
										aria-label="Which bracket or price tier to measure"
									>
										{DECK_VARIANTS.map((entry) => (
											<option key={entry.value} value={entry.value}>{entry.label}</option>
										))}
									</Select>
								</Box>

								<Box>
									<Text fontWeight="bold" color="gray" mb={2}>Commander Color Identity</Text>
									<Wrap spacing={2}>
										{COLORS.map((color) => {
											const isOn = colors.includes(color.letter);

											return (
												<WrapItem key={color.letter}>
													<Button
														size="sm"
														minW="72px"
														colorScheme={isOn ? color.scheme : "gray"}
														variant={isOn ? "solid" : "outline"}
														borderColor="desaturatedGreen"
														aria-pressed={isOn}
														onClick={() => toggleColor(color.letter)}
													>
														{color.name}
													</Button>
												</WrapItem>
											);
										})}
										{colors.length > 0 ? (
											<WrapItem>
												<Button size="sm" variant="ghost" color="darkGreen" onClick={() => { setColors([]); setPage(1); setDepth(0); }}>
													Clear
												</Button>
											</WrapItem>
										) : null}
									</Wrap>
									<Text fontSize="sm" color="darkGreen" mt={2}>
										{colors.length === 0
											? "No filter — every commander is considered."
											: "Shows commanders whose color identity fits inside your choice."}
									</Text>
								</Box>

							</Stack>

							{!isLoading && !error ? (
								<Text fontSize="sm" color="darkGreen">
									Building from {formatCount(cardsInPool)} card{cardsInPool === 1 ? "" : "s"}
									{" · "}
									{formatCount(matching)} of {formatCount(total)} commanders considered
									{" · "}
									measuring the {variantLabel(variant)} average
								</Text>
							) : null}

						</Stack>
					</CardBody>
				</Card>

				{error ? (
					<Alert status="error" borderRadius={5}>
						<AlertIcon />
						{error}
					</Alert>
				) : null}

				{isLoading ? (
					<HStack justify="center" py={10}>
						<Spinner color="desaturatedGreen" />
						<Heading color="gray" size="lg">Asking EDHREC...</Heading>
					</HStack>
				) : null}

				{!isLoading && !error && cardsInPool === 0 ? (
					<Card background="offWhite" borderRadius={5}>
						<CardBody>
							<Stack spacing={3} align="flex-start">
								<Heading size="md" color="gray">
									{pool === "nodeck" ? "Every card you own is already in a deck." : "Your collection is empty."}
								</Heading>
								<Text color="darkGreen">
									{pool === "nodeck"
										? "Switch to your whole collection, or import cards that are not filed under a deck."
										: "Import a ManaBox .csv export and these decks will be scored against it."}
								</Text>
								<Button colorScheme="green" onClick={() => router.push("/import")}>
									Import from ManaBox
								</Button>
							</Stack>
						</CardBody>
					</Card>
				) : null}

				{!isLoading && !error && matching === 0 && cardsInPool > 0 ? (
					<Alert status="info" borderRadius={5}>
						<AlertIcon />
						No commander in EDHREC&apos;s top {formatCount(total)} fits inside those colors. Try adding a color.
					</Alert>
				) : null}

				{decks.length > 0 ? (
					<>
						<SimpleGrid columns={{ base: 1, sm: 2, lg: 3, xl: 4 }} spacing={4}>
							{decks.map(renderDeck)}
							{/* Sits on the last page, where the results run out. */}
							{page >= pageCount ? renderWidenCard() : null}
						</SimpleGrid>

						<Stack direction={{ base: "column", sm: "row" }} justify="center" align="center" spacing={3}>
							<ButtonGroup isAttached variant="outline">
								<Button
									borderColor="desaturatedGreen"
									leftIcon={<ChevronLeftIcon />}
									isDisabled={page <= 1 || isLoading}
									onClick={() => setPage((current) => Math.max(1, current - 1))}
								>
									Previous
								</Button>
								<Button
									borderColor="desaturatedGreen"
									rightIcon={<ChevronRightIcon />}
									isDisabled={page >= pageCount || isLoading}
									onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
								>
									Next
								</Button>
							</ButtonGroup>
							<Text color="darkGreen" fontSize="sm">
								Page {formatCount(page)} of {formatCount(pageCount)}
							</Text>
						</Stack>
					</>
				) : null}

			</Stack>
		</Box>
	);
}
