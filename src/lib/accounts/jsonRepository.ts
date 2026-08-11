import { randomUUID } from "crypto";
import path from "path";
import { createJsonDocumentStore } from "../store/jsonDocument";
import { AccountRepository } from "./repository";
import { Group, GroupDecklist, GroupMembership, GroupRole, ProfileEdit, UserProfile } from "./types";

/**
 * Accounts and groups in one local JSON document.
 *
 * The stand-in for the DynamoDB table while there is no AWS to talk to. It is
 * shaped deliberately like the single-table design — users keyed by id,
 * memberships stored as their own records rather than as arrays inside a group —
 * so the DynamoDB implementation is a translation of these methods and not a
 * redesign.
 */

type AccountsDocument = {
	users: Record<string, UserProfile>,
	groups: Record<string, Group>,
	/** Keyed "groupId/userId", mirroring one membership item per join. */
	memberships: Record<string, GroupMembership>,
	decklists: Record<string, GroupDecklist>,
}

export type JsonAccountRepositoryOptions = {
	/** Absolute path of the document. Defaults to src/data/accounts.json. */
	filePath?: string,
}

/**
 * Resolves where the accounts document lives.
 *
 * @param options Caller supplied overrides
 * @returns An absolute path
 */
function resolveFilePath(options: JsonAccountRepositoryOptions): string {
	if (options.filePath) {
		return options.filePath;
	}

	if (process.env.ACCOUNTS_FILE) {
		return path.resolve(process.env.ACCOUNTS_FILE);
	}

	return path.join(process.cwd(), "src", "data", "accounts.json");
}

/** The key one membership is stored under. */
function membershipKey(groupId: string, userId: string): string {
	return `${groupId}/${userId}`;
}

/**
 * Creates a JSON backed account repository.
 *
 * @param options Optional overrides, mainly for tests
 * @returns A repository over one JSON document
 */
export function createJsonAccountRepository(options: JsonAccountRepositoryOptions = {}): AccountRepository {
	const store = createJsonDocumentStore<AccountsDocument>({
		filePath: resolveFilePath(options),
		empty: () => ({ users: {}, groups: {}, memberships: {}, decklists: {} }),
	});

	/**
	 * Counts a group's members without loading them.
	 *
	 * @param document The whole document
	 * @param groupId Which group
	 * @returns How many people are in it
	 */
	function countMembers(document: AccountsDocument, groupId: string): number {
		return Object.values(document.memberships).filter((m) => m.groupId === groupId).length;
	}

	return {
		driver: "json",

		upsertUser(id, seed) {
			return store.write((document) => {
				const existing = document.users[id];
				const now = new Date().toISOString();

				if (existing) {
					// The provider owns the email, so keep it current; everything
					// else is the user's to change and must not be overwritten.
					if (seed.email && existing.email !== seed.email) {
						existing.email = seed.email;
						existing.updatedAt = now;
					}

					return existing;
				}

				const created: UserProfile = {
					id,
					email: seed.email,
					username: seed.username,
					firstName: "",
					lastName: "",
					defaultVisibility: "public",
					createdAt: now,
					updatedAt: now,
				};

				document.users[id] = created;

				return created;
			});
		},

		async getUser(id) {
			return (await store.read()).users[id] ?? null;
		},

		async getUsers(ids) {
			const document = await store.read();
			const found: Record<string, UserProfile> = {};

			for (const id of ids) {
				const user = document.users[id];

				if (user) {
					found[id] = user;
				}
			}

			return found;
		},

		updateUser(id, edit: ProfileEdit) {
			return store.write((document) => {
				const user = document.users[id];

				if (!user) {
					throw new Error(`No such user: ${id}`);
				}

				// Only the fields a person owns, and only when actually supplied.
				if (edit.username !== undefined) {
					user.username = edit.username.trim().slice(0, 60);
				}

				if (edit.firstName !== undefined) {
					user.firstName = edit.firstName.trim().slice(0, 60);
				}

				if (edit.lastName !== undefined) {
					user.lastName = edit.lastName.trim().slice(0, 60);
				}

				user.updatedAt = new Date().toISOString();

				return user;
			});
		},

		createGroup(ownerId, name) {
			return store.write((document) => {
				const now = new Date().toISOString();
				const group: Group = {
					id: randomUUID(),
					name: name.trim().slice(0, 80) || "Untitled group",
					ownerId,
					createdAt: now,
				};

				document.groups[group.id] = group;

				// The creator is a member from the start, so a group is never
				// left in a state where nobody can see it.
				document.memberships[membershipKey(group.id, ownerId)] = {
					groupId: group.id,
					userId: ownerId,
					role: "owner",
					joinedAt: now,
				};

				return group;
			});
		},

		async listGroupsForUser(userId) {
			const document = await store.read();

			return Object.values(document.memberships)
				.filter((membership) => membership.userId === userId)
				.map((membership) => ({
					group: document.groups[membership.groupId],
					role: membership.role,
					memberCount: countMembers(document, membership.groupId),
				}))
				// A membership can outlive its group if a delete half-failed.
				.filter((entry) => Boolean(entry.group))
				.sort((left, right) => left.group.name.localeCompare(right.group.name));
		},

		async getGroup(groupId) {
			return (await store.read()).groups[groupId] ?? null;
		},

		async listMembers(groupId) {
			const document = await store.read();

			return Object.values(document.memberships)
				.filter((membership) => membership.groupId === groupId)
				.sort((left, right) => left.joinedAt.localeCompare(right.joinedAt));
		},

		addMember(groupId, userId, role: GroupRole = "member") {
			return store.write((document) => {
				const key = membershipKey(groupId, userId);
				const existing = document.memberships[key];

				if (existing) {
					return existing;
				}

				const membership: GroupMembership = {
					groupId,
					userId,
					role,
					joinedAt: new Date().toISOString(),
				};

				document.memberships[key] = membership;

				return membership;
			});
		},

		async removeMember(groupId, userId) {
			await store.write((document) => {
				const group = document.groups[groupId];

				// The owner stays, so a group cannot be orphaned.
				if (group && group.ownerId === userId) {
					throw new Error("A group's owner cannot be removed from it.");
				}

				delete document.memberships[membershipKey(groupId, userId)];
			});
		},

		async findUserByEmail(email) {
			const wanted = email.trim().toLowerCase();
			const document = await store.read();

			return Object.values(document.users).find((user) => user.email.toLowerCase() === wanted) ?? null;
		},

		saveDecklist(groupId, authorId, name, text) {
			return store.write((document) => {
				const decklist: GroupDecklist = {
					id: randomUUID(),
					groupId,
					name: name.trim().slice(0, 120) || "Untitled list",
					authorId,
					text,
					createdAt: new Date().toISOString(),
				};

				document.decklists[decklist.id] = decklist;

				return decklist;
			});
		},

		async listDecklists(groupId) {
			const document = await store.read();

			return Object.values(document.decklists)
				.filter((decklist) => decklist.groupId === groupId)
				.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
		},

		async deleteDecklist(groupId, decklistId) {
			await store.write((document) => {
				const decklist = document.decklists[decklistId];

				if (decklist && decklist.groupId === groupId) {
					delete document.decklists[decklistId];
				}
			});
		},
	};
}
