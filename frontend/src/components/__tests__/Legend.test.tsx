import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Legend } from '../Legend';

describe('Legend Component', () => {
  it('renders legend with items', () => {
    const items = [
      { color: 'red', label: 'Critical' },
      { color: 'yellow', label: 'Warning' },
      { color: 'green', label: 'Normal' },
    ];

    render(<Legend items={items} />);

    expect(screen.getByText('Critical')).toBeInTheDocument();
    expect(screen.getByText('Warning')).toBeInTheDocument();
    expect(screen.getByText('Normal')).toBeInTheDocument();
  });

  it('renders color indicators', () => {
    const items = [{ color: 'red', label: 'Test' }];
    const { container } = render(<Legend items={items} />);

    const indicator = container.querySelector('[style*="red"]');
    expect(indicator).toBeInTheDocument();
  });

  it('renders empty when no items', () => {
    const { container } = render(<Legend items={[]} />);
    expect(container.firstChild).toBeEmptyDOMElement();
  });
});
