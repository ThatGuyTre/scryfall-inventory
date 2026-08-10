import ImportManaBox from "@/components/inventory/ImportManaBox";
import Webpage from "@/components/Webpage";

/**
 * The page behind the "Import from ManaBox" tab. It takes the .csv file the
 * ManaBox app exports and loads it into the inventory.
 *
 * @returns The ImportFromManaBoxPage Component
 */
export default function ImportFromManaBoxPage() {

	return(
		<Webpage>
			<ImportManaBox />
		</Webpage>
	);
}
