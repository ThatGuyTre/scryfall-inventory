import { Text, Card, CardBody, Heading, Image, Stack, useMediaQuery } from "@chakra-ui/react";
import { useRouter } from "next/router";


type GameCardProps = {
	title: string,
    description: string,
    imageSrc: string,
    imageAlt: string,
    key: string,
}

export default function GameCard({ title, description, imageSrc, imageAlt, ...rest }: GameCardProps) {

	/*
        Tweakable values used to change the GameCard.
    */
	const cardRadius = 5;
	const cardMaxW = 2600; // A bit wider than 1440p
	const cardMaxH = 140;
	const cardPadding = 4;
	const cardMargin = 0;

	/*
		Router is used to redirect the user to the game page when the
		card is clicked.
	*/
	const router = useRouter();


	return(
		<Card
			width="100%"
			maxWidth={cardMaxW}
			maxH={cardMaxH}
			m={cardMargin}
			borderRadius={cardRadius}
			background="offWhite"
			direction={{ base: "column", sm: "row" }}
			alignItems="center" // Aligns the text and image within the card
			_hover={{
				boxShadow: "0 0 0 3px #74b87d",
				background: "#c5d8df",
        		transition: "box-shadow 0.2s ease-in-out, background 0.4s ease-in-out",
				cursor: "pointer",
			}}
			{...rest}
		>
			<Image
				borderLeftRadius={cardRadius}
				src={imageSrc}
				alt={imageAlt}
				width={cardMaxH * 19/14}
				height={cardMaxH}
				objectFit="cover"
			/>

			{/* Game Information passed in from the array at the top of index.tsx */}
			<CardBody display="flex" alignItems="center" padding={cardPadding}>
				<Stack>
					<Heading size="lg" color="gray">
						{title}
					</Heading>
					<Text size="sm" color="darkGreen">
						{description}
					</Text>
				</Stack>
			</CardBody>
		</Card>
	);
}
