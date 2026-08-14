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
	SimpleGrid,
	Spinner,
	Stack,
	Text,
} from "@chakra-ui/react";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { fetchInventoryLocations } from "@/src/lib/inventory/api";
import { InventoryLocation } from "@/src/lib/inventory/types";
import { formatCount, locationColorScheme, locationLabel, titleCase } from "./format";

/**
 * Lists the decks that exist in the collection.
 *
 * A deck is not a separate thing to create here — it is any location whose kind
 * is "deck", which comes either from the Binder Type column of a ManaBox export
 * or from the location chosen on the import form. Everywhere else cards are
 * kept is listed underneath, so a binder that should have been a deck is
 * visible rather than silently missing.
 */

/** The size a Commander deck is measured against. */
const COMMANDER_DECK_SIZE = 100;

export default function DeckList() {
	const router = useRouter();

	const [ locations, setLocations ] = useState<InventoryLocation[]>([]);
	const [ isLoading, setIsLoading ] = useState<boolean>(true);
	const [ error, setError ] = useState<string | null>(null);

	useEffect(() => {
		const controller = new AbortController();

		async function load() {
			setIsLoading(true);
			setError(null);

			try {
				setLocations(await fetchInventoryLocations(controller.signal));
			} catch (caught) {
				if (!controller.signal.aborted) {
					setError(caught instanceof Error ? caught.message : "Could not load your decks.");
				}
			} finally {
				if (!controller.signal.aborted) {
					setIsLoading(false);
				}
			}
		}

		load();

		return () => controller.abort();
	}, []);

	const decks = locations.filter((location) => location.kind.toLowerCase() === "deck");
	const others = locations.filter((location) => location.kind.toLowerCase() !== "deck");

	/**
	 * Opens the inventory filtered to one deck or binder.
	 *
	 * @param location The place to show
	 */
	function viewLocation(location: InventoryLocation) {
		router.push(`/inventory?location=${encodeURIComponent(location.key)}`);
	}

	/**
	 * Renders one location as a card.
	 *
	 * @param location The place to render
	 * @returns The card
	 */
	function renderLocation(location: InventoryLocation) {
		const percentBuilt = Math.min(100, Math.round((location.totalQuantity / COMMANDER_DECK_SIZE) * 100));

		return (
			<Card key={location.key} background="offWhite" borderRadius={5}>
				<CardBody px={{ base: 3, md: 5 }}>
					<Stack spacing={3} height="100%">
						<HStack flexWrap="wrap" spacing={2}>
							<Heading size="sm" color="gray" noOfLines={2}>
								{locationLabel(location.kind, location.name)}
							</Heading>
							<Badge colorScheme={locationColorScheme(location.kind)}>
								{titleCase(location.kind)}
							</Badge>
						</HStack>

						<Text color="darkGreen" fontSize="sm">
							{formatCount(location.totalQuantity)} card{location.totalQuantity === 1 ? "" : "s"}
							{" · "}
							{formatCount(location.uniqueCards)} unique
							{location.kind.toLowerCase() === "deck" ? ` · ${percentBuilt}% of 100` : ""}
						</Text>

						<Button
							size="sm"
							alignSelf="flex-start"
							variant="outline"
							borderColor="desaturatedGreen"
							onClick={() => viewLocation(location)}
						>
							View cards
						</Button>
					</Stack>
				</CardBody>
			</Card>
		);
	}

	return (
		<Box maxW="1400px" m="auto" px={{ base: 3, md: "1vh" }} py={{ base: 4, md: "4vh" }}>
			<Stack spacing={{ base: 4, md: 6 }}>

				<Stack direction={{ base: "column", md: "row" }} justify="space-between" align={{ base: "stretch", md: "center" }} spacing={3}>
					<Heading size={{ base: "md", md: "lg" }} color="gray">My Binders</Heading>
					<Button colorScheme="green" onClick={() => router.push("/import")}>
						Import from ManaBox
					</Button>
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

				{!isLoading && decks.length === 0 ? (
					<Card background="offWhite" borderRadius={5}>
						<CardBody>
							<Stack spacing={3} align="flex-start">
								<Heading size="md" color="gray">No decks yet.</Heading>
								<Text color="darkGreen">
									A deck appears here once cards are filed under one. ManaBox does that
									through its Binder Type column, or you can choose Deck and give it a
									name when you import.
								</Text>
								<Button colorScheme="green" onClick={() => router.push("/import")}>
									Import from ManaBox
								</Button>
							</Stack>
						</CardBody>
					</Card>
				) : null}

				{decks.length > 0 ? (
					<Stack spacing={4}>
						<Heading size="md" color="gray">Decks</Heading>
						<SimpleGrid columns={{ base: 1, sm: 2, lg: 3, xl: 4 }} spacing={4}>
							{decks.map(renderLocation)}
						</SimpleGrid>
					</Stack>
				) : null}

				{others.length > 0 ? (
					<Stack spacing={4}>
						<Heading size="md" color="gray">Binders and boxes</Heading>
						<SimpleGrid columns={{ base: 1, sm: 2, lg: 3, xl: 4 }} spacing={4}>
							{others.map(renderLocation)}
						</SimpleGrid>
					</Stack>
				) : null}

			</Stack>
		</Box>
	);
}
