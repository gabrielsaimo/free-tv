import { memo, useState, useCallback, useEffect, useRef } from 'react';
import type { Movie } from '../types/movie';
import { searchImage } from '../services/imageService';
import './MovieCard.css';

interface MovieCardProps {
  movie: Movie;
  onSelect: (movie: Movie) => void;
  isActive?: boolean;
}

type ImageState = 'loading' | 'loaded' | 'error' | 'fallback-loading' | 'fallback-loaded' | 'no-image';

export const MovieCard = memo(function MovieCard({ movie, onSelect, isActive }: MovieCardProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [imageState, setImageState] = useState<ImageState>('loading');
  const [fallbackImage, setFallbackImage] = useState<string | null>(null);
  const [showSuccessIndicator, setShowSuccessIndicator] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const prevLogoRef = useRef<string | undefined>(movie.logo);

  // Detecta mudança de imagem e mostra indicador de sucesso
  useEffect(() => {
    if (prevLogoRef.current !== movie.logo && movie.logo) {
      setImageState('loading');
      setFallbackImage(null);
      // Mostra indicador de atualização quando a imagem muda
      if (prevLogoRef.current) {
        setShowSuccessIndicator(true);
        const timer = setTimeout(() => setShowSuccessIndicator(false), 2000);
        return () => clearTimeout(timer);
      }
    }
    prevLogoRef.current = movie.logo;
  }, [movie.logo]);

  // Busca imagem do TMDB quando a imagem original falha
  useEffect(() => {
    if (imageState === 'error' && !fallbackImage) {
      setImageState('fallback-loading');
      // Passa categoria para busca mais assertiva
      searchImage(movie.name, movie.type as 'movie' | 'series', movie.category)
        .then(url => {
          if (url) {
            setFallbackImage(url);
            setImageState('fallback-loaded');
          } else {
            setImageState('no-image');
          }
        })
        .catch(() => setImageState('no-image'));
    }
  }, [imageState, movie.name, movie.type, movie.category, fallbackImage]);

  const handleImageLoad = () => {
    setImageState(fallbackImage ? 'fallback-loaded' : 'loaded');
    if (showSuccessIndicator) {
      // Mantém o indicador visível por mais tempo após carregar
      setTimeout(() => setShowSuccessIndicator(false), 1500);
    }
  };

  const handleImageError = () => {
    if (fallbackImage) {
      setImageState('no-image');
    } else {
      setImageState('error');
    }
  };

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(movie);
    }
  }, [onSelect, movie]);

  const currentImage = fallbackImage || movie.logo;
  const isLoading = imageState === 'loading' || imageState === 'fallback-loading';
  const hasImage = (imageState === 'loaded' || imageState === 'fallback-loaded') && currentImage;

  return (
    <div 
      className={`movie-card ${isActive ? 'active' : ''} ${isFocused ? 'focused' : ''}`}
      onClick={() => onSelect(movie)}
      onKeyDown={handleKeyDown}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      title={movie.name}
      role="button"
      tabIndex={0}
      data-focusable="true"
    >
      <div className="movie-poster">
        {/* Imagem principal com estados de loading */}
        {currentImage && imageState !== 'no-image' && (
          <img 
            ref={imageRef}
            src={currentImage} 
            alt={movie.name}
            loading="lazy"
            className={`poster-image ${hasImage ? 'loaded' : ''} ${isLoading ? 'loading' : ''}`}
            onLoad={handleImageLoad}
            onError={handleImageError}
          />
        )}

        {/* Indicador de carregamento */}
        {isLoading && (
          <div className="image-loading-overlay">
            <div className="loading-pulse" />
            <div className="loading-spinner-small" />
          </div>
        )}

        {/* Indicador de sucesso quando imagem é atualizada */}
        {showSuccessIndicator && hasImage && (
          <div className="image-success-indicator">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        )}

        {/* Placeholder quando não tem imagem */}
        {(imageState === 'no-image' || (!currentImage && !isLoading)) && (
          <div className="movie-placeholder-styled">
            <div className="placeholder-gradient" />
            <div className="placeholder-content">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span className="placeholder-title">{movie.name.substring(0, 20)}{movie.name.length > 20 ? '...' : ''}</span>
            </div>
          </div>
        )}

        <div className="movie-overlay">
          <button className="play-btn" tabIndex={-1}>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
        </div>

        {/* Badge de tipo com indicador de estado */}
        <span className={`movie-type ${movie.type} ${imageState === 'fallback-loaded' ? 'fallback-badge' : ''}`}>
          {movie.type === 'series' ? '📺' : '🎬'}
          {imageState === 'fallback-loaded' && <span className="badge-indicator">✨</span>}
        </span>
      </div>
      <div className="movie-info">
        <h4 className="movie-title">{movie.name}</h4>
      </div>
    </div>
  );
});
