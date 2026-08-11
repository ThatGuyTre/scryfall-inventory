import {
	Group,
	GroupDecklist,
	GroupMembership,
	GroupRole,
	MembershipStatus,
	ProfileEdit,
	UserProfile,
} from "./types";

/**
 * The storage contract for accounts and groups.
 *
 * The same seam as {@link InventoryRepository}: API routes depend on this and
 * nothing else, so the local JSON implementation can be replaced by a DynamoDB
 * one without a caller changing. Every method is expressed so that it maps onto
 * the single-table design in infra/DESIGN.md — reads are by key, and nothing
 * asks for a join.
 */
export interface AccountRepository {
	/** Identifies the active implementation, surfaced for diagnostics. */
	readonly driver: string,

	/**
	 * Finds a user, or creates one on first sign-in.
	 *
	 * The identity provider is the authority on who someone is; this fills in
	 * the fields it does not own. Called on every sign-in, so it must be safe to
	 * call repeatedly.
	 *
	 * @param id The identity provider's id
	 * @param seed Email, and a username to start from
	 * @returns The stored profile
	 */
	upsertUser(id: string, seed: { email: string, username: string }): Promise<UserProfile>,

	/**
	 * Reads a profile.
	 *
	 * @param id The user id
	 * @returns The profile, or null when there is no such user
	 */
	getUser(id: string): Promise<UserProfile | null>,

	/**
	 * Reads several profiles at once, for showing a group's members.
	 *
	 * @param ids The user ids
	 * @returns The profiles found, keyed by id
	 */
	getUsers(ids: string[]): Promise<Record<string, UserProfile>>,

	/**
	 * Changes what a person may change about themselves.
	 *
	 * @param id The user id
	 * @param edit The fields to change
	 * @returns The updated profile
	 */
	updateUser(id: string, edit: ProfileEdit): Promise<UserProfile>,

	/**
	 * Creates a group, with its creator as owner and first member.
	 *
	 * @param ownerId Who is creating it
	 * @param name What to call it
	 * @returns The new group
	 */
	createGroup(ownerId: string, name: string): Promise<Group>,

	/**
	 * Lists the groups a user belongs to or has been invited to.
	 *
	 * Outstanding invitations are included, since the point of listing is partly
	 * to let someone answer them. Callers must check `status` before treating a
	 * result as membership.
	 *
	 * @param userId The user id
	 * @returns Their groups, with their standing in each
	 */
	listGroupsForUser(userId: string): Promise<{
		group: Group,
		role: GroupRole,
		status: MembershipStatus,
		memberCount: number,
		invitedCount: number,
	}[]>,

	/**
	 * Reads one group.
	 *
	 * @param groupId The group id
	 * @returns The group, or null when there is no such group
	 */
	getGroup(groupId: string): Promise<Group | null>,

	/**
	 * Lists a group's memberships.
	 *
	 * @param groupId The group id
	 * @returns Every membership, oldest first
	 */
	listMembers(groupId: string): Promise<GroupMembership[]>,

	/**
	 * Invites someone to a group. Safe to call when they are already invited or
	 * a member; it will not downgrade an accepted membership back to invited.
	 *
	 * @param groupId The group id
	 * @param userId Who to invite
	 * @param role What they may do once they accept
	 * @returns The membership
	 */
	addMember(groupId: string, userId: string, role?: GroupRole): Promise<GroupMembership>,

	/**
	 * Accepts an outstanding invitation.
	 *
	 * @param groupId The group id
	 * @param userId Who is accepting
	 * @returns The now-accepted membership
	 * @throws When there is no invitation to accept
	 */
	acceptInvitation(groupId: string, userId: string): Promise<GroupMembership>,

	/**
	 * Declines an invitation, deleting the membership.
	 *
	 * The same effect as being removed, expressed separately because a person
	 * declining their own invitation is allowed where removing someone else is
	 * not.
	 *
	 * @param groupId The group id
	 * @param userId Who is declining
	 */
	declineInvitation(groupId: string, userId: string): Promise<void>,

	/**
	 * Removes someone from a group.
	 *
	 * @param groupId The group id
	 * @param userId Who to remove
	 */
	removeMember(groupId: string, userId: string): Promise<void>,

	/**
	 * Finds a user by email, so someone can be invited by the address they
	 * signed up with rather than by an id nobody can remember.
	 *
	 * @param email The address to look for
	 * @returns The profile, or null
	 */
	findUserByEmail(email: string): Promise<UserProfile | null>,

	/**
	 * Saves a decklist against a group.
	 *
	 * @param groupId The group id
	 * @param authorId Who pasted it
	 * @param name What to call it
	 * @param text The list exactly as pasted
	 * @returns The stored decklist
	 */
	saveDecklist(groupId: string, authorId: string, name: string, text: string): Promise<GroupDecklist>,

	/**
	 * Lists a group's decklists, newest first.
	 *
	 * @param groupId The group id
	 * @returns The decklists
	 */
	listDecklists(groupId: string): Promise<GroupDecklist[]>,

	/**
	 * Deletes a decklist.
	 *
	 * @param groupId The group id
	 * @param decklistId Which list
	 */
	deleteDecklist(groupId: string, decklistId: string): Promise<void>,
}
