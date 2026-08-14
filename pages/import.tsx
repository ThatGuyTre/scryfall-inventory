import ImportManaBox from "@/components/inventory/ImportManaBox";
import Webpage from "@/components/Webpage";

/**
 * The import page. Takes a .csv exported from ManaBox or Deckbox and loads it
 * into the inventory, working out which app it came from from the file itself.
 *
 * @returns The ImportPage Component
 */
export default function ImportPage() {

	return(
		<Webpage>
			<ImportManaBox />
		</Webpage>
	);
}
