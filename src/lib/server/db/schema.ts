import { sql } from "drizzle-orm";
import { type AnySQLiteColumn, index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// ============================================================================
// Auth tables
// ============================================================================

export const user = sqliteTable("user", {
	createdAt: integer("created_at", { mode: "timestamp_ms" })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.notNull(),
	email: text("email").notNull().unique(),
	emailVerified: integer("email_verified", { mode: "boolean" }).default(false).notNull(),
	id: text("id").primaryKey(),
	image: text("image"),
	name: text("name").notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});

export const session = sqliteTable(
	"session",
	{
		activeOrganizationId: text("active_organization_id"),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
		id: text("id").primaryKey(),
		ipAddress: text("ip_address"),
		token: text("token").notNull().unique(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
		userAgent: text("user_agent"),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
	},
	(table) => [index("session_userId_idx").on(table.userId)]
);

export const account = sqliteTable(
	"account",
	{
		accessToken: text("access_token"),
		accessTokenExpiresAt: integer("access_token_expires_at", {
			mode: "timestamp_ms",
		}),
		accountId: text("account_id").notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		id: text("id").primaryKey(),
		idToken: text("id_token"),
		password: text("password"),
		providerId: text("provider_id").notNull(),
		refreshToken: text("refresh_token"),
		refreshTokenExpiresAt: integer("refresh_token_expires_at", {
			mode: "timestamp_ms",
		}),
		scope: text("scope"),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
	},
	(table) => [index("account_userId_idx").on(table.userId)]
);

export const verification = sqliteTable(
	"verification",
	{
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
		id: text("id").primaryKey(),
		identifier: text("identifier").notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
		value: text("value").notNull(),
	},
	(table) => [index("verification_identifier_idx").on(table.identifier)]
);

export const organization = sqliteTable("organization", {
	createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	id: text("id").primaryKey(),
	logo: text("logo"),
	metadata: text("metadata"),
	name: text("name").notNull(),
	slug: text("slug").notNull().unique(),
});

export const member = sqliteTable(
	"member",
	{
		createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		role: text("role").default("member").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
	},
	(table) => [
		index("member_organizationId_idx").on(table.organizationId),
		index("member_userId_idx").on(table.userId),
	]
);

export const invitation = sqliteTable(
	"invitation",
	{
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		email: text("email").notNull(),
		expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
		id: text("id").primaryKey(),
		inviterId: text("inviter_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		role: text("role"),
		status: text("status").default("pending").notNull(),
	},
	(table) => [
		index("invitation_organizationId_idx").on(table.organizationId),
		index("invitation_email_idx").on(table.email),
	]
);

// ============================================================================
// Application tables
// ============================================================================

export const media = sqliteTable(
	"media",
	{
		addedAt: integer("added_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		airDate: text("air_date"),
		backdropUrl: text("backdrop_url"),
		certification: text("certification"),
		displayOrder: integer("display_order"),
		downloadedBytes: integer("downloaded_bytes").default(0),
		episodeNumber: integer("episode_number"),
		fileIndex: integer("file_index"),
		filePath: text("file_path"),
		fileSize: integer("file_size"),
		genres: text("genres"),
		id: text("id").primaryKey(),
		imdbId: text("imdb_id"),
		infohash: text("infohash"),
		lastPlayedAt: integer("last_played_at", { mode: "timestamp_ms" }),
		magnetLink: text("magnet_link"),
		organizationId: text("organization_id").references(() => organization.id, { onDelete: "set null" }),
		originalLanguage: text("original_language"),
		overview: text("overview"),
		parentId: text("parent_id").references((): AnySQLiteColumn => media.id, { onDelete: "cascade" }),
		playDuration: real("play_duration"),
		playPosition: real("play_position").default(0),
		posterUrl: text("poster_url"),
		progress: real("progress").default(0),
		runtime: integer("runtime"),
		seasonId: text("season_id").references((): AnySQLiteColumn => seasons.id, { onDelete: "cascade" }),
		seasonNumber: integer("season_number"),
		status: text("status", {
			enum: ["pending", "searching", "downloading", "complete", "error", "not_found", "removed"],
		}).default("pending"),
		stillPath: text("still_path"),
		title: text("title").notNull(),
		tmdbId: integer("tmdb_id"),
		totalSeasons: integer("total_seasons"),
		type: text("type", { enum: ["movie", "show", "episode"] })
			.default("movie")
			.notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		voteAverage: real("vote_average"),
		year: integer("year"),
	},
	(table) => [
		uniqueIndex("media_organization_infohash_unique")
			.on(table.organizationId, table.infohash)
			.where(sql`${table.infohash} IS NOT NULL`),
		index("idx_media_user").on(table.userId),
		index("idx_media_status").on(table.status).where(sql`${table.status} IS NOT NULL`),
		index("idx_media_library").on(table.organizationId, table.type).where(sql`${table.type} IN ('movie', 'show')`),
		index("idx_media_episodes")
			.on(table.parentId, table.seasonId, table.displayOrder)
			.where(sql`${table.type} = 'episode'`),
		index("idx_media_organization").on(table.organizationId),
		index("idx_media_watching").on(table.organizationId, table.lastPlayedAt).where(sql`${table.playPosition} > 0`),
	]
);

export const seasons = sqliteTable(
	"seasons",
	{
		episodeCount: integer("episode_count").default(0),
		id: text("id").primaryKey(),
		mediaId: text("media_id")
			.notNull()
			.references((): AnySQLiteColumn => media.id, { onDelete: "cascade" }),
		name: text("name"),
		seasonNumber: integer("season_number").notNull(),
	},
	(table) => [uniqueIndex("seasons_media_number_unique").on(table.mediaId, table.seasonNumber)]
);

export const downloads = sqliteTable(
	"downloads",
	{
		addedAt: integer("added_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		id: text("id").primaryKey(),
		infohash: text("infohash").notNull(),
		magnetLink: text("magnet_link").notNull(),
		mediaId: text("media_id")
			.notNull()
			.references(() => media.id, { onDelete: "cascade" }),
		progress: real("progress").default(0),
		status: text("status", { enum: ["added", "downloading", "complete", "error"] }).default("added"),
	},
	(table) => [
		uniqueIndex("downloads_media_infohash_unique").on(table.mediaId, table.infohash),
		index("idx_downloads_status").on(table.status),
	]
);

export const torrentCache = sqliteTable("torrent_cache", {
	imdbId: text("imdb_id").primaryKey(),
	infohash: text("infohash").notNull(),
	magnetLink: text("magnet_link").notNull(),
});

export const configuration = sqliteTable("configuration", {
	id: text("id")
		.primaryKey()
		.$default(() => "default"),
	opensubtitlesApiKey: text("opensubtitles_api_key"),
	opensubtitlesPassword: text("opensubtitles_password"),
	opensubtitlesUsername: text("opensubtitles_username"),
	prowlarrApiKey: text("prowlarr_api_key"),
	prowlarrMinSeeders: integer("prowlarr_min_seeders").default(5),
	prowlarrTrustedGroups: text("prowlarr_trusted_groups"), // JSON array
	prowlarrUrl: text("prowlarr_url"),
	tmdbApiKey: text("tmdb_api_key"),
});

export const subtitles = sqliteTable(
	"subtitles",
	{
		filePath: text("file_path"),
		id: text("id").primaryKey(),
		label: text("label").notNull(),
		language: text("language").notNull(),
		mediaId: text("media_id")
			.notNull()
			.references(() => media.id, { onDelete: "cascade" }),
		source: text("source", { enum: ["sidecar", "embedded", "opensubtitles", "manual"] }).notNull(),
	},
	(table) => [index("idx_subtitles_media").on(table.mediaId)]
);

// ============================================================================
// Type exports
// ============================================================================

export type Media = typeof media.$inferSelect;
export type NewMedia = typeof media.$inferInsert;
export type Season = typeof seasons.$inferSelect;
export type NewSeason = typeof seasons.$inferInsert;
export type Download = typeof downloads.$inferSelect;
export type NewDownload = typeof downloads.$inferInsert;
export type Subtitle = typeof subtitles.$inferSelect;
export type NewSubtitle = typeof subtitles.$inferInsert;

// ============================================================================
// Tables object for consolidated import
// ============================================================================

export const schema = {
	account,
	configuration,
	downloads,
	invitation,
	media,
	member,
	organization,
	seasons,
	session,
	subtitles,
	torrentCache,
	user,
	verification,
} as const;
