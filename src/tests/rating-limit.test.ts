import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CATALOG_FILTERS } from "$lib/data/search";
import { allowedRatings, toRatingLimit } from "$lib/rating-limit";
import { isMediaAllowed } from "$lib/server/api-guard";
import { mediaDb } from "$lib/server/db";
import { schema } from "$lib/server/db/schema";
import {
	allowedMovieParams,
	filterAllowedTitles,
	getRatingLimit,
	listRatingLimits,
	setMemberRatingLimit,
} from "$lib/server/rating-limit";
import type { BrowseItem } from "$lib/server/tmdb";
import { POST as retryRoute } from "../routes/api/media/[id]/retry/+server";
import { PUT as uploadRoute } from "../routes/api/media/[id]/upload/+server";
import { db } from "./setup";

const { getBrowseItemDetailsMock, getCachedTorrentMock } = vi.hoisted(() => ({
	getBrowseItemDetailsMock: vi.fn(),
	getCachedTorrentMock: vi.fn(),
}));

vi.mock("$lib/server/tmdb", () => ({ getBrowseItemDetails: getBrowseItemDetailsMock }));
vi.mock("$lib/server/torrent-cache", () => ({ getCachedTorrent: getCachedTorrentMock }));

const org = { id: "family-org", name: "Family", slug: "family", createdAt: new Date() };
const people = [
	{ id: "owner", role: "owner" },
	{ id: "admin", role: "admin" },
	{ id: "teen", role: "member" },
	{ id: "kid", role: "member" },
] as const;
const PG = allowedRatings("PG");

function browseItem(tmdbId: number): BrowseItem {
	return {
		tmdbId,
		imdbId: null,
		title: `Title ${tmdbId}`,
		year: null,
		posterUrl: null,
		backdropUrl: null,
		overview: null,
		voteAverage: null,
		genres: [],
		mediaType: "movie",
		certification: null,
		needsResolve: true,
	};
}

beforeEach(() => {
	db.insert(schema.organization).values(org).run();
	for (const person of people) {
		db.insert(schema.user)
			.values({ id: person.id, name: person.id, email: `${person.id}@example.com`, emailVerified: true })
			.run();
		db.insert(schema.member)
			.values({
				id: `m-${person.id}`,
				organizationId: org.id,
				userId: person.id,
				role: person.role,
				createdAt: new Date(),
			})
			.run();
	}
	getBrowseItemDetailsMock.mockReset();
	getCachedTorrentMock.mockReset();
});

