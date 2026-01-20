import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Footer } from '../Footer';

describe('Footer Component', () => {
  it('renders footer', () => {
    render(<Footer />);
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('renders DermEHR logo', () => {
    render(<Footer />);
    expect(screen.getByText('DermEHR')).toBeInTheDocument();
  });

  it('renders version information', () => {
    render(<Footer />);
    expect(screen.getByText(/Version: 1\.0\.0/i)).toBeInTheDocument();
    expect(screen.getByText(/Build: 2024\.12\.06/i)).toBeInTheDocument();
  });

  it('renders legal disclaimer', () => {
    render(<Footer />);
    expect(screen.getByText(/CPT.*American Medical Association/i)).toBeInTheDocument();
  });

  it('has proper aria labels', () => {
    const { container } = render(<Footer />);
    const logo = container.querySelector('[aria-label*="DermEHR"]');
    const version = container.querySelector('[aria-label*="version"]');

    expect(logo).toBeInTheDocument();
    expect(version).toBeInTheDocument();
  });
});
