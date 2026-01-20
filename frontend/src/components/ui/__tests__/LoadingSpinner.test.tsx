import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadingSpinner, InlineSpinner } from '../LoadingSpinner';

describe('LoadingSpinner Component', () => {
  it('renders spinner', () => {
    const { container } = render(<LoadingSpinner />);
    expect(container.querySelector('.loading-spinner')).toBeInTheDocument();
  });

  it('renders with default size', () => {
    const { container } = render(<LoadingSpinner />);
    const spinner = container.querySelector('.loading-spinner');
    expect(spinner).toHaveClass('w-8', 'h-8', 'border-3');
  });

  it('renders with small size', () => {
    const { container } = render(<LoadingSpinner size="sm" />);
    const spinner = container.querySelector('.loading-spinner');
    expect(spinner).toHaveClass('w-4', 'h-4', 'border-2');
  });

  it('renders with large size', () => {
    const { container } = render(<LoadingSpinner size="lg" />);
    const spinner = container.querySelector('.loading-spinner');
    expect(spinner).toHaveClass('w-12', 'h-12', 'border-4');
  });

  it('displays loading message', () => {
    render(<LoadingSpinner message="Loading data..." />);
    expect(screen.getByText('Loading data...')).toBeInTheDocument();
  });

  it('renders without message by default', () => {
    const { container } = render(<LoadingSpinner />);
    expect(container.querySelector('.loading-message')).not.toBeInTheDocument();
  });

  it('renders with overlay', () => {
    const { container } = render(<LoadingSpinner overlay />);
    expect(container.querySelector('.loading-overlay')).toBeInTheDocument();
  });

  it('renders without overlay by default', () => {
    const { container } = render(<LoadingSpinner />);
    expect(container.querySelector('.loading-overlay')).not.toBeInTheDocument();
    expect(container.querySelector('.loading-spinner-container')).toBeInTheDocument();
  });

  it('renders overlay with message', () => {
    const { container } = render(<LoadingSpinner overlay message="Please wait..." />);
    expect(container.querySelector('.loading-overlay')).toBeInTheDocument();
    expect(screen.getByText('Please wait...')).toBeInTheDocument();
  });
});

describe('InlineSpinner Component', () => {
  it('renders inline spinner', () => {
    const { container } = render(<InlineSpinner />);
    expect(container.querySelector('.inline-spinner')).toBeInTheDocument();
  });

  it('renders three spinner dots', () => {
    const { container } = render(<InlineSpinner />);
    const dots = container.querySelectorAll('.spinner-dot');
    expect(dots).toHaveLength(3);
  });

  it('applies custom className', () => {
    const { container } = render(<InlineSpinner className="custom-class" />);
    expect(container.querySelector('.inline-spinner')).toHaveClass('custom-class');
  });

  it('preserves default class with custom className', () => {
    const { container } = render(<InlineSpinner className="custom-class" />);
    const spinner = container.querySelector('.inline-spinner');
    expect(spinner).toHaveClass('inline-spinner');
    expect(spinner).toHaveClass('custom-class');
  });
});
