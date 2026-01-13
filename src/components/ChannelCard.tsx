import { memo, useState, useCallback } from 'react';
import './ChannelCard.css';

interface ChannelCardProps {
  id: string;
  name: string;
  category?: string;
  logo?: string;
  channelNumber?: number;
  isActive: boolean;
  isFavorite: boolean;
  onSelect: () => void;
  onToggleFavorite: (e: React.MouseEvent) => void;
}

export const ChannelCard = memo(function ChannelCard({
  name,
  category,
  logo,
  channelNumber,
  isActive,
  isFavorite,
  onSelect,
  onToggleFavorite,
}: ChannelCardProps) {
  const [imgError, setImgError] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const initials = name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect();
    }
    // Tecla F para favoritar via D-pad
    if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      onToggleFavorite(e as unknown as React.MouseEvent);
    }
  }, [onSelect, onToggleFavorite]);

  return (
    <div
      className={`channel-card ${isActive ? 'active' : ''} ${isFocused ? 'focused' : ''}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      data-focusable="true"
      onKeyDown={handleKeyDown}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
    >
      {channelNumber && (
        <span className="channel-number">{String(channelNumber).padStart(2, '0')}</span>
      )}
      
      <div className="channel-logo">
        {logo && !imgError ? (
          <img 
            src={logo} 
            alt={name} 
            className="channel-logo-img"
            onError={() => setImgError(true)}
          />
        ) : (
          <span className="channel-initials">{initials}</span>
        )}
        {isActive && <div className="live-indicator" />}
      </div>
      
      <div className="channel-info">
        <h3 className="channel-name" title={name}>{name}</h3>
        {category && <span className="channel-category">{category}</span>}
      </div>
      
      <button
        className={`favorite-btn ${isFavorite ? 'is-favorite' : ''}`}
        onClick={onToggleFavorite}
        aria-label={isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
        tabIndex={-1}
        data-focusable="false"
      >
        <svg
          viewBox="0 0 24 24"
          fill={isFavorite ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      </button>
    </div>
  );
});
