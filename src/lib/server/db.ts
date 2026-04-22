import { and, asc, desc, eq, sql } from 'drizzle-orm';
import {
	type Download,
	downloads as downloadsTable,
	type Media,
	media as mediaTable,
	type NewDownload,
	type NewMedia,
	type NewSeason,
	type NewSubtitle,
	type Season,
	type Subtitle,
	seasons as seasonsTable,
	subtitles as subtitlesTable,
} from '$lib/server/db/schema';
import type { MediaType } from '$lib/types';
import { db } from './db/index';

function removeUndefinedFromObject<T extends Record<string, unknown>>(obj: T): Partial<T> {
	return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined)) as Partial<T>;
}

export const mediaDb = {
	list(organizationId: string, type?: MediaType): Media[] {
		const conditions = [eq(mediaTable.organizationId, organizationId)];
		if (type) {
			conditions.push(eq(mediaTable.type, type));
		}
		return db
			.select()
			.from(mediaTable)
			.where(and(...conditions))
			.orderBy(desc(mediaTable.addedAt))
			.all();
	},

	getAll(): Media[] {
		return db.select().from(mediaTable).all();
	},

	getIncompleteDownloads(): Media[] {
		return db
			.select()
			.from(mediaTable)
			.where(sql`${mediaTable.status} IN ('pending', 'searching', 'downloading')`)
			.all();
	},

	get(id: string, organizationId: string): Media | undefined {
		return db
			.select()
			.from(mediaTable)
			.where(and(eq(mediaTable.id, id), eq(mediaTable.organizationId, organizationId)))
			.get();
	},

	getByInfohash(infohash: string, organizationId: string): Media | undefined {
		return db
			.select()
			.from(mediaTable)
			.where(and(eq(mediaTable.infohash, infohash), eq(mediaTable.organizationId, organizationId)))
			.get();
	},

	getById(id: string): Media | undefined {
		return db.select().from(mediaTable).where(eq(mediaTable.id, id)).get();
	},

	getByTmdbId(tmdbId: number, organizationId: string, type: MediaType): Media | undefined {
		return db
			.select()
			.from(mediaTable)
			.where(
				and(
					eq(mediaTable.tmdbId, tmdbId),
					eq(mediaTable.organizationId, organizationId),
					eq(mediaTable.type, type)
				)
			)
			.get();
	},

	create(mediaItem: Omit<NewMedia, 'id' | 'addedAt' | 'createdAt'> & { type?: MediaType }): Media {
		const id = crypto.randomUUID();
		const now = new Date();
		const type = mediaItem.type ?? 'movie';
		const newMedia: NewMedia = {
			id,
			userId: mediaItem.userId,
			organizationId: mediaItem.organizationId ?? null,
			type,
			title: mediaItem.title,
			overview: mediaItem.overview,
			year: mediaItem.year,
			tmdbId: mediaItem.tmdbId,
			imdbId: mediaItem.imdbId,
			runtime: mediaItem.runtime,
			originalLanguage: mediaItem.originalLanguage,
			addedAt: now,
			createdAt: now,
			posterUrl: mediaItem.posterUrl,
			backdropUrl: mediaItem.backdropUrl,
			genres: mediaItem.genres,
			certification: mediaItem.certification,
			totalSeasons: mediaItem.totalSeasons,
			parentId: mediaItem.parentId,
			seasonId: mediaItem.seasonId,
			episodeNumber: mediaItem.episodeNumber,
			seasonNumber: mediaItem.seasonNumber,
			displayOrder: mediaItem.displayOrder,
			stillPath: mediaItem.stillPath,
			airDate: mediaItem.airDate,
			magnetLink: mediaItem.magnetLink,
			infohash: mediaItem.infohash,
			status: mediaItem.status ?? (type === 'show' ? null : 'pending'),
			progress: mediaItem.progress ?? (type === 'show' ? null : 0),
			filePath: mediaItem.filePath,
			fileSize: mediaItem.fileSize,
			fileIndex: mediaItem.fileIndex,
			downloadedBytes: mediaItem.downloadedBytes ?? 0,
			lastPlayedAt: mediaItem.lastPlayedAt,
			playPosition: mediaItem.playPosition ?? 0,
			playDuration: mediaItem.playDuration,
		};
		db.insert(mediaTable).values(newMedia).run();
		return newMedia as Media;
	},

	update(id: string, data: Partial<Omit<NewMedia, 'id' | 'addedAt' | 'createdAt'>>) {
		const updates = removeUndefinedFromObject(data as Record<string, unknown>);
		if (Object.keys(updates).length === 0) {
			return;
		}
		db.update(mediaTable).set(updates).where(eq(mediaTable.id, id)).run();
	},

	updateProgress(
		id: string,
		progress: number,
		status: 'pending' | 'searching' | 'downloading' | 'complete' | 'error' | 'not_found' | 'removed'
	) {
		db.update(mediaTable).set({ progress, status }).where(eq(mediaTable.id, id)).run();
	},

	resetDownload(id: string) {
		db.update(mediaTable)
			.set({
				progress: 0,
				status: 'pending',
				filePath: null,
				fileSize: null,
				fileIndex: null,
				downloadedBytes: 0,
			})
			.where(eq(mediaTable.id, id))
			.run();
	},

	updateFilePath(id: string, filePath: string, fileSize?: number) {
		db.update(mediaTable)
			.set({ filePath, fileSize: fileSize ?? null, status: 'complete', progress: 1 })
			.where(eq(mediaTable.id, id))
			.run();
	},

	updateFileInfo(
		id: string,
		data: { fileIndex?: number | null; filePath?: string | null; fileSize?: number | null }
	) {
		const updates = removeUndefinedFromObject(data);
		if (Object.keys(updates).length === 0) {
			return;
		}
		db.update(mediaTable).set(updates).where(eq(mediaTable.id, id)).run();
	},

	updateEpisodeProgress(
		id: string,
		downloadedBytes: number,
		status: 'pending' | 'searching' | 'downloading' | 'complete' | 'error' | 'not_found' | 'removed'
	) {
		db.update(mediaTable).set({ downloadedBytes, status }).where(eq(mediaTable.id, id)).run();
	},

	markDownloadRemoved(id: string) {
		db.update(mediaTable)
			.set({
				progress: 0,
				status: 'removed',
				filePath: null,
				fileSize: null,
				fileIndex: null,
				downloadedBytes: 0,
			})
			.where(eq(mediaTable.id, id))
			.run();
	},

	updateDisplayOrder(id: string, displayOrder: number) {
		db.update(mediaTable).set({ displayOrder }).where(eq(mediaTable.id, id)).run();
	},

	bulkUpdateDisplayOrder(orders: Array<{ id: string; displayOrder: number }>) {
		for (const order of orders) {
			this.updateDisplayOrder(order.id, order.displayOrder);
		}
	},

	delete(id: string, organizationId: string) {
		db.delete(mediaTable)
			.where(and(eq(mediaTable.id, id), eq(mediaTable.organizationId, organizationId)))
			.run();
	},

	updateLastPlayed(id: string) {
		db.update(mediaTable).set({ lastPlayedAt: new Date() }).where(eq(mediaTable.id, id)).run();
	},

	updatePlayPosition(id: string, position: number, duration?: number) {
		const updates = removeUndefinedFromObject({ playPosition: position, playDuration: duration });
		db.update(mediaTable).set(updates).where(eq(mediaTable.id, id)).run();
	},

	getRecentlyWatched(organizationId: string, limit = 20): Media[] {
		return db
			.select()
			.from(mediaTable)
			.where(
				and(
					eq(mediaTable.organizationId, organizationId),
					sql`${mediaTable.type} IN ('movie', 'episode')`,
					sql`${mediaTable.lastPlayedAt} IS NOT NULL`,
					sql`${mediaTable.playPosition} > 0`,
					sql`(${mediaTable.playDuration} IS NULL OR ${mediaTable.playPosition} < ${mediaTable.playDuration} * 0.95)`
				)
			)
			.orderBy(desc(mediaTable.lastPlayedAt))
			.limit(limit)
			.all();
	},

	updateMetadata(
		id: string,
		metadata: {
			title?: string;
			year?: number | null;
			posterUrl?: string | null;
			backdropUrl?: string | null;
			overview?: string | null;
			tmdbId?: number | null;
			imdbId?: string | null;
			runtime?: number | null;
			genres?: string | null;
			originalLanguage?: string | null;
			certification?: string | null;
			totalSeasons?: number | null;
			type?: MediaType;
		}
	) {
		const updates = removeUndefinedFromObject(metadata as Record<string, unknown>);
		if (Object.keys(updates).length === 0) {
			return;
		}
		db.update(mediaTable).set(updates).where(eq(mediaTable.id, id)).run();
	},

	getEpisodesBySeasonId(seasonId: string): Media[] {
		return db
			.select()
			.from(mediaTable)
			.where(and(eq(mediaTable.type, 'episode'), eq(mediaTable.seasonId, seasonId)))
			.orderBy(asc(mediaTable.displayOrder), asc(mediaTable.episodeNumber))
			.all();
	},

	getEpisodesByParentId(parentId: string): Media[] {
		return db
			.select()
			.from(mediaTable)
			.where(and(eq(mediaTable.type, 'episode'), eq(mediaTable.parentId, parentId)))
			.orderBy(asc(mediaTable.seasonNumber), asc(mediaTable.displayOrder), asc(mediaTable.episodeNumber))
			.all();
	},

	getNextEpisodeById(id: string): Media | null {
		const mediaItem = this.getById(id);
		if (!mediaItem || mediaItem.type !== 'episode' || !mediaItem.parentId) {
			return null;
		}

		const episodes = this.getEpisodesByParentId(mediaItem.parentId);
		const currentIndex = episodes.findIndex((episode) => episode.id === mediaItem.id);
		if (currentIndex === -1) {
			return null;
		}

		return episodes[currentIndex + 1] ?? null;
	},

	getEpisodeBySeasonAndNumber(seasonId: string, episodeNumber: number): Media | undefined {
		return db
			.select()
			.from(mediaTable)
			.where(
				and(
					eq(mediaTable.type, 'episode'),
					eq(mediaTable.seasonId, seasonId),
					eq(mediaTable.episodeNumber, episodeNumber)
				)
			)
			.get();
	},

	getEpisodeByParentAndNumber(parentId: string, seasonNumber: number, episodeNumber: number): Media | undefined {
		return db
			.select()
			.from(mediaTable)
			.where(
				and(
					eq(mediaTable.type, 'episode'),
					eq(mediaTable.parentId, parentId),
					eq(mediaTable.seasonNumber, seasonNumber),
					eq(mediaTable.episodeNumber, episodeNumber)
				)
			)
			.get();
	},
};

