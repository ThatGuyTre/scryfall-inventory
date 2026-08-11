import { getAccountRepository } from "./index";
import { getInventoryRepository } from "../inventory";
import { GroupMember, GroupSummary, UserProfile, displayNameFor } from "./types";

/**
 * Who may read whose collection.
 *
 * Matching moved to the browser, but authority did not. This module is the one
 * place that decides whether a caller is allowed to see a collection, and every
 * route that hands one out asks it first. Getting this wrong is the difference
 * between a group feature and a data leak, so it lives on its own rather than
 * being re-derived per route.
 */

/**
 * Whether a caller may read an owner's collection.
 *
 * Permitted when it is their own, or when the two share at least one group.
 * Groups grant read access only, which is why there is no write equivalent.
 *
 * @param callerId Who is asking
 * @param ownerId Whose collection
 * @returns Whether to allow it
 */
export async function mayReadCollection(callerId: string, ownerId: string): Promise<boolean> {
	if (callerId === ownerId) {
		return true;
	}

	const accounts = getAccountRepository();
	const mine = await accounts.listGroupsForUser(callerId);

	for (const { group, status } of mine) {
		// An invitation the caller has not accepted grants them nothing. Sharing
		// runs both ways: neither side's collection opens until both have agreed
		// to be in the group.
		if (status !== "accepted") {
			continue;
		}

		const members = await accounts.listMembers(group.id);

		if (members.some((member) => member.userId === ownerId && member.status === "accepted")) {
			return true;
		}
	}

	return false;
}

/**
 * Whether a caller is an accepted member of a group.
 *
 * Outstanding invitations deliberately return null: an invitee may answer the
 * invitation, and nothing else, until they accept.
 *
 * @param callerId Who is asking
 * @param groupId Which group
 * @returns Their role, or null when they have not accepted
 */
export async function roleInGroup(callerId: string, groupId: string): Promise<"owner" | "member" | null> {
	const members = await getAccountRepository().listMembers(groupId);
	const mine = members.find((member) => member.userId === callerId);

	if (!mine || mine.status !== "accepted") {
		return null;
	}

	return mine.role;
}

/**
 * Reads a caller's membership whatever its status, for answering invitations.
 *
 * @param callerId Who is asking
 * @param groupId Which group
 * @returns Their status, or null when there is no membership at all
 */
export async function membershipStatus(
	callerId: string,
	groupId: string,
): Promise<"invited" | "accepted" | null> {
	const members = await getAccountRepository().listMembers(groupId);

	return members.find((member) => member.userId === callerId)?.status ?? null;
}

/**
 * Builds the member list for a group, with each member's card count.
 *
 * The count comes from the inventory store rather than being stored on the
 * membership, so it cannot go stale after an import.
 *
 * @param groupId Which group
 * @returns The members, oldest first
 */
export async function describeMembers(groupId: string): Promise<GroupMember[]> {
	const accounts = getAccountRepository();
	const inventory = getInventoryRepository();

	const memberships = await accounts.listMembers(groupId);
	const profiles = await accounts.getUsers(memberships.map((membership) => membership.userId));

	const described: GroupMember[] = [];

	for (const membership of memberships) {
		const profile: UserProfile | undefined = profiles[membership.userId];

		// Nothing of an invitee's collection is readable until they accept, so
		// their card count is not something to advertise either.
		const cardCount = membership.status === "accepted"
			? (await inventory.stats(membership.userId)).totalQuantity
			: 0;

		described.push({
			userId: membership.userId,
			username: profile ? displayNameFor(profile) : "Someone",
			email: profile?.email ?? "",
			firstName: profile?.firstName ?? "",
			lastName: profile?.lastName ?? "",
			role: membership.role,
			status: membership.status,
			invitedAt: membership.invitedAt,
			joinedAt: membership.joinedAt,
			cardCount,
		});
	}

	return described;
}

/**
 * Adds the caller's role and the member count to a group.
 *
 * @param groupId Which group
 * @param callerId Who is asking
 * @returns The summary, or null when the group does not exist
 */
export async function summariseGroup(groupId: string, callerId: string): Promise<GroupSummary | null> {
	const accounts = getAccountRepository();
	const group = await accounts.getGroup(groupId);

	if (!group) {
		return null;
	}

	const members = await accounts.listMembers(groupId);
	const mine = members.find((member) => member.userId === callerId);

	return {
		...group,
		role: mine?.role ?? "member",
		status: mine?.status ?? "invited",
		// Only people who have accepted are members. An outstanding invitation is
		// counted separately so an owner can see it is still waiting.
		memberCount: members.filter((member) => member.status === "accepted").length,
		invitedCount: members.filter((member) => member.status === "invited").length,
	};
}
