import DeckList from "@/components/inventory/DeckList";
import Webpage from "@/components/Webpage";

/**
 * The page behind the "My Binders" tab. It shows every deck that exists in the
 * collection, and everywhere else cards are kept, with a way into each one.
 *
 * @returns The AddADeckPage Component
 */
export default function AddADeckPage() {

	return(
		<Webpage>
			<DeckList />
		</Webpage>
	);
}
