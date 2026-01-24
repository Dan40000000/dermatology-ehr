import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConflictBanner } from '../ConflictBanner';

describe('ConflictBanner Component', () => {
  it('renders conflict message', () => {
    render(<ConflictBanner message="Scheduling conflict detected" />);
    expect(screen.getByText('Scheduling conflict detected')).toBeInTheDocument();
  });

  it('applies warning styles', () => {
    const { container } = render(<ConflictBanner message="Conflict" />);
    expect(container.firstChild).toHaveClass('banner', 'error');
  });
});
