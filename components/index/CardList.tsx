import { Flex, Stack } from "@chakra-ui/react";
import Card from "./Card";
import { GameCardProps, fetchRandomCard } from "../ScryfallAPI";
import { useEffect, useState } from "react";

interface GameGridProps {}

export default function CardList({}: GameGridProps) {
  const [cards, setCards] = useState<GameCardProps[]>([]); // Initialize cards as an empty array
  const [isLoaded, setIsLoaded] = useState<boolean>(false); // Initialize isLoaded as false

  useEffect(() => {
    const fetchCards = async () => {
      try {
        const fetchPromises = [];

        // Call ScryfallRandomCard 15 times to get 15 random cards
        for (let i = 0; i < 10; i++) {
          fetchPromises.push(fetchRandomCard());
        }

        const formattedCards = await Promise.all(fetchPromises);

        // Filter out any null values
        const validCards = formattedCards.filter((formattedCard) => formattedCard !== null);

        // Update the cards state with the fetched and filtered cards
        setCards((prevCards) => [...prevCards, ...validCards]);
        setIsLoaded(true); // Set isLoaded to true when the cards are loaded
      } catch (error) {
        // Handle errors here
        console.error("Error fetching random cards:", error);
      }
    };

    fetchCards();
  }, []); // Empty dependency array ensures this effect runs only once on component mount

  return (
    <Flex maxW="3600" m="auto" justify="center" direction="row">
      <Stack flex="1" direction="column" alignItems="center" ml="1vh" mr="1vh" mb="4vh" mt="1vh" rowGap="2">
        {isLoaded ? ( // Check if cards are loaded
          cards.map((card) => {
            console.log("displaying a card"); // This is just to show that the code is running
            return <Card key={card.key} title={card.title} description={card.description} imageSrc={card.imageSrc} imageAlt={card.imageAlt} />;
          })
        ) : (
          <p>Loading...</p> // Display a loading message while cards are being fetched
        )}
      </Stack>
    </Flex>
  );
}
