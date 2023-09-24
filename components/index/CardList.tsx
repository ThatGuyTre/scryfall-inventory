import { Flex, Stack } from "@chakra-ui/react";
import Card from "./Card";
import { GameCardProps, fetchRandomCard } from "../ScryfallAPI";
import { useEffect } from "react";

const cards: GameCardProps[] = [
	{
		title: "Loading...",
		description: "Please wait while the cards are loaded.",
		imageSrc: "",
		imageAlt: "",
		key: "loading",
	}
];

const fetchPromises: Promise<any>[] = [];

function populateCards() {
	for (let i = 0; i < 5; i++) {
		fetchPromises.push(fetchRandomCard());
	  }
	  
	  Promise.all(fetchPromises).then((formattedCards) => {
		  // All fetch operations have completed successfully.
		  // formattedCards is an array of card data.
			cards.pop(); // Remove the loading card
			
			formattedCards.forEach((formattedCard) => {
				if (formattedCard !== null) {
					cards.push(formattedCard);
				}
			});
		  
		  // Now 'cards' contains the cards that were successfully fetched.
		  console.log(cards);
		}).catch((error) => {
		  // Handle errors here
		  console.error("Error fetching random cards:", error);
		});
}

useEffect(() => {
	populateCards();
}, []);

interface GameGridProps {
}

export default function CardList({ }: GameGridProps) {

	return(
		
			<Flex maxW="3600" m="auto" justify="center" direction="row">
				<Stack flex="1" direction="column" alignItems="center" ml="1vh" mr="1vh" mb="4vh" mt="1vh" rowGap="2">
					{cards.map((card) => {
						return <Card
							key={card.key} // This is required for mapped objects but is not used
							title={card.title}
							description={card.description}
							imageSrc={card.imageSrc}
							imageAlt={card.imageAlt}
						/>;
					}
					)}
				</Stack>
			</Flex>
	);
}
