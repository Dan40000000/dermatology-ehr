import { useState, type MouseEvent } from 'react';

export interface QuickPickItem {
  id: string;
  categoryId: string;
  categoryName?: string;
  code: string;
  codeType: 'CPT' | 'ICD10';
  description: string;
  shortName: string | null;
  isFavorite: boolean;
  usageCount: number;
}

interface QuickPickButtonProps {
  item: QuickPickItem;
  onSelect: (item: QuickPickItem) => void;
  onToggleFavorite?: (item: QuickPickItem) => void;
  selected?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showCode?: boolean;
}

export function QuickPickButton({
  item,
  onSelect,
  onToggleFavorite,
  selected = false,
  size = 'md',
  showCode = true,
}: QuickPickButtonProps) {
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = () => {
    onSelect(item);
  };

  const handleFavoriteClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (onToggleFavorite) {
      onToggleFavorite(item);
    }
  };

  const sizeClasses = {
    sm: 'quick-pick-btn-sm',
    md: 'quick-pick-btn-md',
    lg: 'quick-pick-btn-lg',
  };

  const codeTypeClass = item.codeType === 'CPT' ? 'quick-pick-cpt' : 'quick-pick-icd10';

  return (
    <button
      type="button"
      className={`quick-pick-btn ${sizeClasses[size]} ${codeTypeClass} ${selected ? 'selected' : ''}`}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={`${item.code}: ${item.description}`}
    >
      <div className="quick-pick-btn-content">
        {showCode && (
          <span className="quick-pick-code">{item.code}</span>
        )}
        <span className="quick-pick-name">
          {item.shortName || item.description}
        </span>
      </div>

      {onToggleFavorite && isHovered && (
        <button
          type="button"
          className={`quick-pick-favorite ${item.isFavorite ? 'is-favorite' : ''}`}
          onClick={handleFavoriteClick}
          aria-label={item.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          {item.isFavorite ? '\u2605' : '\u2606'}
        </button>
      )}

      {item.isFavorite && !isHovered && (
        <span className="quick-pick-favorite-indicator">{'\u2605'}</span>
      )}

      <style>{`
        .quick-pick-btn {
          display: inline-flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          padding: 0.5rem 0.75rem;
          border: 1px solid var(--border-color, #e0e0e0);
          border-radius: 6px;
          background: var(--surface-color, #fff);
          cursor: pointer;
          transition: all 0.15s ease;
          text-align: left;
          min-width: 100px;
          position: relative;
        }

        .quick-pick-btn:hover {
          border-color: var(--primary-color, #3b82f6);
          background: var(--hover-color, #f8fafc);
        }

        .quick-pick-btn.selected {
          border-color: var(--primary-color, #3b82f6);
          background: var(--primary-light, #eff6ff);
        }

        .quick-pick-btn-sm {
          padding: 0.25rem 0.5rem;
          font-size: 0.75rem;
          min-width: 80px;
        }

        .quick-pick-btn-md {
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
        }

        .quick-pick-btn-lg {
          padding: 0.75rem 1rem;
          font-size: 1rem;
          min-width: 120px;
        }

        .quick-pick-cpt {
          border-left: 3px solid var(--cpt-color, #22c55e);
        }

        .quick-pick-icd10 {
          border-left: 3px solid var(--icd10-color, #3b82f6);
        }

        .quick-pick-btn-content {
          display: flex;
          flex-direction: column;
          gap: 0.125rem;
          overflow: hidden;
        }

        .quick-pick-code {
          font-weight: 600;
          font-family: var(--font-mono, monospace);
          font-size: 0.75em;
          color: var(--text-secondary, #64748b);
        }

        .quick-pick-name {
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 150px;
        }

        .quick-pick-favorite {
          position: absolute;
          top: 2px;
          right: 2px;
          padding: 2px 4px;
          border: none;
          background: transparent;
          cursor: pointer;
          font-size: 0.875rem;
          color: var(--text-tertiary, #94a3b8);
          transition: color 0.15s ease;
        }

        .quick-pick-favorite:hover {
          color: var(--warning-color, #f59e0b);
        }

        .quick-pick-favorite.is-favorite {
          color: var(--warning-color, #f59e0b);
        }

        .quick-pick-favorite-indicator {
          position: absolute;
          top: 2px;
          right: 4px;
          font-size: 0.625rem;
          color: var(--warning-color, #f59e0b);
        }
      `}</style>
    </button>
  );
}
