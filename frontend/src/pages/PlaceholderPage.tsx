import { useLocation } from 'react-router-dom';

export function PlaceholderPage() {
  const location = useLocation();
  const pageName = location.pathname.slice(1).replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div className="placeholder-page">
      <div className="placeholder-content">
        <div className="placeholder-icon">🚧</div>
        <h1>{pageName || 'Page'}</h1>
        <p className="muted">This module is coming soon.</p>
        <p className="muted tiny">Path: {location.pathname}</p>
      </div>
    </div>
  );
}
