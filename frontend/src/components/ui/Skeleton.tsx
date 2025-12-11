interface SkeletonProps {
  variant?: 'text' | 'avatar' | 'card' | 'row' | 'rectangular' | 'circular';
  width?: string | number;
  height?: string | number;
  count?: number;
  className?: string;
  animate?: boolean;
}

export function Skeleton({
  variant = 'text',
  width,
  height,
  count = 1,
  className = '',
  animate = true,
}: SkeletonProps) {
  const variantStyles = {
    text: { height: '1em', borderRadius: '4px' },
    avatar: { width: '40px', height: '40px', borderRadius: '50%' },
    circular: { width: '40px', height: '40px', borderRadius: '50%' },
    card: { height: '120px', borderRadius: '8px' },
    row: { height: '60px', borderRadius: '8px' },
    rectangular: { height: '100%', borderRadius: '8px' },
  };

  const style = {
    ...variantStyles[variant],
    ...(width ? { width: typeof width === 'number' ? `${width}px` : width } : {}),
    ...(height ? { height: typeof height === 'number' ? `${height}px` : height } : {}),
  };

  const animationClass = animate ? 'skeleton-shimmer' : '';

  if (count === 1) {
    return <div className={`skeleton ${animationClass} ${className}`} style={style} />;
  }

  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`skeleton ${animationClass} ${className}`} style={style} />
      ))}
    </>
  );
}

// Skeleton list for common list loading pattern
export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="list">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="list-row skeleton skeleton-shimmer" style={{ height: 60 }} />
      ))}
    </div>
  );
}

// Table skeleton for loading tables
export function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="skeleton-table">
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div key={rowIdx} className="skeleton-table-row">
          {Array.from({ length: columns }).map((_, colIdx) => (
            <div key={colIdx} className="skeleton skeleton-shimmer" style={{ height: '40px', margin: '8px' }} />
          ))}
        </div>
      ))}
    </div>
  );
}

// Card skeleton
export function CardSkeleton() {
  return (
    <div className="skeleton-card">
      <Skeleton variant="rectangular" height={120} />
      <div style={{ padding: '16px' }}>
        <Skeleton variant="text" width="60%" height={20} />
        <Skeleton variant="text" width="80%" height={16} />
        <Skeleton variant="text" width="40%" height={16} />
      </div>
    </div>
  );
}
