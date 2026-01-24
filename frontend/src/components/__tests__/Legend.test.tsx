import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Legend } from '../Legend';

describe('Legend Component', () => {
  it('renders legend with items', () => {
    render(<Legend />);

    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.getByText('Conflict')).toBeInTheDocument();
    expect(screen.getByText('Off-hours')).toBeInTheDocument();
  });

  it('renders conflict pill styling', () => {
    const { container } = render(<Legend />);
    const conflictPill = container.querySelector('.conflict-pill');
    expect(conflictPill).toBeInTheDocument();
  });
});
