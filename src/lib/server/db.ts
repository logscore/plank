import { and, asc, desc, eq, sql } from 'drizzle-orm';
import {
	type Download,
	downloads as downloadsTable,
	type Episode,
	episodes as episodesTable,
	type Media,
	media as mediaTable,
	type NewDownload,
	type NewEpisode,
	type NewMedia,
	type NewSeason,
	type Season,
	seasons as seasonsTable,
} from '$lib/server/db/schema';
import type { MediaType } from '$lib/types';
import { db } from './db/index';

// =============================================================================
// Media operations (unified movies/tv shows)
// =============================================================================

export const mediaDb = {
	/**
	 * List media by type for a user or organization
	 */
	list(userIdOrOrgId: string, type?: MediaType): Media[] {
		if (type) {
			return db
				.select()
				.from(mediaTable)
				.where(and(eq(mediaTable.organizationId, userIdOrOrgId), eq(mediaTable.type, type)))
				.orderBy(desc(mediaTable.addedAt))
				.all();
		}
		return db
			.select()
			.from(mediaTable)
			.where(eq(mediaTable.organizationId, userIdOrOrgId))
			.orderBy(desc(mediaTable.addedAt))
			.all();
	},

	/**
	 * Get all media items (system wide) for maintenance tasks
	 */
	getAll(): Media[] {
		return db.select().from(mediaTable).all();
	},

	/**
	 * Get all media with incomplete download status (for recovery on startup)
	 */
	getIncompleteDownloads(): Media[] {
		return db.select().from(mediaTable).where(sql`${mediaTable.status} IN ('downloading', 'added')`).all();
	},

	/**
	 * Get single media item by id and userId
	 */
	get(id: string, userId: string): Media | undefined {
		return db
			.select()
			.from(mediaTable)
			.where(and(eq(mediaTable.id, id), eq(mediaTable.userId, userId)))
			.get();
	},

	/**
	 * Get media by infohash for a user (check duplicates)
	 */
	getByInfohash(infohash: string, userId: string): Media | undefined {
		return db
			.select()
			.from(mediaTable)
			.where(and(eq(mediaTable.infohash, infohash), eq(mediaTable.userId, userId)))
			.get();
	},

	/**
	 * Get media by ID only (for internal server use, e.g., during download)
	 */
	getById(id: string): Media | undefined {
		return db.select().from(mediaTable).where(eq(mediaTable.id, id)).get();
	},

	/**
	 * Get TV show by TMDB ID for a user (for merging seasons)
	 */
	getByTmdbId(tmdbId: number, userId: string, type: MediaType = 'tv'): Media | undefined {
		return db
			.select()
			.from(mediaTable)
			.where(and(eq(mediaTable.tmdbId, tmdbId), eq(mediaTable.userId, userId), eq(mediaTable.type, type)))
			.get();
	},

	/**
	 * Create new media entry
	 */
	create(mediaItem: Omit<NewMedia, 'id' | 'addedAt' | 'status' | 'progress'> & { type?: MediaType }): Media {
		const id = crypto.randomUUID();
		const now = new Date();

		const newMedia: NewMedia = {
			id,
			userId: mediaItem.userId,
			organizationId: mediaItem.organizationId,
			type: mediaItem.type || 'movie',
			title: mediaItem.title,
			year: mediaItem.year,
			posterUrl: mediaItem.posterUrl,
			backdropUrl: mediaItem.backdropUrl,
			overview: mediaItem.overview,
			magnetLink: mediaItem.magnetLink,
			infohash: mediaItem.infohash,
			tmdbId: mediaItem.tmdbId,
			runtime: mediaItem.runtime,
			genres: mediaItem.genres,
			originalLanguage: mediaItem.originalLanguage,
			certification: mediaItem.certification,
			totalSeasons: mediaItem.totalSeasons,
			status: 'added',
			progress: 0,
			addedAt: now,
		};

		db.insert(mediaTable).values(newMedia).run();

		return {
			...newMedia,
			filePath: null,
			fileSize: null,
			lastPlayedAt: null,
		} as Media;
	},

	/**
	 * Update download progress
	 */
	updateProgress(id: string, progress: number, status: 'added' | 'downloading' | 'complete' | 'error') {
		db.update(mediaTable).set({ progress, status }).where(eq(mediaTable.id, id)).run();
	},
	/**
	 * Reset download status and clear file info
	 */
	resetDownload(id: string) {
		db.update(mediaTable)
			.set({
				progress: 0,
				status: 'added',
				filePath: null,
				fileSize: null,
			})
			.where(eq(mediaTable.id, id))
			.run();
	},

	/**
	 * Update file path after download
	 */
	updateFilePath(id: string, filePath: string, fileSize?: number) {
		db.update(mediaTable)
			.set({ filePath, fileSize: fileSize ?? null, status: 'complete' })
			.where(eq(mediaTable.id, id))
			.run();
	},

	/**
	 * Delete media item
	 */
	delete(id: string, userId: string) {
		db.delete(mediaTable)
			.where(and(eq(mediaTable.id, id), eq(mediaTable.userId, userId)))
			.run();
	},

	/**
	 * Update last played timestamp
	 */
	updateLastPlayed(id: string) {
		db.update(mediaTable).set({ lastPlayedAt: new Date() }).where(eq(mediaTable.id, id)).run();
	},

	/**
	 * Update media metadata
	 */
	updateMetadata(
		id: string,
		metadata: {
			title?: string;
			year?: number | null;
			posterUrl?: string | null;
			backdropUrl?: string | null;
			overview?: string | null;
			tmdbId?: number | null;
			runtime?: number | null;
			genres?: string | null;
			originalLanguage?: string | null;
			certification?: string | null;
			totalSeasons?: number | null;
			type?: MediaType;
		}
	) {
		const updates: Record<string, unknown> = {};
		if (metadata.title !== undefined) {
			updates.title = metadata.title;
		}
		if (metadata.year !== undefined) {
			updates.year = metadata.year;
		}
		if (metadata.posterUrl !== undefined) {
			updates.posterUrl = metadata.posterUrl;
		}
		if (metadata.backdropUrl !== undefined) {
			updates.backdropUrl = metadata.backdropUrl;
		}
		if (metadata.overview !== undefined) {
			updates.overview = metadata.overview;
		}
		if (metadata.tmdbId !== undefined) {
			updates.tmdbId = metadata.tmdbId;
		}
		if (metadata.runtime !== undefined) {
			updates.runtime = metadata.runtime;
		}
		if (metadata.genres !== undefined) {
			updates.genres = metadata.genres;
		}
		if (metadata.originalLanguage !== undefined) {
			updates.originalLanguage = metadata.originalLanguage;
		}
		if (metadata.certification !== undefined) {
			updates.certification = metadata.certification;
		}
		if (metadata.totalSeasons !== undefined) {
			updates.totalSeasons = metadata.totalSeasons;
		}
		if (metadata.type !== undefined) {
			updates.type = metadata.type;
		}

		if (Object.keys(updates).length > 0) {
			db.update(mediaTable).set(updates).where(eq(mediaTable.id, id)).run();
		}
	},
};