export const seasonsDb = {
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
		return { ...newSeason, createdAt: new Date() } as Season;
	},

	getByMediaId(mediaId: string): Season[] {
		return db
			.select()
			.from(seasonsTable)
			.where(eq(seasonsTable.mediaId, mediaId))
			.orderBy(asc(seasonsTable.seasonNumber))
			.all();
	},

	getById(id: string): Season | undefined {
		return db.select().from(seasonsTable).where(eq(seasonsTable.id, id)).get();
	},

	getByMediaAndNumber(mediaId: string, seasonNumber: number): Season | undefined {
		return db
			.select()
			.from(seasonsTable)
			.where(and(eq(seasonsTable.mediaId, mediaId), eq(seasonsTable.seasonNumber, seasonNumber)))
			.get();
	},

	update(id: string, data: Partial<Omit<NewSeason, 'id' | 'createdAt'>>) {
		const updates = removeUndefinedFromObject(data as Record<string, unknown>);
		if (Object.keys(updates).length === 0) {
			return;
		}
		db.update(seasonsTable).set(updates).where(eq(seasonsTable.id, id)).run();
	},

	updateEpisodeCount(id: string, count: number) {
		db.update(seasonsTable).set({ episodeCount: count }).where(eq(seasonsTable.id, id)).run();
	},

	deleteByMediaId(mediaId: string) {
		db.delete(seasonsTable).where(eq(seasonsTable.mediaId, mediaId)).run();
	},
};

