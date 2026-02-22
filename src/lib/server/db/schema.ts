import { relations, sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// ============================================================================
// Auth tables
// ============================================================================

export const user = sqliteTable('user', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	emailVerified: integer('email_verified', { mode: 'boolean' }).default(false).notNull(),
	image: text('image'),
	role: text('role', { enum: ['admin', 'user'] })
		.default('user')
		.notNull(),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.$onUpdate(() => new Date())
		.notNull(),
});

export const organization = sqliteTable('organization', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	slug: text('slug').notNull().unique(),
	logo: text('logo'),
	color: text('color').default('#6366F1').notNull(),
	metadata: text('metadata'), // JSON
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.$onUpdate(() => new Date())
		.notNull(),
});

export const session = sqliteTable(
	'session',
	{
		id: text('id').primaryKey(),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
		token: text('token').notNull().unique(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.$onUpdate(() => new Date())
			.notNull(),
		ipAddress: text('ip_address'),
		userAgent: text('user_agent'),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		activeOrganizationId: text('active_organization_id').references(() => organization.id, {
			onDelete: 'set null',
		}),
	},
	(table) => [
		index('session_userId_idx').on(table.userId),
		index('session_active_organization_idx').on(table.activeOrganizationId),
	]
);

export const account = sqliteTable(
	'account',
	{
		id: text('id').primaryKey(),
		accountId: text('account_id').notNull(),
		providerId: text('provider_id').notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		accessToken: text('access_token'),
		refreshToken: text('refresh_token'),
		idToken: text('id_token'),
		accessTokenExpiresAt: integer('access_token_expires_at', {
			mode: 'timestamp_ms',
		}),
		refreshTokenExpiresAt: integer('refresh_token_expires_at', {
			mode: 'timestamp_ms',
		}),
		scope: text('scope'),
		password: text('password'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [index('account_userId_idx').on(table.userId)]
);

export const verification = sqliteTable(
	'verification',
	{
		id: text('id').primaryKey(),
		identifier: text('identifier').notNull(),
		value: text('value').notNull(),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [index('verification_identifier_idx').on(table.identifier)]
);

export const member = sqliteTable(
	'member',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		organizationId: text('organization_id')
			.notNull()
			.references(() => organization.id, { onDelete: 'cascade' }),
		role: text('role').notNull().default('member'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [uniqueIndex('member_user_organization_unique').on(table.userId, table.organizationId)]
);

export const invitation = sqliteTable('invitation', {
	id: text('id').primaryKey(),
	email: text('email').notNull(),
	inviterId: text('inviter_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	organizationId: text('organization_id')
		.notNull()
		.references(() => organization.id, { onDelete: 'cascade' }),
	role: text('role').notNull().default('member'),
	status: text('status').notNull().default('pending'),
	expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.$onUpdate(() => new Date())
		.notNull(),
});

// ============================================================================
// Application tables
// ============================================================================

export const media = sqliteTable(
	'media',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		organizationId: text('organization_id').references(() => organization.id, { onDelete: 'set null' }),
		type: text('type', { enum: ['movie', 'tv'] })
			.default('movie')
			.notNull(),
		title: text('title').notNull(),
		year: integer('year'),
		posterUrl: text('poster_url'),
		backdropUrl: text('backdrop_url'),
		overview: text('overview'),
		magnetLink: text('magnet_link').notNull(),
		infohash: text('infohash').notNull(),
		filePath: text('file_path'),
		fileSize: integer('file_size'),
		status: text('status', { enum: ['added', 'downloading', 'complete', 'error'] }).default('added'),
		progress: real('progress').default(0),
		tmdbId: integer('tmdb_id'),
		// Additional TMDB metadata
		runtime: integer('runtime'), // Runtime in minutes
		genres: text('genres'), // JSON array of genre names
		originalLanguage: text('original_language'),
		certification: text('certification'), // MPAA rating (G, PG, PG-13, R, NC-17)
		totalSeasons: integer('total_seasons'), // TV shows only
		addedAt: integer('added_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		lastPlayedAt: integer('last_played_at', { mode: 'timestamp_ms' }),
		playPosition: real('play_position').default(0),
		playDuration: real('play_duration'),
	},
	(table) => [
		uniqueIndex('media_user_infohash_unique').on(table.userId, table.infohash),
		index('idx_media_user').on(table.userId),
		index('idx_media_status').on(table.status),
		index('idx_media_type').on(table.userId, table.type),
		index('idx_media_organization').on(table.organizationId),
	]
);

export const seasons = sqliteTable(
	'seasons',
	{
		id: text('id').primaryKey(),
		mediaId: text('media_id')
			.notNull()
			.references(() => media.id, { onDelete: 'cascade' }),
		seasonNumber: integer('season_number').notNull(),
		name: text('name'),
		overview: text('overview'),
		posterPath: text('poster_path'),
		airDate: text('air_date'),
		episodeCount: integer('episode_count').default(0),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		uniqueIndex('seasons_media_number_unique').on(table.mediaId, table.seasonNumber),
		index('idx_seasons_media').on(table.mediaId),
	]
);

export const episodes = sqliteTable(
	'episodes',
	{
		id: text('id').primaryKey(),
		seasonId: text('season_id')
			.notNull()
			.references(() => seasons.id, { onDelete: 'cascade' }),
		downloadId: text('download_id'),
		episodeNumber: integer('episode_number').notNull(),
		title: text('title'),
		overview: text('overview'),
		stillPath: text('still_path'),
		runtime: integer('runtime'),
		airDate: text('air_date'),
		fileIndex: integer('file_index'),
		filePath: text('file_path'),
		fileSize: integer('file_size'),
		downloadedBytes: integer('downloaded_bytes').default(0),
		displayOrder: integer('display_order').notNull(),
		status: text('status', { enum: ['pending', 'downloading', 'complete', 'error'] }).default('pending'),
		playPosition: real('play_position').default(0),
		playDuration: real('play_duration'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		uniqueIndex('episodes_season_number_unique').on(table.seasonId, table.episodeNumber),
		index('idx_episodes_season').on(table.seasonId),
		index('idx_episodes_download').on(table.downloadId),
		index('idx_episodes_status').on(table.status),
		index('idx_episodes_display_order').on(table.seasonId, table.displayOrder),
	]
);

export const downloads = sqliteTable(
	'downloads',
	{
		id: text('id').primaryKey(),
		mediaId: text('media_id')
			.notNull()
			.references(() => media.id, { onDelete: 'cascade' }),
		magnetLink: text('magnet_link').notNull(),
		infohash: text('infohash').notNull(),
		status: text('status', { enum: ['added', 'downloading', 'complete', 'error'] }).default('added'),
		progress: real('progress').default(0),
		addedAt: integer('added_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		uniqueIndex('downloads_media_infohash_unique').on(table.mediaId, table.infohash),
		index('idx_downloads_media').on(table.mediaId),
		index('idx_downloads_status').on(table.status),
	]
);

export const torrentCache = sqliteTable(
	'torrent_cache',
	{
		id: text('id').primaryKey(),
		imdbId: text('imdb_id').notNull().unique(),
		tmdbId: integer('tmdb_id'),
		magnetLink: text('magnet_link').notNull(),
		infohash: text('infohash').notNull(),
		title: text('title').notNull(),
		quality: text('quality'), // e.g., "1080p", "2160p"
		releaseGroup: text('release_group'), // e.g., "YTS", "BONE"
		size: integer('size'), // Size in bytes
		seeders: integer('seeders'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [index('idx_torrent_cache_imdb').on(table.imdbId), index('idx_torrent_cache_tmdb').on(table.tmdbId)]
);

export const configuration = sqliteTable('configuration', {
	id: text('id')
		.primaryKey()
		.$default(() => 'default'),
	tmdbApiKey: text('tmdb_api_key'),
	tmdbLanguage: text('tmdb_language').default('en-US'),
	prowlarrUrl: text('prowlarr_url'),
	prowlarrApiKey: text('prowlarr_api_key'),
	prowlarrTrustedGroups: text('prowlarr_trusted_groups'), // JSON array
	prowlarrMinSeeders: integer('prowlarr_min_seeders').default(5),
	opensubtitlesApiKey: text('opensubtitles_api_key'),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
		.$onUpdate(() => new Date())
		.notNull()
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
});

export const subtitles = sqliteTable(
	'subtitles',
	{
		id: text('id').primaryKey(),
		mediaId: text('media_id')
			.notNull()
			.references(() => media.id, { onDelete: 'cascade' }),
		episodeId: text('episode_id').references(() => episodes.id, { onDelete: 'cascade' }),
		language: text('language').notNull(),
		label: text('label').notNull(),
		source: text('source', { enum: ['sidecar', 'embedded', 'opensubtitles', 'manual'] }).notNull(),
		format: text('format').default('vtt'),
		filePath: text('file_path'),
		streamIndex: integer('stream_index'),
		isDefault: integer('is_default', { mode: 'boolean' }).default(false),
		isForced: integer('is_forced', { mode: 'boolean' }).default(false),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [index('idx_subtitles_media').on(table.mediaId), index('idx_subtitles_episode').on(table.episodeId)]
);

// ============================================================================
// Relations (Defined after all tables to avoid hoisting issues)
// ============================================================================

export const userRelations = relations(user, ({ many }) => ({
	sessions: many(session),
	accounts: many(account),
	media: many(media),
	members: many(member),
	invitationsSent: many(invitation, { relationName: 'inviter' }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id],
	}),
	activeOrganization: one(organization, {
		fields: [session.activeOrganizationId],
		references: [organization.id],
	}),
}));

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id],
	}),
}));

export const organizationRelations = relations(organization, ({ many }) => ({
	members: many(member),
	invitations: many(invitation),
	media: many(media),
	sessions: many(session),
}));

export const memberRelations = relations(member, ({ one }) => ({
	user: one(user, {
		fields: [member.userId],
		references: [user.id],
	}),
	organization: one(organization, {
		fields: [member.organizationId],
		references: [organization.id],
	}),
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
	inviter: one(user, {
		fields: [invitation.inviterId],
		references: [user.id],
		relationName: 'inviter',
	}),
	organization: one(organization, {
		fields: [invitation.organizationId],
		references: [organization.id],
	}),
}));

export const mediaRelations = relations(media, ({ one, many }) => ({
	user: one(user, {
		fields: [media.userId],
		references: [user.id],
	}),
	organization: one(organization, {
		fields: [media.organizationId],
		references: [organization.id],
	}),
	seasons: many(seasons),
	downloads: many(downloads),
	subtitles: many(subtitles),
}));

export const seasonsRelations = relations(seasons, ({ one, many }) => ({
	media: one(media, {
		fields: [seasons.mediaId],
		references: [media.id],
	}),
	episodes: many(episodes),
}));

export const episodesRelations = relations(episodes, ({ one, many }) => ({
	season: one(seasons, {
		fields: [episodes.seasonId],
		references: [seasons.id],
	}),
	download: one(downloads, {
		fields: [episodes.downloadId],
		references: [downloads.id],
	}),
	subtitles: many(subtitles),
}));

export const downloadsRelations = relations(downloads, ({ one, many }) => ({
	media: one(media, {
		fields: [downloads.mediaId],
		references: [media.id],
	}),
	episodes: many(episodes),
}));

export const subtitlesRelations = relations(subtitles, ({ one }) => ({
	media: one(media, {
		fields: [subtitles.mediaId],
		references: [media.id],
	}),
	episode: one(episodes, {
		fields: [subtitles.episodeId],
		references: [episodes.id],
	}),
}));

// ============================================================================
// Type exports
// ============================================================================

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Session = typeof session.$inferSelect;
export type NewSession = typeof session.$inferInsert;
export type Account = typeof account.$inferSelect;
export type NewAccount = typeof account.$inferInsert;
export type Organization = typeof organization.$inferSelect;
export type NewOrganization = typeof organization.$inferInsert;
export type Member = typeof member.$inferSelect;
export type NewMember = typeof member.$inferInsert;
export type Invitation = typeof invitation.$inferSelect;
export type NewInvitation = typeof invitation.$inferInsert;
export type Media = typeof media.$inferSelect;
export type NewMedia = typeof media.$inferInsert;
export type Season = typeof seasons.$inferSelect;
export type NewSeason = typeof seasons.$inferInsert;
export type Episode = typeof episodes.$inferSelect;
export type NewEpisode = typeof episodes.$inferInsert;
export type Download = typeof downloads.$inferSelect;
export type NewDownload = typeof downloads.$inferInsert;
export type TorrentCache = typeof torrentCache.$inferSelect;
export type NewTorrentCache = typeof torrentCache.$inferInsert;
export type Subtitle = typeof subtitles.$inferSelect;
export type NewSubtitle = typeof subtitles.$inferInsert;

// ============================================================================
// Tables object for consolidated import
// ============================================================================

export const schema = {
	user,
	session,
	account,
	verification,
	organization,
	member,
	invitation,
	media,
	seasons,
	episodes,
	downloads,
	torrentCache,
	configuration,
	subtitles,
} as const;
