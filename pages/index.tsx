import CardList from "@/components/index/CardList";
import Webpage from "@/components/Webpage";

/**
 * The main page shown on the webpage. The Header and the scrollable main
 * area come from Webpage, so all this page decides is that the main area
 * holds the CardList.
 *
 * @returns The MainPage Component
 */
export default function MainPage() {

	return(
		<Webpage>
			<CardList />
		</Webpage>
	);
}
