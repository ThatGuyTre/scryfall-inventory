import { useRouter } from "next/router";
import GroupDetail from "@/components/groups/GroupDetail";
import Webpage from "@/components/Webpage";

/**
 * One group: its members, and the decklist tool that asks who can supply the
 * cards for a deck.
 *
 * @returns The GroupPage Component
 */
export default function GroupPage() {
	const router = useRouter();
	const groupId = typeof router.query.id === "string" ? router.query.id : "";

	return(
		<Webpage>
			{/* The id arrives after hydration, so render nothing until it does. */}
			{groupId ? <GroupDetail groupId={groupId} /> : null}
		</Webpage>
	);
}
