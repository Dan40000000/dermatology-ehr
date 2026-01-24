import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { Toast } from '../Toast';

describe('Toast Component', () => {
  it('renders toast message', () => {
    const { container } = render(<Toast message="Test message" onClose={vi.fn()} />);
    expect(container.textContent).toContain('Test message');
  });

  it('applies ok type class', () => {
    const { container } = render(<Toast message="Success" type="ok" onClose={vi.fn()} />);
    expect(container.firstChild).toHaveClass('toast', 'ok');
  });

  it('applies error type class', () => {
    const { container } = render(<Toast message="Error" type="error" onClose={vi.fn()} />);
    expect(container.firstChild).toHaveClass('toast', 'error');
  });
});
