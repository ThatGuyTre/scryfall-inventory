import GroupList from "@/components/groups/GroupList";
import Webpage from "@/components/Webpage";

/**
 * The page behind the "Groups" tab. Lists the groups you belong to and lets you
 * start another.
 *
 * @returns The GroupsPage Component
 */
export default function GroupsPage() {

	return(
		<Webpage>
			<GroupList />
		</Webpage>
	);
}
