/**
 * Generates a consistent numeric hash from a string.
 * Uses Math.imul for 32-bit integer multiplication (djb2 variant).
 * Used to deterministically select faces and colors for avatars.
 *
 * @param str - The input string to hash
 * @returns A positive integer hash
 */
export function stringHash(str: string): number {
	let hash = 5381;
	for (const char of str) {
		hash = Math.imul(33, hash) + char.charCodeAt(0);
	}
	return Math.abs(hash);
}