// =============================================================================
// Season operations
// =============================================================================

export const seasonsDb = {
	/**
	 * Create a new season
	 */
	create(season: Omit<NewSeason, 'id' | 'createdAt'>): Season {
		const id = crypto.randomUUID();

		const newSeason: NewSeason = {
			id,
			mediaId: season.mediaId,
			seasonNumber: season.seasonNumber,
			name: season.name,
			overview: season.overview,
			posterPath: season.posterPath,
			airDate: season.airDate,
			episodeCount: season.episodeCount,
		};

		db.insert(seasonsTable).values(newSeason).run();

		return {
			...newSeason,
			createdAt: new Date(),
		} as Season;
	},

	/**
	 * Get all seasons for a media item
	 */
	getByMediaId(mediaId: string): Season[] {
		return db
			.select()
			.from(seasonsTable)
			.where(eq(seasonsTable.mediaId, mediaId))
			.orderBy(asc(seasonsTable.seasonNumber))
			.all();
	},

	/**
	 * Get single season by ID
	 */
	getById(id: string): Season | undefined {
		return db.select().from(seasonsTable).where(eq(seasonsTable.id, id)).get();
	},

	/**
	 * Get season by media and season number
	 */
	getByMediaAndNumber(mediaId: string, seasonNumber: number): Season | undefined {
		return db
			.select()
			.from(seasonsTable)
			.where(and(eq(seasonsTable.mediaId, mediaId), eq(seasonsTable.seasonNumber, seasonNumber)))
			.get();
	},

	/**
	 * Update episode count for a season
	 */
	updateEpisodeCount(id: string, count: number) {
		db.update(seasonsTable).set({ episodeCount: count }).where(eq(seasonsTable.id, id)).run();
	},

	/**
	 * Delete all seasons for a media item
	 */
	deleteByMediaId(mediaId: string) {
		db.delete(seasonsTable).where(eq(seasonsTable.mediaId, mediaId)).run();
	},
};