export const downloadsDb = {
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
		return { ...newDownload, addedAt: now } as Download;
	},

	getByMediaId(mediaId: string): Download[] {
		return db
			.select()
			.from(downloadsTable)
			.where(eq(downloadsTable.mediaId, mediaId))
			.orderBy(desc(downloadsTable.addedAt))
			.all();
	},

	getByInfohash(mediaId: string, infohash: string): Download | undefined {
		return db
			.select()
			.from(downloadsTable)
			.where(and(eq(downloadsTable.mediaId, mediaId), eq(downloadsTable.infohash, infohash)))
			.get();
	},

	infohashExistsForOrg(infohash: string, organizationId: string): { download: Download; media: Media } | undefined {
		return db
			.select({
				download: downloadsTable,
				media: mediaTable,
			})
			.from(downloadsTable)
			.innerJoin(mediaTable, eq(downloadsTable.mediaId, mediaTable.id))
			.where(and(eq(downloadsTable.infohash, infohash), eq(mediaTable.organizationId, organizationId)))
			.get();
	},

	updateProgress(id: string, progress: number, status: 'added' | 'downloading' | 'complete' | 'error') {
		db.update(downloadsTable).set({ progress, status }).where(eq(downloadsTable.id, id)).run();
	},

	getById(id: string): Download | undefined {
		return db.select().from(downloadsTable).where(eq(downloadsTable.id, id)).get();
	},

	delete(id: string) {
		db.delete(downloadsTable).where(eq(downloadsTable.id, id)).run();
	},

	deleteByMediaId(mediaId: string) {
		db.delete(downloadsTable).where(eq(downloadsTable.mediaId, mediaId)).run();
	},
};

export const subtitlesDb = {
	create(subtitle: Omit<NewSubtitle, 'id' | 'createdAt'>): Subtitle {
		const id = crypto.randomUUID();
		const newSubtitle: NewSubtitle = { id, ...subtitle };
		db.insert(subtitlesTable).values(newSubtitle).run();
		return { ...newSubtitle, createdAt: new Date() } as Subtitle;
	},

	getByMediaId(mediaId: string): Subtitle[] {
		return db.select().from(subtitlesTable).where(eq(subtitlesTable.mediaId, mediaId)).all();
	},

	getById(id: string): Subtitle | undefined {
		return db.select().from(subtitlesTable).where(eq(subtitlesTable.id, id)).get();
	},

	setDefault(id: string, mediaId: string, isDefault: boolean) {
		if (isDefault) {
			db.update(subtitlesTable).set({ isDefault: false }).where(eq(subtitlesTable.mediaId, mediaId)).run();
		}
		db.update(subtitlesTable).set({ isDefault }).where(eq(subtitlesTable.id, id)).run();
	},

	deleteById(id: string) {
		db.delete(subtitlesTable).where(eq(subtitlesTable.id, id)).run();
	},

	deleteByMediaId(mediaId: string) {
		db.delete(subtitlesTable).where(eq(subtitlesTable.mediaId, mediaId)).run();
	},
};
