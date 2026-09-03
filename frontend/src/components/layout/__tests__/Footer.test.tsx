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
    expect(screen.getByText(/Pilot v0\.1\.0/i)).toBeInTheDocument();
    expect(screen.getByText(/Not for clinical use/i)).toBeInTheDocument();
  });

  it('renders legal disclaimer', () => {
    render(<Footer />);
    expect(screen.getByText(/CPT.*American Medical Association/i)).toBeInTheDocument();
  });

  it('does not override visible text with labels on generic elements', () => {
    const { container } = render(<Footer />);
    const logo = container.querySelector('.footer-logo');
    const version = container.querySelector('.footer-version');

    expect(logo).not.toHaveAttribute('aria-label');
    expect(version).not.toHaveAttribute('aria-label');
  });
});
