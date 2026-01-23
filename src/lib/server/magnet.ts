import ptt from 'parse-torrent-title';

// Regex patterns at top level for performance
const INFOHASH_REGEX = /urn:btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/i;
const DISPLAY_NAME_REGEX = /[?&]dn=([^&]+)/i;

// Extract infohash from magnet link using regex (more reliable than parse-torrent for magnets)
function extractInfohash(magnetLink: string): string {
	// Match btih (BitTorrent Info Hash) in magnet link
	const match = magnetLink.match(INFOHASH_REGEX);
	if (match) {
		const hash = match[1];
		// Convert base32 to hex if necessary
		if (hash.length === 32) {
			const hex = base32ToHex(hash).toLowerCase();
			// console.log(`[Magnet] Converted base32 hash ${hash} to ${hex}`);
			return hex;
		}
		return hash.toLowerCase();
	}
	// console.log(`[Magnet] No infohash found in link: ${magnetLink.substring(0, 50)}...`);
	return '';
}

// Extract display name from magnet link
function extractDisplayName(magnetLink: string): string {
	const match = magnetLink.match(DISPLAY_NAME_REGEX);
	if (match) {
		return decodeURIComponent(match[1].replace(/\+/g, ' '));
	}
	return '';
}

// Convert base32 to hex
function base32ToHex(base32: string): string {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
	let bits = '';
	for (const char of base32.toUpperCase()) {
		const val = alphabet.indexOf(char);
		if (val === -1) {
			continue;
		}
		bits += val.toString(2).padStart(5, '0');
	}
	let hex = '';
	for (let i = 0; i < bits.length; i += 4) {
		hex += Number.parseInt(bits.substr(i, 4), 2).toString(16);
	}
	return hex;
}

export function parseMagnet(magnetLink: string) {
	const infohash = extractInfohash(magnetLink);
	const name = extractDisplayName(magnetLink);

	// Parse title from magnet name
	const titleInfo = ptt.parse(name);

	return {
		infohash,
		name,
		title: titleInfo.title || '',
		year: titleInfo.year,
	};
}
