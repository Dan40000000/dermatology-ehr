import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PlaceholderPage } from '../PlaceholderPage';

describe('PlaceholderPage', () => {
  it('should render placeholder page', () => {
    render(<PlaceholderPage pageName="Test Page" />);

    expect(screen.getByText('Test Page')).toBeInTheDocument();
  });

  it('should display coming soon message', () => {
    render(<PlaceholderPage pageName="Test Page" />);

    expect(screen.getByText(/Coming Soon/i)).toBeInTheDocument();
  });

  it('should render with different page names', () => {
    const { rerender } = render(<PlaceholderPage pageName="Analytics" />);

    expect(screen.getByText('Analytics')).toBeInTheDocument();

    rerender(<PlaceholderPage pageName="Reports" />);

    expect(screen.getByText('Reports')).toBeInTheDocument();
  });
});
