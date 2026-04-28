import { browser } from '$app/environment';
import {
	CATALOG,
	CATALOG_BY_ID,
	DEMO_MEMBERS,
	DEMO_PROFILES,
	DEMO_SETTINGS,
	DEMO_USER,
	POPULAR_IDS,
	SEEDED_LIBRARY_IDS,
	SEEDED_PROGRESS,
	SEEDED_SEASON_NUMBERS,
	TRENDING_IDS,
} from '$lib/demo/catalog';
import { slugify } from '$lib/demo/utils';
import type {
	BrowseItem,
	DemoInvitation,
	DemoMember,
	DemoProfile,
	DemoSettings,
	DemoState,
	Media,
	SeasonWithEpisodes,
} from '$lib/types';

const STORAGE_KEY = 'plank-demo-state';

function cloneState<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function fakeInfohash(seed: string) {
	return seed
		.replace(/[^a-z0-9]/gi, '')
		.slice(0, 32)
		.padEnd(32, '0');
}

function runtimeToFileSize(minutes: number | null, multiplier = 18_000_000) {
	return Math.max((minutes ?? 100) * multiplier, 650_000_000);
}

function getCatalogEntry(id: string) {
	return CATALOG_BY_ID[id] ?? null;
}

function createMediaFromBrowse(item: BrowseItem, profileId: string | null): Media {
	const now = new Date().toISOString();
	const infohash = fakeInfohash(item.id);

	return {
		id: item.id,
		profileId,
		type: item.mediaType,
		title: item.title,
		overview: item.overview,
		year: item.year,
		tmdbId: item.tmdbId,
		imdbId: item.imdbId,
		runtime: item.runtime,
		originalLanguage: item.originalLanguage,
		addedAt: now,
		createdAt: now,
		posterUrl: item.posterUrl,
		backdropUrl: item.backdropUrl,
		genres: item.genres,
		certification: item.certification,
		totalSeasons: item.totalSeasons,
		parentId: null,
		seasonId: null,
		episodeNumber: null,
		seasonNumber: null,
		displayOrder: null,
		stillPath: null,
		airDate: null,
		magnetLink: `magnet:?xt=urn:btih:${infohash}&dn=${encodeURIComponent(item.title)}`,
		infohash,
		status: 'complete',
		progress: 100,
		filePath: `/demo/library/${slugify(item.title)}`,
		fileSize: runtimeToFileSize(item.runtime, item.mediaType === 'movie' ? 18_000_000 : 12_000_000),
		fileIndex: 0,
		downloadedBytes: runtimeToFileSize(item.runtime, item.mediaType === 'movie' ? 18_000_000 : 12_000_000),
		playPosition: 0,
		playDuration: item.runtime ? item.runtime * 60 : null,
		lastPlayedAt: null,
	};
}

function createEpisode(show: Media, season: SeasonWithEpisodes, episodeNumber: number): Media {
	const now = new Date().toISOString();
	const title = `${show.title} S${season.seasonNumber}E${episodeNumber}`;
	const infohash = fakeInfohash(`${show.id}-${season.seasonNumber}-${episodeNumber}`);

	return {
		id: `${show.id}-s${season.seasonNumber}e${episodeNumber}`,
		profileId: show.profileId,
		type: 'episode',
		title,
		overview: `Episode ${episodeNumber} from ${show.title}.`,
		year: show.year,
		tmdbId: show.tmdbId,
		imdbId: show.imdbId,
		runtime: Math.max(show.runtime ?? 45, 24),
		originalLanguage: show.originalLanguage,
		addedAt: now,
		createdAt: now,
		posterUrl: show.posterUrl,
		backdropUrl: show.backdropUrl,
		genres: show.genres,
		certification: show.certification,
		totalSeasons: null,
		parentId: show.id,
		seasonId: season.id,
		episodeNumber,
		seasonNumber: season.seasonNumber,
		displayOrder: episodeNumber,
		stillPath: show.backdropUrl,
		airDate: season.airDate,
		magnetLink: `magnet:?xt=urn:btih:${infohash}&dn=${encodeURIComponent(title)}`,
		infohash,
		status: 'complete',
		progress: 100,
		filePath: `/demo/library/${slugify(show.title)}/season-${season.seasonNumber}/episode-${episodeNumber}.mp4`,
		fileSize: runtimeToFileSize(show.runtime, 7_000_000),
		fileIndex: 0,
		downloadedBytes: runtimeToFileSize(show.runtime, 7_000_000),
		playPosition: 0,
		playDuration: Math.max(show.runtime ?? 45, 24) * 60,
		lastPlayedAt: null,
	};
}

