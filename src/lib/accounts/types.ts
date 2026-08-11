/**
 * Accounts and groups.
 *
 * A user id is whatever the identity provider calls the person. Locally that is
 * a UUID this app mints on first sign-in; with Cognito it will be the `sub`
 * claim. Nothing downstream cares which, so switching providers changes the
 * sign-in route and nothing else.
 */

/** The owner id used when nobody is signed in. */
export const ANONYMOUS_OWNER_ID = "anonymous";

/** What the app knows about a person, beyond what the identity provider owns. */
export type UserProfile = {
	/** The identity provider's id for this person. */
	id: string,
	/**
	 * Owned by the identity provider, copied here so a group can show who its
	 * members are without asking the provider for every member.
	 */
	email: string,
	/** Chosen name, shown to other members of a group. */
	username: string,
	firstName: string,
	lastName: string,
	/**
	 * Whether binders default to visible to a user's groups.
	 *
	 * Fixed at "public" on this branch. The field exists so that turning
	 * per-binder visibility on later is a UI change and a filter, not a
	 * migration.
	 */
	defaultVisibility: "public" | "private",
	createdAt: string,
	updatedAt: string,
}

/** The fields a person may change about themselves. */
export type ProfileEdit = {
	username?: string,
	firstName?: string,
	lastName?: string,
}

/** What a member may do in a group. */
export type GroupRole = "owner" | "member";

/**
 * Whether a membership has been agreed to.
 *
 * Being added to a group means the other members can read your collection, so it
 * takes two people: an owner invites, and the invitee accepts. Until they do,
 * the membership exists but grants nothing — an invitation is a question, not a
 * decision someone else makes for you.
 *
 * Declining deletes the membership outright rather than recording a refusal,
 * because a "declined" row would only serve to stop the owner asking again.
 */
export type MembershipStatus = "invited" | "accepted";

/** A group, as its own record. */
export type Group = {
	id: string,
	name: string,
	/** Who created it. Always a member, and cannot be removed. */
	ownerId: string,
	createdAt: string,
}

/** One person's membership of one group. */
export type GroupMembership = {
	groupId: string,
	userId: string,
	role: GroupRole,
	status: MembershipStatus,
	/** When they were invited. */
	invitedAt: string,
	/** When they accepted, or null while the invitation is outstanding. */
	joinedAt: string | null,
}

/** A group with the caller's own standing in it, for listing. */
export type GroupSummary = Group & {
	role: GroupRole,
	/** The caller's own status, so a list can separate invitations from groups. */
	status: MembershipStatus,
	/** People who have accepted. Outstanding invitations are not members yet. */
	memberCount: number,
	/** Invitations still waiting on an answer. */
	invitedCount: number,
}

/** A member of a group, with enough profile to show them on screen. */
export type GroupMember = {
	userId: string,
	username: string,
	email: string,
	firstName: string,
	lastName: string,
	role: GroupRole,
	status: MembershipStatus,
	invitedAt: string,
	joinedAt: string | null,
	/**
	 * Cards in that member's collection, so the UI can say what is on offer.
	 * Zero for an outstanding invitation, since nothing is readable yet.
	 */
	cardCount: number,
}

/** A decklist saved against a group. */
export type GroupDecklist = {
	id: string,
	groupId: string,
	name: string,
	/** Who pasted it. */
	authorId: string,
	/** The list exactly as pasted, so it can be re-parsed or edited later. */
	text: string,
	createdAt: string,
}

/**
 * Names a person for display, preferring the most specific thing they have set.
 *
 * @param profile The profile to name
 * @returns A name suitable for a group member list
 */
export function displayNameFor(profile: Pick<UserProfile, "username" | "firstName" | "lastName" | "email">): string {
	const full = [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim();

	return profile.username || full || profile.email || "Someone";
}
