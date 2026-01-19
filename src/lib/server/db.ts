import { eq, and, desc, sql } from 'drizzle-orm';
import { db, movies as moviesTable, type Movie, type NewMovie } from './db/index';

export const movies = {
  list(userId: string): Movie[] {
    return db
      .select()
      .from(moviesTable)
      .where(eq(moviesTable.userId, userId))
      .orderBy(desc(moviesTable.addedAt))
      .all();
  },

  // Get all movies with incomplete download status (for recovery on startup)
  getIncompleteDownloads(): Movie[] {
    return db
      .select()
      .from(moviesTable)
      .where(
        sql`${moviesTable.status} IN ('downloading', 'added')`
      )
      .all();
  },

  get(id: string, userId: string): Movie | undefined {
    return db
      .select()
      .from(moviesTable)
      .where(and(eq(moviesTable.id, id), eq(moviesTable.userId, userId)))
      .get();
  },

  getByInfohash(infohash: string, userId: string): Movie | undefined {
    return db
      .select()
      .from(moviesTable)
      .where(and(eq(moviesTable.infohash, infohash), eq(moviesTable.userId, userId)))
      .get();
  },

  // Get movie by ID only (for internal server use, e.g., during download)
  getById(id: string): Movie | undefined {
    return db
      .select()
      .from(moviesTable)
      .where(eq(moviesTable.id, id))
      .get();
  },

  create(movie: Omit<NewMovie, 'id' | 'addedAt' | 'status' | 'progress'>): Movie {
    const id = crypto.randomUUID();
    const now = new Date();

    const newMovie: NewMovie = {
      id,
      userId: movie.userId,
      title: movie.title,
      year: movie.year,
      posterUrl: movie.posterUrl,
      backdropUrl: movie.backdropUrl,
      overview: movie.overview,
      magnetLink: movie.magnetLink,
      infohash: movie.infohash,
      tmdbId: movie.tmdbId,
      runtime: movie.runtime,
      genres: movie.genres,
      originalLanguage: movie.originalLanguage,
      certification: movie.certification,
      status: 'added',
      progress: 0,
      addedAt: now,
    };

    db.insert(moviesTable).values(newMovie).run();

    return {
      ...newMovie,
      filePath: null,
      fileSize: null,
      lastPlayedAt: null,
    } as Movie;
  },

  updateProgress(id: string, progress: number, status: 'added' | 'downloading' | 'complete' | 'error') {
    db.update(moviesTable)
      .set({ progress, status })
      .where(eq(moviesTable.id, id))
      .run();
  },

  updateFilePath(id: string, filePath: string, fileSize?: number) {
    db.update(moviesTable)
      .set({ filePath, fileSize: fileSize ?? null, status: 'complete' })
      .where(eq(moviesTable.id, id))
      .run();
  },

  delete(id: string, userId: string) {
    db.delete(moviesTable)
      .where(and(eq(moviesTable.id, id), eq(moviesTable.userId, userId)))
      .run();
  },

  updateLastPlayed(id: string) {
    db.update(moviesTable)
      .set({ lastPlayedAt: new Date() })
      .where(eq(moviesTable.id, id))
      .run();
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
      runtime?: number | null;
      genres?: string | null;
      originalLanguage?: string | null;
      certification?: string | null;
    }
  ) {
    const updates: Record<string, unknown> = {};
    if (metadata.title !== undefined) updates.title = metadata.title;
    if (metadata.year !== undefined) updates.year = metadata.year;
    if (metadata.posterUrl !== undefined) updates.posterUrl = metadata.posterUrl;
    if (metadata.backdropUrl !== undefined) updates.backdropUrl = metadata.backdropUrl;
    if (metadata.overview !== undefined) updates.overview = metadata.overview;
    if (metadata.tmdbId !== undefined) updates.tmdbId = metadata.tmdbId;
    if (metadata.runtime !== undefined) updates.runtime = metadata.runtime;
    if (metadata.genres !== undefined) updates.genres = metadata.genres;
    if (metadata.originalLanguage !== undefined) updates.originalLanguage = metadata.originalLanguage;
    if (metadata.certification !== undefined) updates.certification = metadata.certification;

    if (Object.keys(updates).length > 0) {
      db.update(moviesTable)
        .set(updates)
        .where(eq(moviesTable.id, id))
        .run();
    }
  },
};

export { db };