// =============================================================================
// Episode operations
// =============================================================================

export const episodesDb = {
	/**
	 * Create a new episode
	 */
	create(episode: Omit<NewEpisode, 'id' | 'createdAt'>): Episode {
		const id = crypto.randomUUID();

		const newEpisode: NewEpisode = {
			id,
			seasonId: episode.seasonId,
			downloadId: episode.downloadId,
			episodeNumber: episode.episodeNumber,
			title: episode.title,
			overview: episode.overview,
			stillPath: episode.stillPath,
			runtime: episode.runtime,
			airDate: episode.airDate,
			fileIndex: episode.fileIndex,
			filePath: episode.filePath,
			fileSize: episode.fileSize,
			downloadedBytes: episode.downloadedBytes,
			displayOrder: episode.displayOrder,
			status: episode.status || 'pending',
		};

		db.insert(episodesTable).values(newEpisode).run();

		return {
			...newEpisode,
			createdAt: new Date(),
		} as Episode;
	},

	/**
	 * Create multiple episodes at once
	 */
	createMany(episodeList: Omit<NewEpisode, 'id' | 'createdAt'>[]): Episode[] {
		const results: Episode[] = [];

		for (const episode of episodeList) {
			results.push(episodesDb.create(episode));
		}

		return results;
	},

	/**
	 * Get all episodes for a season
	 */
	getBySeasonId(seasonId: string): Episode[] {
		return db
			.select()
			.from(episodesTable)
			.where(eq(episodesTable.seasonId, seasonId))
			.orderBy(asc(episodesTable.displayOrder))
			.all();
	},

	/**
	 * Get single episode by ID
	 */
	getById(id: string): Episode | undefined {
		return db.select().from(episodesTable).where(eq(episodesTable.id, id)).get();
	},

	/**
	 * Get single episode by ID with season info
	 */
	getByIdWithSeason(id: string): { episode: Episode; season: Season } | undefined {
		return db
			.select({
				episode: episodesTable,
				season: seasonsTable,
			})
			.from(episodesTable)
			.innerJoin(seasonsTable, eq(episodesTable.seasonId, seasonsTable.id))
			.where(eq(episodesTable.id, id))
			.get();
	},

	/**
	 * Get episode by season and episode number
	 */
	getBySeasonAndNumber(seasonId: string, episodeNumber: number): Episode | undefined {
		return db
			.select()
			.from(episodesTable)
			.where(and(eq(episodesTable.seasonId, seasonId), eq(episodesTable.episodeNumber, episodeNumber)))
			.get();
	},

	/**
	 * Update episode file info
	 */
	updateFileInfo(id: string, fileIndex: number, filePath: string, fileSize: number) {
		db.update(episodesTable).set({ fileIndex, filePath, fileSize }).where(eq(episodesTable.id, id)).run();
	},

	/**
	 * Update episode download progress
	 */
	updateProgress(id: string, downloadedBytes: number, status: 'pending' | 'downloading' | 'complete' | 'error') {
		db.update(episodesTable).set({ downloadedBytes, status }).where(eq(episodesTable.id, id)).run();
	},

	/**
	 * Update episode display order (for manual reordering)
	 */
	updateDisplayOrder(id: string, displayOrder: number) {
		db.update(episodesTable).set({ displayOrder }).where(eq(episodesTable.id, id)).run();
	},

	/**
	 * Bulk update display orders
	 */
	bulkUpdateDisplayOrder(updates: { id: string; displayOrder: number }[]) {
		for (const { id, displayOrder } of updates) {
			db.update(episodesTable).set({ displayOrder }).where(eq(episodesTable.id, id)).run();
		}
	},

	/**
	 * Get all episodes for a media item (across all seasons)
	 */
	getByMediaId(mediaId: string): Array<{ episode: Episode; season: Season }> {
		return db
			.select({
				episode: episodesTable,
				season: seasonsTable,
			})
			.from(episodesTable)
			.innerJoin(seasonsTable, eq(episodesTable.seasonId, seasonsTable.id))
			.where(eq(seasonsTable.mediaId, mediaId))
			.orderBy(asc(seasonsTable.seasonNumber), asc(episodesTable.displayOrder))
			.all();
	},

	/**
	 * Get all episodes for a specific download (torrent)
	 */
	getByDownloadId(downloadId: string): Episode[] {
		return db
			.select()
			.from(episodesTable)
			.where(eq(episodesTable.downloadId, downloadId))
			.orderBy(asc(episodesTable.displayOrder))
			.all();
	},

	/**
	 * Delete all episodes for a season
	 */
	deleteBySeasonId(seasonId: string) {
		db.delete(episodesTable).where(eq(episodesTable.seasonId, seasonId)).run();
	},
};

