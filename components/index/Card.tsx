import { Badge, Text, Card, CardBody, Heading, HStack, Image, Stack } from "@chakra-ui/react";

type GameCardProps = {
	title: string,
	description: string,
	imageSrc: string,
	imageAlt: string,
	key: string,
	scryfall_uri: string,
	/** How many copies are held, shown when the card comes from the collection. */
	quantity?: number,
	/** The deck or binder holding it, shown when it is filed somewhere. */
	location?: string,
}

export default function GameCard({ title, description, imageSrc, imageAlt, scryfall_uri, quantity, location, ...rest }: GameCardProps) {

	/*
        Tweakable values used to change the GameCard.
    */
	const cardRadius = 5;
	const cardMaxW = 2600; // A bit wider than 1440p
	const cardMaxH = 140;
	const cardPadding = 4;
	const cardMargin = 0;

	/*
		Clicking a card opens its Scryfall page. noopener stops that page from
		reaching back into this one through window.opener.
	*/
	function handleClick() {
		window.open(scryfall_uri, "_blank", "noopener,noreferrer");
	}

	return(
		<Card
			width="100%" maxWidth={cardMaxW}
			/*
				Below the sm breakpoint the card stacks, so the art sits above
				the text and the pair needs more than the 140px a side by side
				row takes. Capping the height at 140px in both directions is
				what used to crop the text off on a phone.
			*/
			maxH={{ base: "none", sm: cardMaxH }}
			m={cardMargin}
			borderRadius={cardRadius}
			background="offWhite"
			overflow="hidden"
			direction={{ base: "column", sm: "row" }}
			alignItems={{ base: "stretch", sm: "center" }} // Aligns the text and image within the card
			_hover={{
				boxShadow: "0 0 0 3px #74b87d",
				background: "#c5d8df",
				transition: "box-shadow 0.2s ease-in-out, background 0.4s ease-in-out",
				cursor: "pointer",
			}}
			onClick={handleClick}
			{...rest}
		>
			<Image
				borderLeftRadius={{ base: 0, sm: cardRadius }}
				borderTopRadius={{ base: cardRadius, sm: 0 }}
				src={imageSrc}
				alt={imageAlt}
				width={{ base: "100%", sm: `${cardMaxH * 19 / 14}px` }}
				height={{ base: "120px", sm: `${cardMaxH}px` }}
				flexShrink={0}
				objectFit="cover"
			/>

			{/* Card information, either from Scryfall or from the collection */}
			<CardBody display="flex" alignItems="center" padding={cardPadding} overflow="hidden">
				<Stack spacing={1} w="100%">
					<HStack spacing={2} flexWrap="wrap">
						<Heading size={{ base: "md", md: "lg" }} color="gray" noOfLines={1}>
							{title}
						</Heading>
						{quantity ? <Badge colorScheme="green" textTransform="lowercase">{quantity}x</Badge> : null}
						{location ? <Badge colorScheme="purple">{location}</Badge> : null}
					</HStack>
					<Text fontSize={{ base: "xs", md: "sm" }} color="darkGreen" noOfLines={{ base: 3, sm: 2, md: 3 }}>
						{description}
					</Text>
				</Stack>
			</CardBody>
		</Card>
	);
}
