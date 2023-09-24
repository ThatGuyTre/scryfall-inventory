import { Flex, Stack } from "@chakra-ui/react";
import Card from "./Card";
import { GameCardProps, fetchRandomCard } from "../ScryfallAPI";

const cards: GameCardProps[] = [
	{
		title: "Colossal Dreadmaw",
		description: "Trample",
		imageSrc: "https://cards.scryfall.io/large/front/7/6/76ac5b70-47db-4cdb-91e7-e5c18c42e516.jpg?1562558297",
		imageAlt: "Colossal Dreadmaw",
		key: "1",
	},
];
const fetchPromises = [];

// Call ScryfallRandomCard 15 times to get 15 random cards
for (let i = 0; i < 15; i++) {
  fetchPromises.push(fetchRandomCard());
}

Promise.all(fetchPromises)
  .then((formattedCards) => {
    // All fetch operations have completed successfully.
    // formattedCards is an array of card data.
    
    formattedCards.forEach((formattedCard) => {
      if (formattedCard !== null) {
        cards.push(formattedCard);
      }
    });
    
    // Now 'cards' contains the cards that were successfully fetched.
    console.log(cards);
  })
  .catch((error) => {
    // Handle errors here
    console.error("Error fetching random cards:", error);
  });



interface GameGridProps {
}

export default function GameGrid({  }: GameGridProps) {
	return(
		<Flex maxW="3600" m="auto" justify="center" direction="row">
			<Stack flex="1" direction="column" alignItems="center" ml="1vh" mr="1vh" mb="4vh" mt="1vh" rowGap="2">
				{cards.map((card) => {
					console.log("displaying a card"); // This is just to show that the code is running
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
