import {
	Alert,
	AlertIcon,
	Button,
	Card as ChakraCard,
	CardBody,
	Flex,
	HStack,
	Heading,
	Spinner,
	Stack,
	Text,
} from "@chakra-ui/react";
import { RepeatIcon } from "@chakra-ui/icons";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Card from "./Card";
import { ShowcaseCard, fetchShowcase } from "@/src/lib/inventory/api";
import { formatCount, locationLabel } from "@/components/inventory/format";

/**
 * The home page card list.
 *
 * It shows a sample of the cards actually owned rather than random cards from
 * Scryfall, with the art and rules text fetched from Scryfall on the server and
 * joined to the stored quantity and location.
 */

/** How many cards to show at once. */
const CARD_COUNT = 10;

export default function CardList() {
	const router = useRouter();

	const [cards, setCards] = useState<ShowcaseCard[]>([]);
	const [uniqueCards, setUniqueCards] = useState<number>(0);
	const [totalQuantity, setTotalQuantity] = useState<number>(0);
	const [isLoaded, setIsLoaded] = useState<boolean>(false);
	const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);

	/*
		Bumping this re-runs the effect below, which is how the shuffle button
		asks for a fresh sample. Loading lives entirely inside the effect so
		there is one path that fetches, and one that cleans up after itself.
	*/
	const [reloadToken, setReloadToken] = useState<number>(0);

	useEffect(() => {
		// Aborting on unmount stops the fetch from settling into a component
		// that is no longer on the page.
		const controller = new AbortController();

		async function load() {
			setError(null);

			try {
				const showcase = await fetchShowcase(CARD_COUNT, controller.signal);

				if (controller.signal.aborted) {
					return;
				}

				setCards(showcase.cards);
				setUniqueCards(showcase.uniqueCards);
				setTotalQuantity(showcase.totalQuantity);
			} catch (caught) {
				if (!controller.signal.aborted) {
					setError(caught instanceof Error ? caught.message : "Could not read your collection.");
				}
			} finally {
				if (!controller.signal.aborted) {
					setIsLoaded(true);
					setIsRefreshing(false);
				}
			}
		}

		load();

		return () => controller.abort();
	}, [reloadToken]);

	/**
	 * Draws another sample from the collection.
	 */
	function refresh() {
		setIsRefreshing(true);
		setReloadToken((token) => token + 1);
	}

	if (!isLoaded) {
		// Display a loading message while cards are being fetched
		return (
			<HStack justify="center" py={10}>
				<Spinner color="desaturatedGreen" />
				<Heading color="gray" size="lg">Loading...</Heading>
			</HStack>
		);
	}

	return (
		<Flex maxW="3600" m="auto" justify="center" direction="row">
			<Stack
				flex="1"
				direction="column"
				alignItems="center"
				ml={{ base: 2, md: "1vh" }}
				mr={{ base: 2, md: "1vh" }}
				mb="4vh"
				mt={{ base: 2, md: "1vh" }}
				rowGap="2"
			>

				{error ? (
					<Alert status="error" borderRadius={5} maxW="600px">
						<AlertIcon />
						{error}
					</Alert>
				) : null}

				{!error && cards.length === 0 ? (
					<ChakraCard background="offWhite" borderRadius={5} maxW="600px" w="100%" mt={4}>
						<CardBody>
							<Stack spacing={3} align="flex-start">
								<Heading size="md" color="gray">Your collection is empty.</Heading>
								<Text color="darkGreen">
									Import a ManaBox .csv export and your own cards will show up here.
								</Text>
								<Button colorScheme="green" onClick={() => router.push("/importfrommanabox")}>
									Import from ManaBox
								</Button>
							</Stack>
						</CardBody>
					</ChakraCard>
				) : null}

				{cards.length > 0 ? (
					<Stack direction={{ base: "column", sm: "row" }} w="100%" maxW="2600px" align={{ base: "stretch", sm: "center" }} justify="space-between" px={1} pb={1} spacing={2}>
						<Text color="darkGreen" fontSize="sm">
							Showing {cards.length} of {formatCount(uniqueCards)} unique cards
							{" · "}
							{formatCount(totalQuantity)} held
						</Text>
						<Button
							size="sm"
							leftIcon={<RepeatIcon />}
							variant="outline"
							borderColor="desaturatedGreen"
							isLoading={isRefreshing}
							loadingText="Shuffling"
							onClick={refresh}
							alignSelf={{ base: "stretch", sm: "auto" }}
						>
							Show me others
						</Button>
					</Stack>
				) : null}

				{cards.map((card) => (
					<Card
						key={card.key}
						title={card.title}
						description={card.description}
						imageSrc={card.imageSrc}
						imageAlt={card.imageAlt}
						scryfall_uri={card.scryfall_uri}
						quantity={card.quantity}
						location={card.locationName ? locationLabel(card.locationKind, card.locationName) : undefined}
					/>
				))}

			</Stack>
		</Flex>
	);
}