function createSeasonSet(show: Media, seasonNumbers?: number[]) {
	const entry = getCatalogEntry(show.id);
	const source = entry?.availableSeasons ?? [
		{
			seasonNumber: 1,
			name: 'Season 1',
			episodeCount: 8,
			year: show.year ?? new Date().getFullYear(),
			posterPath: show.posterUrl ?? undefined,
			overview: show.overview,
			airDate: show.airDate,
		},
	];
	const picked = seasonNumbers?.length
		? source.filter((season) => seasonNumbers.includes(season.seasonNumber))
		: source.slice(0, Math.min(2, source.length));

	return Object.fromEntries(
		picked.map((summary) => {
			const now = new Date().toISOString();
			const season: SeasonWithEpisodes = {
				id: `${show.id}-season-${summary.seasonNumber}`,
				mediaId: show.id,
				seasonNumber: summary.seasonNumber,
				name: summary.name,
				overview: summary.overview ?? show.overview,
				posterPath: summary.posterPath ?? show.posterUrl,
				airDate: summary.airDate ?? null,
				episodeCount: summary.episodeCount,
				createdAt: now,
				episodes: [],
			};

			season.episodes = Array.from({ length: summary.episodeCount }, (_, index) =>
				createEpisode(show, season, index + 1)
			);

			return [season.id, season] as const;
		})
	);
}

function seedProfileLibrary(profileId: string) {
	const ids = SEEDED_LIBRARY_IDS[profileId] ?? [];
	const library = ids.map((id) => createMediaFromBrowse(CATALOG_BY_ID[id], profileId));
	const seasons = Object.fromEntries(
		library
			.filter((item) => item.type === 'show')
			.map((show) => [show.id, Object.values(createSeasonSet(show, SEEDED_SEASON_NUMBERS[show.id] ?? [1]))])
	);

	for (const media of library) {
		const seeded = SEEDED_PROGRESS[media.id];
		if (seeded) {
			media.playPosition = seeded.playPosition;
			media.playDuration = seeded.playDuration;
			media.lastPlayedAt = '2026-04-27T10:30:00.000Z';
		}
	}

	return { library, seasons };
}

function createInitialState(): DemoState {
	const profiles = cloneState(DEMO_PROFILES);
	const members = cloneState(DEMO_MEMBERS);
	const libraries: Record<string, Media[]> = {};
	const seasons: Record<string, Record<string, SeasonWithEpisodes[]>> = {};

	for (const profile of profiles) {
		const seeded = seedProfileLibrary(profile.id);
		libraries[profile.id] = seeded.library;
		seasons[profile.id] = seeded.seasons;
	}

	return {
		user: cloneState(DEMO_USER),
		activeProfileId: null,
		profiles,
		members,
		invitations: [
			{
				id: 'invite-demo-1',
				email: 'friend@plank.dev',
				profileId: 'profile-captain',
				profileName: DEMO_PROFILES[0]?.name ?? 'Dread Pirate Roberts',
				status: 'pending',
				createdAt: '2026-04-25T16:30:00.000Z',
			},
		],
		settings: cloneState(DEMO_SETTINGS),
		libraries,
		seasons,
	};
}

function mediaMatchesQuery(media: Media, query: string) {
	const lower = query.toLowerCase();
	return [media.title, media.overview ?? '', media.year ? String(media.year) : ''].some((field) =>
		field.toLowerCase().includes(lower)
	);
}

class DemoStore {
	initialized = $state(false);
	state = $state<DemoState>(createInitialState());

	init() {
		if (!browser || this.initialized) {
			return;
		}

		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved) {
			try {
				this.state = JSON.parse(saved) as DemoState;
			} catch {
				this.state = createInitialState();
			}
		}

