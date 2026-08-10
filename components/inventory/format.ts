/**
 * Small display helpers shared by the inventory components. ManaBox stores
 * these fields as machine values ("near_mint", "en"), which is what belongs in
 * storage, so the prettifying happens at the point of rendering.
 */

/**
 * Turns a snake_case machine value into a human readable label.
 *
 * @param value The stored value, e.g. "light_played"
 * @returns The label, e.g. "Light Played", or a dash when empty
 */
export function titleCase(value: string): string {
	if (!value || value === "unknown") {
		return "—";
	}

	return value
		.split(/[_\s-]+/)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

/**
 * Formats a whole number with thousands separators.
 *
 * Tolerates undefined so that a figure the API did not send renders as a dash
 * rather than taking the whole page down with it.
 *
 * @param value The number to format
 * @returns The formatted number, or a dash when there is nothing to show
 */
export function formatCount(value: number | undefined | null): string {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return "—";
	}

	return value.toLocaleString();
}

/**
 * Names a place cards are kept.
 *
 * Unfiled cards have no name, so they are described by their kind instead of
 * showing an empty cell.
 *
 * @param kind What sort of place it is
 * @param name The name of that place, possibly empty
 * @returns The label to show
 */
export function locationLabel(kind: string, name: string): string {
	return name.trim() || titleCase(kind);
}

/** Badge colors per location kind, so decks and binders read apart at a glance. */
const LOCATION_COLORS: Record<string, string> = {
	deck: "purple",
	binder: "blue",
	list: "teal",
	box: "orange",
	unassigned: "gray",
};

/**
 * Picks the badge color for a location kind.
 *
 * @param kind What sort of place it is
 * @returns A Chakra color scheme, defaulting to green for unknown kinds
 */
export function locationColorScheme(kind: string): string {
	return LOCATION_COLORS[kind.toLowerCase()] ?? "green";
}

/**
 * Formats an ISO timestamp for display.
 *
 * @param value The ISO 8601 timestamp, or null
 * @returns A locale formatted date and time, or "Never"
 */
export function formatTimestamp(value: string | null): string {
	if (!value) {
		return "Never";
	}

	const date = new Date(value);

	return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}