// =============================================================================
// Download operations (for tracking multiple torrents per media)
// =============================================================================

export const downloadsDb = {
	/**
	 * Create a new download record
	 */
	create(download: Omit<NewDownload, 'id' | 'addedAt'>): Download {
		const id = crypto.randomUUID();
		const now = new Date();

		const newDownload: NewDownload = {
			id,
			mediaId: download.mediaId,
			magnetLink: download.magnetLink,
			infohash: download.infohash,
			status: download.status || 'added',
			progress: download.progress || 0,
			addedAt: now,
		};

		db.insert(downloadsTable).values(newDownload).run();

		return {
			...newDownload,
			addedAt: now,
		} as Download;
	},

	/**
	 * Get all downloads for a media item
	 */
	getByMediaId(mediaId: string): Download[] {
		return db
			.select()
			.from(downloadsTable)
			.where(eq(downloadsTable.mediaId, mediaId))
			.orderBy(desc(downloadsTable.addedAt))
			.all();
	},

	/**
	 * Get download by infohash for a media item
	 */
	getByInfohash(mediaId: string, infohash: string): Download | undefined {
		return db
			.select()
			.from(downloadsTable)
			.where(and(eq(downloadsTable.mediaId, mediaId), eq(downloadsTable.infohash, infohash)))
			.get();
	},

	/**
	 * Check if infohash exists for any media of a user
	 */
	infohashExistsForUser(infohash: string, userId: string): { download: Download; media: Media } | undefined {
		const result = db
			.select({
				download: downloadsTable,
				media: mediaTable,
			})
			.from(downloadsTable)
			.innerJoin(mediaTable, eq(downloadsTable.mediaId, mediaTable.id))
			.where(and(eq(downloadsTable.infohash, infohash), eq(mediaTable.userId, userId)))
			.get();
		return result;
	},

	/**
	 * Update download progress
	 */
	updateProgress(id: string, progress: number, status: 'added' | 'downloading' | 'complete' | 'error') {
		db.update(downloadsTable).set({ progress, status }).where(eq(downloadsTable.id, id)).run();
	},

	/**
	 * Get download by ID
	 */
	getById(id: string): Download | undefined {
		return db.select().from(downloadsTable).where(eq(downloadsTable.id, id)).get();
	},

	/**
	 * Delete download
	 */
	delete(id: string) {
		db.delete(downloadsTable).where(eq(downloadsTable.id, id)).run();
	},

	/**
	 * Delete all downloads for a media item
	 */
	deleteByMediaId(mediaId: string) {
		db.delete(downloadsTable).where(eq(downloadsTable.mediaId, mediaId)).run();
	},
};

// =============================================================================
