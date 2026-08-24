const STORAGE_KEY = "plank:search-history";
const MAX_ENTRIES = 8;
const MAX_QUERY_LENGTH = 100;

function readStoredEntries(): string[] {
	if (typeof localStorage === "undefined") {
		return [];
	}
	try {
		const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
		if (!Array.isArray(parsed)) {
			return [];
		}
		return parsed
			.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
			.slice(0, MAX_ENTRIES);
	} catch (cause) {
		console.error("Failed to read search history:", cause);
		return [];
	}
}

/** Recent search queries, newest first, persisted in localStorage. */
class SearchHistory {
	entries = $state(readStoredEntries());

	/** Moves a query to the front of the history. Blank queries are ignored. */
	record(query: string) {
		const trimmed = query.trim().slice(0, MAX_QUERY_LENGTH);
		if (!trimmed) {
			return;
		}
		const duplicate = trimmed.toLowerCase();
		this.entries = [trimmed, ...this.entries.filter((entry) => entry.toLowerCase() !== duplicate)].slice(
			0,
			MAX_ENTRIES
		);
		localStorage.setItem(STORAGE_KEY, JSON.stringify(this.entries));
	}

	clear() {
		this.entries = [];
		localStorage.removeItem(STORAGE_KEY);
	}
}

export const searchHistory = new SearchHistory();
