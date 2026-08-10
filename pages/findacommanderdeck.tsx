import CommanderFinder from "@/components/commander/CommanderFinder";
import Webpage from "@/components/Webpage";

/**
 * The page behind the "Find a Commander Deck" tab. It scores EDHREC's most
 * played commanders against the collection.
 *
 * @returns The FindACommanderDeckPage Component
 */
export default function FindACommanderDeckPage() {

	return(
		<Webpage>
			<CommanderFinder />
		</Webpage>
	);
}
