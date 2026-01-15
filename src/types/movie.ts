export interface Movie {
  id: string;
  name: string;
  url: string;
  logo?: string;
  category: string;
  year?: string;
  type: 'movie' | 'series';
  rating?: number; // Nota do TMDB/IMDB (0-10)
}

export interface MovieCategory {
  name: string;
  movies: Movie[];
}
