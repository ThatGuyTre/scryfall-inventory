import InventoryBrowser from "@/components/inventory/InventoryBrowser";
import Webpage from "@/components/Webpage";

/**
 * The page behind the "Inventory" tab. It lists whatever has been imported
 * from ManaBox and lets it be searched and filtered.
 *
 * @returns The InventoryPage Component
 */
export default function InventoryPage() {

	return(
		<Webpage>
			<InventoryBrowser />
		</Webpage>
	);
}
