import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { PlaceholderPage } from '../PlaceholderPage';

describe('PlaceholderPage', () => {
  it('should render placeholder page', () => {
    render(
      <MemoryRouter initialEntries={['/test-page']}>
        <PlaceholderPage />
      </MemoryRouter>
    );

    expect(screen.getByText('Test Page')).toBeInTheDocument();
  });

  it('should display coming soon message', () => {
    render(
      <MemoryRouter initialEntries={['/test-page']}>
        <PlaceholderPage />
      </MemoryRouter>
    );

    expect(screen.getByText(/Coming Soon/i)).toBeInTheDocument();
  });

  it('should render with different page names', () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={['/analytics']}>
        <PlaceholderPage />
      </MemoryRouter>
    );

    expect(screen.getByText('Analytics')).toBeInTheDocument();

    unmount();

    render(
      <MemoryRouter initialEntries={['/reports']}>
        <PlaceholderPage />
      </MemoryRouter>
    );

    expect(screen.getByText('Reports')).toBeInTheDocument();
  });
});