describe("rating limits", () => {
	it("allows each level and the levels below it, never unrated titles", () => {
		expect(PG).toEqual(expect.arrayContaining(["G", "PG", "TV-Y", "TV-G", "TV-Y7", "TV-PG"]));
		expect(PG).not.toEqual(expect.arrayContaining(["PG-13"]));
		const teen = allowedRatings("PG-13");
		expect(teen).toEqual(expect.arrayContaining(["PG", "PG-13", "TV-14"]));
		for (const rating of ["R", "TV-MA", "NC-17", "NR", ""]) {
			expect(teen).not.toContain(rating);
		}
		expect(toRatingLimit("PG-13")).toBe("PG-13");
		expect(toRatingLimit("none")).toBeNull();
	});

	it("lets owners limit anyone else and admins limit members only", () => {
		setMemberRatingLimit("owner", org.id, "m-admin", "R");
		setMemberRatingLimit("admin", org.id, "m-teen", "PG-13");
		setMemberRatingLimit("owner", org.id, "m-kid", "PG");
		expect(listRatingLimits(org.id)).toEqual({ "m-owner": null, "m-admin": "R", "m-teen": "PG-13", "m-kid": "PG" });
		expect(getRatingLimit("teen", org.id)).toBe("PG-13");
		expect(getRatingLimit("owner", org.id)).toBeNull();

		expect(() => setMemberRatingLimit("admin", org.id, "m-owner", "PG")).toThrow();
		expect(() => setMemberRatingLimit("owner", org.id, "m-owner", "PG")).toThrow();
		expect(() => setMemberRatingLimit("kid", org.id, "m-teen", null)).toThrow();
		expect(() => setMemberRatingLimit("owner", "other-org", "m-kid", null)).toThrow();
		expect(getRatingLimit("teen", org.id)).toBe("PG-13");
	});

	it("drops TMDB results that are above the limit, unrated, or failed to load", async () => {
		const ratings: Record<number, string | null> = { 1: "PG", 2: "PG-13", 3: null };
		getBrowseItemDetailsMock.mockImplementation((tmdbId: number) =>
			tmdbId === 4
				? Promise.reject(new Error("adult"))
				: Promise.resolve({ imdbId: null, certification: ratings[tmdbId] })
		);

		const kid = await filterAllowedTitles([1, 2, 3, 4].map(browseItem), PG);
		const teen = await filterAllowedTitles([1, 2, 3, 4].map(browseItem), allowedRatings("PG-13"));

		expect(kid.map((item) => item.tmdbId)).toEqual([1]);
		expect(teen.map((item) => item.tmdbId)).toEqual([1, 2]);
	});

	it("hides library titles above the limit and rates episodes by their show", () => {
		const base = { userId: "owner", organizationId: org.id };
		const pgMovie = mediaDb.create({ ...base, type: "movie", title: "Paddington", certification: "PG" });
		mediaDb.create({ ...base, type: "movie", title: "Alien", certification: "R" });
		mediaDb.create({ ...base, type: "movie", title: "Unrated", certification: null });
		const show = mediaDb.create({ ...base, type: "show", title: "Dexter", certification: "TV-MA" });
		const episode = mediaDb.create({
			...base,
			type: "episode",
			title: "Pilot",
			parentId: show.id,
			certification: "G",
		});

		const titles = mediaDb.search(org.id, PG, "", DEFAULT_CATALOG_FILTERS, 50, 0).map((item) => item.id);

		expect(titles).toEqual([pgMovie.id]);
		expect(mediaDb.search(org.id, null, "", DEFAULT_CATALOG_FILTERS, 50, 0)).toHaveLength(4);
		expect(isMediaAllowed(episode, org.id, PG)).toBe(false);
	});

	it("hides titles above the limit from the queue and the error count", () => {
		const base = { userId: "owner", organizationId: org.id };
		const pgMovie = mediaDb.create({
			...base,
			type: "movie",
			title: "Paddington",
			certification: "PG",
			status: "error",
		});
		mediaDb.create({ ...base, type: "movie", title: "Alien", certification: "R", status: "error" });
		const show = mediaDb.create({ ...base, type: "show", title: "Dexter", certification: "TV-MA" });
		mediaDb.create({ ...base, type: "episode", title: "Pilot", parentId: show.id, status: "downloading" });

		expect(mediaDb.listQueueRows(org.id, null)).toHaveLength(3);
		expect(mediaDb.countDownloadErrors(org.id, null)).toBe(2);
		expect(mediaDb.listQueueRows(org.id, PG).map((row) => row.media.id)).toEqual([pgMovie.id]);
		expect(mediaDb.countDownloadErrors(org.id, PG)).toBe(1);
	});

	it("keeps allowed titles in continue watching when newer titles are above the limit", () => {
		const base = { userId: "owner", organizationId: org.id };
		const paddington = mediaDb.create({ ...base, type: "movie", title: "Paddington", certification: "PG" });
		const alien = mediaDb.create({ ...base, type: "movie", title: "Alien", certification: "R" });
		for (const [item, playedAt] of [
			[paddington, 1000],
			[alien, 2000],
		] as const) {
			mediaDb.update(item.id, { playPosition: 60, playDuration: 600, lastPlayedAt: new Date(playedAt) });
		}

		expect(mediaDb.getRecentlyWatched(org.id, null, 1).map((item) => item.id)).toEqual([alien.id]);
		expect(mediaDb.getRecentlyWatched(org.id, PG, 1).map((item) => item.id)).toEqual([paddington.id]);
	});

	it("adds a movie for a limited member only with the torrent the server picks", async () => {
		const serverMagnet = "magnet:?xt=urn:btih:server";
		getBrowseItemDetailsMock.mockImplementation((tmdbId: number) =>
			Promise.resolve({ imdbId: `tt${tmdbId}`, certification: tmdbId === 1 ? "PG" : "R" })
		);
		getCachedTorrentMock.mockResolvedValue({ imdbId: "tt1", magnetLink: serverMagnet, infohash: "server" });

		expect(await allowedMovieParams(1, PG)).toEqual({ magnetLink: serverMagnet, tmdbId: 1, type: "movie" });
		await expect(allowedMovieParams(2, PG)).rejects.toMatchObject({ status: 403 });
		await expect(allowedMovieParams("1", PG)).rejects.toMatchObject({ status: 403 });
	});

	it("blocks a new source and uploads for a limited member", async () => {
		setMemberRatingLimit("owner", org.id, "m-kid", "PG");
		const movie = mediaDb.create({
			userId: "owner",
			organizationId: org.id,
			type: "movie",
			title: "Paddington",
			certification: "PG",
		});
		const locals = { user: { id: "kid" }, session: { activeOrganizationId: org.id } } as unknown as App.Locals;
		const replace = new Request("http://localhost", {
			method: "POST",
			body: JSON.stringify({ mode: "replace", magnetLink: "magnet:?xt=urn:btih:kid" }),
		});
		const upload = new Request("http://localhost", { method: "PUT", body: "bytes" });

		await expect(retryRoute({ params: { id: movie.id }, locals, request: replace } as never)).rejects.toMatchObject(
			{
				status: 403,
			}
		);
		await expect(
			uploadRoute({
				params: { id: movie.id },
				locals,
				request: upload,
				url: new URL("http://localhost/?name=a.mp4"),
			} as never)
		).rejects.toMatchObject({ status: 403 });
	});
});
