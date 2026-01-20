/**
 * UpdateHighlight Component
 * Visual feedback wrapper that highlights when content is updated via WebSocket
 */

import { ReactNode, useEffect, useState } from 'react';

interface UpdateHighlightProps {
  children: ReactNode;
  isHighlighted: boolean;
  highlightColor?: string;
  duration?: number;
  className?: string;
}

export function UpdateHighlight({
  children,
  isHighlighted,
  highlightColor = 'bg-yellow-100',
  duration = 2000,
  className = '',
}: UpdateHighlightProps) {
  const [showHighlight, setShowHighlight] = useState(false);

  useEffect(() => {
    if (isHighlighted) {
      setShowHighlight(true);
      const timer = setTimeout(() => setShowHighlight(false), duration);
      return () => clearTimeout(timer);
    }
  }, [isHighlighted, duration]);

  return (
    <div
      className={`transition-all duration-300 ${showHighlight ? highlightColor : ''} ${className}`}
    >
      {children}
    </div>
  );
}
