import { MatchableCard } from "../decklists/coverage";
import { GroupDecklist, GroupMember, GroupSummary } from "./types";

/**
 * The wire contract for groups and collections, plus the fetch helpers.
 *
 * Nothing here touches the filesystem, so it is safe to import from the browser.
 */

/** GET /api/groups */
export type GroupListResponse = {
	groups: GroupSummary[],
}

/** GET /api/groups/[id] */
export type GroupDetailResponse = {
	group: GroupSummary,
	members: GroupMember[],
	/** The caller's own role, so the UI knows what to offer. */
	role: "owner" | "member",
}

/** GET /api/groups/[id]/decklists */
export type DecklistsResponse = {
	decklists: GroupDecklist[],
}

/**
 * GET /api/collections/[ownerId]
 *
 * A whole collection, trimmed to the fields matching needs. Measured at 58 KB
 * gzipped for a 4,985 card collection, which is why fetching it whole and
 * matching in the browser is the design.
 */
export type CollectionResponse = {
	ownerId: string,
	displayName: string,
	isSelf: boolean,
	cards: MatchableCard[],
	/** When the collection was last written, so a refresh can be justified. */
	lastUpdated: string | null,
}

/**
 * Reads a fetch response, turning a non-2xx into a thrown Error carrying the
 * server's message.
 *
 * @param response The response to read
 * @returns The parsed body
 */
async function readJson<T>(response: Response): Promise<T> {
	const body = await response.json().catch(() => null);

	if (!response.ok) {
		throw new Error((body as { error?: string } | null)?.error || `Request failed with status ${response.status}.`);
	}

	if (body === null) {
		throw new Error("The server returned an unreadable response.");
	}

	return body as T;
}

/**
 * Lists the groups the signed-in person belongs to.
 *
 * @param signal Abort signal
 * @returns Their groups
 */
export async function fetchGroups(signal?: AbortSignal): Promise<GroupSummary[]> {
	const body = await readJson<GroupListResponse>(await fetch("/api/groups", { signal }));

	return body.groups;
}

/**
 * Creates a group.
 *
 * @param name What to call it
 * @returns The new group
 */
export async function createGroup(name: string): Promise<GroupSummary> {
	const response = await fetch("/api/groups", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ name }),
	});

	return readJson<GroupSummary>(response);
}

/**
 * Reads one group with its members.
 *
 * @param groupId Which group
 * @param signal Abort signal
 * @returns The group, its members, and the caller's role
 */
export function fetchGroup(groupId: string, signal?: AbortSignal): Promise<GroupDetailResponse> {
	return fetch(`/api/groups/${groupId}`, { signal }).then(readJson<GroupDetailResponse>);
}

/**
 * Adds someone to a group by the address they signed up with.
 *
 * @param groupId Which group
 * @param email Their address
 * @returns The refreshed member list
 */
export async function addGroupMember(groupId: string, email: string): Promise<GroupDetailResponse> {
	const response = await fetch(`/api/groups/${groupId}/members`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email }),
	});

	return readJson<GroupDetailResponse>(response);
}

/**
 * Removes someone from a group.
 *
 * @param groupId Which group
 * @param userId Who to remove
 * @returns The refreshed member list
 */
export async function removeGroupMember(groupId: string, userId: string): Promise<GroupDetailResponse> {
	const response = await fetch(`/api/groups/${groupId}/members?userId=${encodeURIComponent(userId)}`, {
		method: "DELETE",
	});

	return readJson<GroupDetailResponse>(response);
}

/**
 * Lists a group's saved decklists.
 *
 * @param groupId Which group
 * @param signal Abort signal
 * @returns The decklists, newest first
 */
export async function fetchDecklists(groupId: string, signal?: AbortSignal): Promise<GroupDecklist[]> {
	const body = await readJson<DecklistsResponse>(await fetch(`/api/groups/${groupId}/decklists`, { signal }));

	return body.decklists;
}

/**
 * Saves a decklist against a group.
 *
 * @param groupId Which group
 * @param name What to call it
 * @param text The list exactly as pasted
 * @returns The stored decklist
 */
export async function saveDecklist(groupId: string, name: string, text: string): Promise<GroupDecklist> {
	const response = await fetch(`/api/groups/${groupId}/decklists`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ name, text }),
	});

	return readJson<GroupDecklist>(response);
}

/**
 * Deletes a decklist.
 *
 * @param groupId Which group
 * @param decklistId Which list
 */
export async function deleteDecklist(groupId: string, decklistId: string): Promise<void> {
	// listId, not id: the route segment is already [id] for the group.
	const response = await fetch(`/api/groups/${groupId}/decklists?listId=${encodeURIComponent(decklistId)}`, {
		method: "DELETE",
	});

	await readJson<{ deleted: true }>(response);
}

/**
 * Fetches one person's whole collection, trimmed for matching.
 *
 * @param ownerId Whose collection
 * @param signal Abort signal
 * @returns The collection
 */
export function fetchCollection(ownerId: string, signal?: AbortSignal): Promise<CollectionResponse> {
	return fetch(`/api/collections/${encodeURIComponent(ownerId)}`, { signal }).then(readJson<CollectionResponse>);
}
