import { Flex, Stack } from "@chakra-ui/react";
import Card from "./Card";

/*

    These are the data given to the GameCard Objects. Many of the
    names are self-explanatory. key should be an integer passed as
    a string, which is used to identify cards from each other
    within React.

*/
const cards = [
	{
	  title: "Colossal Dreadmaw",
	  description: "Trample",
	  imageSrc: "https://cards.scryfall.io/large/front/7/6/76ac5b70-47db-4cdb-91e7-e5c18c42e516.jpg?1562558297",
	  imageAlt: "Colossal Dreadmaw",
	  key: "1",
	},
	{
	  title: "Lightning Bolt",
	  description: "Deal 3 damage to any target.",
	  imageSrc: "https://cards.scryfall.io/large/front/f/2/f29ba16f-c8fb-42fe-aabf-87089cb214a7.jpg?1673147852",
	  imageAlt: "Lightning Bolt",
	  key: "2",
	},
	{
	  title: "Serra Angel",
	  description: "Flying, vigilance",
	  imageSrc: "https://cards.scryfall.io/large/front/9/0/9067f035-3437-4c5c-bae9-d3c9001a3411.jpg?1600718440",
	  imageAlt: "Serra Angel",
	  key: "3",
	},
	{
	  title: "Counterspell",
	  description: "Counter target spell.",
	  imageSrc: "https://cards.scryfall.io/large/front/8/4/8493131c-0a7b-4be6-a8a2-0b425f4f67fb.jpg?1689996248",
	  imageAlt: "Counterspell",
	  key: "4",
	},
	{
	  title: "Giant Growth",
	  description: "Target creature gets +3/+3 until end of turn.",
	  imageSrc: "https://cards.scryfall.io/large/front/a/e/aeece336-e5e8-4455-a297-c3739198d011.jpg?1674421574",
	  imageAlt: "Giant Growth",
	  key: "5",
	},
	{
	  title: "Birds of Paradise",
	  description: "Flying, tap to add one mana of any color to your mana pool.",
	  imageSrc: "https://cards.scryfall.io/large/front/f/e/feefe9f0-24a6-461c-9ef1-86c5a6f33b83.jpg?1594681430",
	  imageAlt: "Birds of Paradise",
	  key: "6",
	},
	{
	  title: "Lightning Helix",
	  description: "Deal 3 damage to any target and you gain 3 life.",
	  imageSrc: "https://cards.scryfall.io/large/front/5/8/58f25737-a195-4763-bc23-b3c4d38b9e58.jpg?1673148879",
	  imageAlt: "Lightning Helix",
	  key: "7",
	},
	{
	  title: "Dark Confidant",
	  description: "At the beginning of your upkeep, reveal the top card of your library and put that card into your hand. You lose life equal to its converted mana cost.",
	  imageSrc: "https://cards.scryfall.io/large/front/b/0/b0d88239-43dc-46b8-8d46-626e2f8f1070.jpg?1598304507",
	  imageAlt: "Dark Confidant",
	  key: "8",
	},
	{
	  title: "Tarmogoyf",
	  description: "Tarmogoyf's power is equal to the number of card types among cards in all graveyards and its toughness is equal to that number plus 1.",
	  imageSrc: "https://cards.scryfall.io/large/front/6/9/69daba76-96e8-4bcc-ab79-2f00189ad8fb.jpg?1619398799",
	  imageAlt: "Tarmogoyf",
	  key: "9",
	},
	{
	  title: "Thoughtseize",
	  description: "Target player reveals their hand. You choose a nonland card from it. That player discards that card. You lose 2 life.",
	  imageSrc: "https://cards.scryfall.io/large/front/b/2/b281a308-ab6b-47b6-bec7-632c9aaecede.jpg?1599706001",
	  imageAlt: "Thoughtseize",
	  key: "10",
	},
	{
	  title: "Path to Exile",
	  description: "Exile target creature. Its controller may search their library for a basic land card, put that card onto the battlefield tapped, then shuffle their library.",
	  imageSrc: "https://cards.scryfall.io/large/front/4/9/4970389b-08f4-4a15-a128-954b072a8137.jpg?1689995937",
	  imageAlt: "Path to Exile",
	  key: "11",
	},
	{
	  title: "Cryptic Command",
	  description: "Choose two — Counter target spell; or return target permanent to its owner's hand; or tap all creatures your opponents control; or draw a card.",
	  imageSrc: "https://cards.scryfall.io/large/front/3/0/30f6fca9-003b-4f6b-9d6e-1e88adda4155.jpg?1562847413",
	  imageAlt: "Cryptic Command",
	  key: "12",
	},
	{
	  title: "Tinker",
	  description: "As an additional cost to cast this spell, sacrifice an artifact. Search your library for an artifact card and put that card onto the battlefield. Then shuffle your library.",
	  imageSrc: "https://cards.scryfall.io/large/front/7/d/7da23b15-dfb8-4267-9b33-d7a4c035c434.jpg?1562863289",
	  imageAlt: "Tinker",
	  key: "13",
	},
	{
	  title: "Black Lotus",
	  description: "Tap, Sacrifice Black Lotus: Add three mana of any one color.",
	  imageSrc: "https://cards.scryfall.io/large/front/b/d/bd8fa327-dd41-4737-8f19-2cf5eb1f7cdd.jpg?1614638838",
	  imageAlt: "Black Lotus",
	  key: "14",
	},
	{
	  title: "Ancestral Recall",
	  description: "Target player draws three cards.",
	  imageSrc: "https://cards.scryfall.io/large/front/2/3/2398892d-28e9-4009-81ec-0d544af79d2b.jpg?1614638829",
	  imageAlt: "Ancestral Recall",
	  key: "15",
	},
];

  


interface GameGridProps {
}

export default function GameGrid({  }: GameGridProps) {
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
