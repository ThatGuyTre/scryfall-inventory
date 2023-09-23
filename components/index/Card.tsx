import { AspectRatio, Card, CardBody, Heading, Image, Stack, useMediaQuery } from "@chakra-ui/react";
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
	const cardMaxW = 650;
	let cardMaxH: number | string = 200;
	const cardPadding = 4;
	const cardMargin = 0;

	/*
		Router is used to redirect the user to the game page when the
		card is clicked.
	*/
	const router = useRouter();

	/*
		The useMediaQuery hook is used to determine if the screen is
		too narrow to show images within the card. The specific width
		is determined by the value of CardMaxW.
	*/
	const [ thinScreen ] = useMediaQuery(`(min-width: ${ cardMaxW + 272 }px)`);

	if (!thinScreen) {
		cardMaxH = "";
	}


	return(
		<Card
			width="100%"
			maxWidth={cardMaxW}
			maxH={cardMaxH}
			m={cardMargin}
			borderRadius={cardRadius}
			background="lightOrange"
			direction={{ base: "column", sm: "row" }}
			alignItems="center" // Aligns the text and image within the card
			_hover={{
				boxShadow: "0 0 0 3px #7176FF",
				transition: "box-shadow 0.4s ease",
				cursor: "pointer",
			}}
			{...rest}
		>

			{/* Image that offs itself if screen is too narrow. The
			following code uses a short circuit to only display the
			image if thinScreen is true. */}
			{thinScreen &&
				// <AspectRatio ratio={1} h={"200px"} w={"200px"}>
				<Image
					borderLeftRadius={cardRadius}
					src={imageSrc}
					alt={imageAlt}
					maxH={cardMaxH}
				/>
				// </AspectRatio>
			}

			{/* Game Information passed in from the array at the top of index.tsx */}
			<CardBody display="flex" alignItems="center" padding={cardPadding}>
				<Stack>
					<Heading size="lg" color="offWhite">
						{title}
					</Heading>
					<Heading size="sm" color="fadedPurple">
						{description}
					</Heading>
				</Stack>
			</CardBody>
		</Card>
	);
}