		this.initialized = true;
		this.persist();
	}

	persist() {
		if (browser && this.initialized) {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
		}
	}

	get user() {
		return this.state.user;
	}

	get profiles() {
		return this.state.profiles;
	}

	get activeProfileId() {
		return this.state.activeProfileId ?? null;
	}

	get activeProfile() {
		return this.state.profiles.find((profile) => profile.id === this.activeProfileId) ?? null;
	}

	get library() {
		return this.activeProfileId ? (this.state.libraries[this.activeProfileId] ?? []) : [];
	}

	get movies() {
		return this.library.filter((media) => media.type === 'movie');
	}

	get shows() {
		return this.library.filter((media) => media.type === 'show');
	}

	get continueWatching() {
		const profileSeasons = this.activeProfileId ? (this.state.seasons[this.activeProfileId] ?? {}) : {};
		return [...this.library]
			.filter((media) => {
				if ((media.playPosition ?? 0) <= 0) {
					return false;
				}

				if (media.type === 'show') {
					return (profileSeasons[media.id]?.length ?? 0) > 0;
				}

				return true;
			})
			.sort((a, b) => new Date(b.lastPlayedAt ?? 0).getTime() - new Date(a.lastPlayedAt ?? 0).getTime())
			.slice(0, 12);
	}

	get settings() {
		return this.state.settings;
	}

	get browseTrending() {
		return TRENDING_IDS.map((id) => CATALOG_BY_ID[id]);
	}

	get browsePopular() {
		return POPULAR_IDS.map((id) => CATALOG_BY_ID[id]);
	}

	setActiveProfile(profileId: string | null) {
		this.state.activeProfileId = profileId;
		this.persist();
	}

	listBrowse(type: 'trending' | 'popular', filter: 'all' | 'movie' | 'show') {
		const source = type === 'trending' ? this.browseTrending : this.browsePopular;
		return filter === 'all' ? source : source.filter((item) => item.mediaType === filter);
	}

	hasInLibrary(id: string) {
		return this.library.some((item) => item.id === id);
	}

	addFromBrowse(item: BrowseItem, seasonNumber?: number) {
		if (!this.activeProfileId) {
			return null;
		}

		const library = this.state.libraries[this.activeProfileId] ?? [];
		const existing = library.find((media) => media.id === item.id);

		if (!existing) {
			const created = createMediaFromBrowse(item, this.activeProfileId);
			this.state.libraries[this.activeProfileId] = [created, ...library];

			if (item.mediaType === 'show') {
				this.state.seasons[this.activeProfileId] ??= {};
				this.state.seasons[this.activeProfileId][created.id] = Object.values(
					createSeasonSet(created, seasonNumber ? [seasonNumber] : [1])
				);
			}

			this.persist();
			return created;
		}

		if (existing.type === 'show' && seasonNumber) {
			this.state.seasons[this.activeProfileId] ??= {};
			const existingSeasons = this.state.seasons[this.activeProfileId][existing.id] ?? [];
			if (!existingSeasons.some((season) => season.seasonNumber === seasonNumber)) {
				const extra = Object.values(createSeasonSet(existing, [seasonNumber]));
				this.state.seasons[this.activeProfileId][existing.id] = [...existingSeasons, ...extra].sort(
					(a, b) => a.seasonNumber - b.seasonNumber
				);
				this.persist();
			}
		}

		return existing;
	}

	removeMedia(id: string) {
		if (!this.activeProfileId) {
			return;
		}

		this.state.libraries[this.activeProfileId] = this.library.filter((media) => media.id !== id);
		delete this.state.seasons[this.activeProfileId]?.[id];
		this.persist();
	}

	findMedia(id: string) {
		const direct = this.library.find((media) => media.id === id);
		if (direct) {
			return direct;
		}

		const seasons = this.activeProfileId
			? Object.values(this.state.seasons[this.activeProfileId] ?? {}).flat()
			: [];
		const episode = seasons.flatMap((season) => season.episodes).find((item) => item.id === id);
		if (episode) {
			return episode;
		}

		const entry = getCatalogEntry(id);
		return entry ? createMediaFromBrowse(entry, this.activeProfileId) : null;
	}

	getShowSeasons(showId: string) {
		const active = this.activeProfileId ? this.state.seasons[this.activeProfileId]?.[showId] : undefined;
		if (active?.length) {
			return active;
		}

		const show = this.findMedia(showId);
		if (!show || show.type !== 'show') {
			return [];
		}

		return Object.values(createSeasonSet(show));
	}

	searchLibrary(query: string) {
		if (query.trim().length < 2) {
			return [];
		}
		return this.library.filter((media) => mediaMatchesQuery(media, query.trim()));
	}

	searchBrowse(query: string) {
		if (query.trim().length < 2) {
			return [];
		}
		return CATALOG.filter((item) =>
			mediaMatchesQuery(createMediaFromBrowse(item, this.activeProfileId), query.trim())
		);
	}

	updateUser(updates: Partial<{ name: string; email: string; image: string | null }>) {
		if (updates.name !== undefined) {
			this.state.user.name = updates.name;
		}
		if (updates.email !== undefined) {
			this.state.user.email = updates.email;
		}
		if (updates.image !== undefined) {
			this.state.user.image = updates.image;
		}
		this.persist();
	}

	updateSettings(updates: Partial<DemoSettings>) {
		this.state.settings = { ...this.state.settings, ...updates };
		this.persist();
	}

	createProfile(name: string) {
		const trimmed = name.trim();
		if (!trimmed) {
			return null;
		}

		const profile: DemoProfile = {
			id: `profile-${slugify(trimmed)}-${Date.now()}`,
			name: trimmed,
			logo: null,
			color: '#a855f7',
			isMember: true,
			memberCount: 1,
			createdAt: new Date().toISOString(),
		};

		this.state.profiles = [...this.state.profiles, profile];
		this.state.members[profile.id] = [
			{
				id: 'member-owner',
				name: this.state.user.name,
				email: this.state.user.email,
				role: 'owner',
				image: this.state.user.image,
			},
		];
		this.state.libraries[profile.id] = [];
		this.state.seasons[profile.id] = {};
		this.persist();
		return profile;
	}

	updateProfile(profileId: string, updates: Partial<DemoProfile>) {
		this.state.profiles = this.state.profiles.map((profile) =>
			profile.id === profileId ? { ...profile, ...updates } : profile
		);
		this.persist();
	}

	deleteProfile(profileId: string) {
		if (this.state.profiles.length <= 1) {
			return false;
		}

		this.state.profiles = this.state.profiles.filter((profile) => profile.id !== profileId);
		delete this.state.members[profileId];
		delete this.state.libraries[profileId];
		delete this.state.seasons[profileId];
		this.state.invitations = this.state.invitations.filter((invite) => invite.profileId !== profileId);
		if (this.activeProfileId === profileId) {
			this.setActiveProfile(this.state.profiles[0]?.id ?? null);
		}
		this.persist();
		return true;
	}

	getMembers(profileId = this.activeProfileId) {
		return profileId ? (this.state.members[profileId] ?? []) : [];
	}

	updateMemberRole(profileId: string, memberId: string, role: DemoMember['role']) {
		this.state.members[profileId] = (this.state.members[profileId] ?? []).map((member) =>
			member.id === memberId ? { ...member, role } : member
		);
		this.persist();
	}

	createInvitation(email: string) {
		if (!(this.activeProfileId && email.trim())) {
			return null;
		}

		const invitation: DemoInvitation = {
			id: `invite-${Date.now()}`,
			email: email.trim(),
			profileId: this.activeProfileId,
			profileName: this.activeProfile?.name ?? 'Profile',
			status: 'pending',
			createdAt: new Date().toISOString(),
		};

		this.state.invitations = [invitation, ...this.state.invitations];
		this.persist();
		return invitation;
	}

	getInvitations(profileId = this.activeProfileId) {
		return profileId
			? this.state.invitations.filter((invite) => invite.profileId === profileId)
			: this.state.invitations;
	}

	acceptInvitation(id: string) {
		this.state.invitations = this.state.invitations.map((invite) =>
			invite.id === id ? { ...invite, status: 'accepted' } : invite
		);
		this.persist();
	}

	markPlayed(id: string) {
		const media = this.findMedia(id);
		if (!(media && this.activeProfileId)) {
			return;
		}

		const position = Math.max(Math.round((media.playDuration ?? 3600) * 0.22), 240);
		const targetId = media.type === 'episode' ? media.parentId : media.id;

		this.state.libraries[this.activeProfileId] = this.library.map((item) =>
			item.id === targetId
				? {
						...item,
						playPosition: position,
						playDuration: media.playDuration ?? item.playDuration,
						lastPlayedAt: new Date().toISOString(),
					}
				: item
		);
		this.persist();
	}

	getStats(profileId = this.activeProfileId) {
		const library = profileId ? (this.state.libraries[profileId] ?? []) : [];
		const totalSize = library.reduce((sum, item) => sum + (item.fileSize ?? 0), 0);
		const errorCount = library.filter((item) => item.status === 'error').length;
		return {
			totalMedia: library.length,
			totalSize,
			errorCount,
		};
	}
}

export const demoStore = new DemoStore();
