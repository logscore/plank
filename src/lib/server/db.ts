import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { MediaType } from '$lib/types';
import { db } from './db/index';
import {
	type Episode,
	episodes as episodesTable,
	type Media,
	media as mediaTable,
	type NewEpisode,
	type NewMedia,
	type NewSeason,
	type Season,
	seasons as seasonsTable,
} from './db/schema';

// =============================================================================
// Media operations (unified movies/tv shows)
// =============================================================================

export const mediaDb = {
	/**
	 * List media by type for a user
	 */
	list(userId: string, type?: MediaType): Media[] {
		if (type) {
			return db
				.select()
				.from(mediaTable)
				.where(and(eq(mediaTable.userId, userId), eq(mediaTable.type, type)))
				.orderBy(desc(mediaTable.addedAt))
				.all();
		}
		return db
			.select()
			.from(mediaTable)
			.where(eq(mediaTable.userId, userId))
			.orderBy(desc(mediaTable.addedAt))
			.all();
	},

	/**
	 * Get all media with incomplete download status (for recovery on startup)
	 */
	getIncompleteDownloads(): Media[] {
		return db
			.select()
			.from(mediaTable)
			.where(sql`${mediaTable.status} IN ('downloading', 'added')`)
			.all();
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
	 * Create new media entry
	 */
	create(
		mediaItem: Omit<NewMedia, 'id' | 'addedAt' | 'status' | 'progress'> & { type?: MediaType }
	): Media {
		const id = crypto.randomUUID();
		const now = new Date();

		const newMedia: NewMedia = {
			id,
			userId: mediaItem.userId,
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
	updateProgress(
		id: string,
		progress: number,
		status: 'added' | 'downloading' | 'complete' | 'error'
	) {
		db.update(mediaTable).set({ progress, status }).where(eq(mediaTable.id, id)).run();
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
	 * Get episode by season and episode number
	 */
	getBySeasonAndNumber(seasonId: string, episodeNumber: number): Episode | undefined {
		return db
			.select()
			.from(episodesTable)
			.where(
				and(eq(episodesTable.seasonId, seasonId), eq(episodesTable.episodeNumber, episodeNumber))
			)
			.get();
	},

	/**
	 * Update episode file info
	 */
	updateFileInfo(id: string, fileIndex: number, filePath: string, fileSize: number) {
		db.update(episodesTable)
			.set({ fileIndex, filePath, fileSize })
			.where(eq(episodesTable.id, id))
			.run();
	},

	/**
	 * Update episode download progress
	 */
	updateProgress(
		id: string,
		downloadedBytes: number,
		status: 'pending' | 'downloading' | 'complete' | 'error'
	) {
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
	 * Delete all episodes for a season
	 */
	deleteBySeasonId(seasonId: string) {
		db.delete(episodesTable).where(eq(episodesTable.seasonId, seasonId)).run();
	},
};

// =============================================================================
