import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { SubNav } from '../SubNav';

describe('SubNav Component', () => {
  const items = [
    { label: 'Overview', path: '/overview' },
    { label: 'Details', path: '/details' },
    { label: 'History', path: '/history' },
  ];

  const renderWithRouter = (props: any) => {
    return render(
      <BrowserRouter>
        <SubNav {...props} />
      </BrowserRouter>
    );
  };

  it('renders navigation items', () => {
    renderWithRouter({ items });

    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Details')).toBeInTheDocument();
    expect(screen.getByText('History')).toBeInTheDocument();
  });

  it('renders links with correct paths', () => {
    renderWithRouter({ items });

    const overviewLink = screen.getByText('Overview').closest('a');
    expect(overviewLink).toHaveAttribute('href', '/overview');

    const detailsLink = screen.getByText('Details').closest('a');
    expect(detailsLink).toHaveAttribute('href', '/details');
  });

  it('returns null when items is empty', () => {
    const { container } = renderWithRouter({ items: [] });
    expect(container.firstChild).toBeNull();
  });

  it('applies subnav-link class', () => {
    renderWithRouter({ items });

    const links = screen.getAllByRole('link');
    links.forEach((link) => {
      expect(link).toHaveClass('subnav-link');
    });
  });

  it('renders single item', () => {
    const singleItem = [{ label: 'Single', path: '/single' }];
    renderWithRouter({ items: singleItem });

    expect(screen.getByText('Single')).toBeInTheDocument();
  });

  it('renders many items', () => {
    const manyItems = [
      { label: 'Item 1', path: '/1' },
      { label: 'Item 2', path: '/2' },
      { label: 'Item 3', path: '/3' },
      { label: 'Item 4', path: '/4' },
      { label: 'Item 5', path: '/5' },
    ];

    renderWithRouter({ items: manyItems });

    expect(screen.getAllByRole('link')).toHaveLength(5);
  });
});
