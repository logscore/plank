export function formatRuntime(minutes: number | null) {
	if (!minutes) {
		return 'Unknown runtime';
	}

	const hours = Math.floor(minutes / 60);
	const remaining = minutes % 60;

	if (!hours) {
		return `${remaining}m`;
	}

	return `${hours}h ${remaining}m`;
}

export function formatBytes(bytes: number | null) {
	if (!bytes) {
		return '0 B';
	}

	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	let value = bytes;
	let unitIndex = 0;

	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}

	return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function formatDate(value: string | null) {
	if (!value) {
		return 'Unknown';
	}

	return new Intl.DateTimeFormat('en', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	}).format(new Date(value));
}

export function slugify(value: string) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 40);
}
