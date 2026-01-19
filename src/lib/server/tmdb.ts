import { config } from '$lib/config';

interface TMDBMovie {
  id: number;
  title: string;
  release_date: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
}

interface TMDBSearchResult {
  results: TMDBMovie[];
}

export async function searchMovie(query: string, year?: number | null) {
  const params = new URLSearchParams({
    api_key: config.tmdb.apiKey,
    query,
  });

  if (year) params.set('year', String(year));

  const res = await fetch(`${config.tmdb.baseUrl}/search/movie?${params}`);
  const data: TMDBSearchResult = await res.json();

  return data.results.map((movie) => ({
    tmdbId: movie.id,
    title: movie.title,
    year: movie.release_date ? parseInt(movie.release_date.slice(0, 4)) : null,
    posterUrl: movie.poster_path
      ? `${config.tmdb.imageBaseUrl}${movie.poster_path}`
      : null,
    backdropUrl: movie.backdrop_path
      ? `${config.tmdb.imageBaseUrl}${movie.backdrop_path}`
      : null,
    overview: movie.overview,
  }));
}

export async function getMovieById(tmdbId: number) {
  const res = await fetch(
    `${config.tmdb.baseUrl}/movie/${tmdbId}?api_key=${config.tmdb.apiKey}`
  );
  const movie: TMDBMovie = await res.json();

  return {
    tmdbId: movie.id,
    title: movie.title,
    year: movie.release_date ? parseInt(movie.release_date.slice(0, 4)) : null,
    posterUrl: movie.poster_path
      ? `${config.tmdb.imageBaseUrl}${movie.poster_path}`
      : null,
    backdropUrl: movie.backdrop_path
      ? `${config.tmdb.imageBaseUrl}${movie.backdrop_path}`
      : null,
    overview: movie.overview,
  };
}
