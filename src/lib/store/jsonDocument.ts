import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";

/**
 * A single JSON document on disk, read into memory and written atomically.
 *
 * The inventory store grew this pattern first; accounts and groups need exactly
 * the same thing, so it lives here rather than being copied. The rules are:
 *
 *  - The parsed document is cached, so reads do not hit the disk.
 *  - Writes are serialized through one promise chain, so two requests cannot
 *    interleave and lose each other's changes.
 *  - A write goes to a temporary file and is renamed over the original, so an
 *    interrupted write cannot leave a half-serialized document behind.
 *  - If a write fails the cache is dropped, so the next read re-reads whatever
 *    actually made it to disk rather than trusting memory.
 *
 * This is the local stand-in for a hosted database. It suits one person on one
 * machine and is honest about nothing more.
 */
export type JsonDocumentStore<T> = {
	/** Reads the document, loading it on first use. */
	read(): Promise<T>,
	/**
	 * Mutates the document with exclusive access and persists the result.
	 *
	 * @param mutate Receives the document to change in place, returns a result
	 */
	write<R>(mutate: (document: T) => R): Promise<R>,
}

export type JsonDocumentOptions<T> = {
	/** Absolute path of the file. */
	filePath: string,
	/** What an absent or unreadable file should start as. */
	empty: () => T,
}

/**
 * Creates a store for one JSON document.
 *
 * @param options Where the file lives and what an empty one looks like
 * @returns The store
 */
export function createJsonDocumentStore<T>(options: JsonDocumentOptions<T>): JsonDocumentStore<T> {
	const { filePath, empty } = options;

	let document: T | null = null;
	let queue: Promise<unknown> = Promise.resolve();

	async function load(): Promise<T> {
		if (document) {
			return document;
		}

		try {
			// The path is resolved at runtime, which the bundler cannot follow.
			// Left alone it assumes the worst and traces the entire project into
			// the server bundle, so the read is opted out of tracing.
			const raw = await readFile(/* turbopackIgnore: true */ filePath, "utf8");
			document = JSON.parse(raw) as T;
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;

			// A missing file simply means nothing has been written yet.
			if (code !== "ENOENT") {
				console.error(`Could not read ${filePath}, starting empty:`, error);
			}

			document = empty();
		}

		return document;
	}

	async function persist(next: T): Promise<void> {
		const temporaryPath = `${filePath}.tmp`;

		await mkdir(path.dirname(filePath), { recursive: true });
		await writeFile(temporaryPath, JSON.stringify(next, null, "\t"), "utf8");
		await rename(temporaryPath, filePath);
	}

	return {
		read: load,

		write<R>(mutate: (document: T) => R): Promise<R> {
			const run = queue.then(async () => {
				const current = await load();
				const result = mutate(current);

				try {
					await persist(current);
				} catch (error) {
					document = null;
					throw error;
				}

				return result;
			});

			// Keep the chain alive even when a caller's write rejects.
			queue = run.catch(() => undefined);

			return run;
		},
	};
}
