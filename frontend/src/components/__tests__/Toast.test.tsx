import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Toast } from '../Toast';

describe('Toast Component', () => {
  it('renders toast message', () => {
    const { container } = render(<Toast message="Test message" type="success" />);
    expect(container.textContent).toContain('Test message');
  });

  it('applies success type class', () => {
    const { container } = render(<Toast message="Success" type="success" />);
    expect(container.firstChild).toHaveClass('toast-success');
  });

  it('applies error type class', () => {
    const { container } = render(<Toast message="Error" type="error" />);
    expect(container.firstChild).toHaveClass('toast-error');
  });

  it('applies warning type class', () => {
    const { container } = render(<Toast message="Warning" type="warning" />);
    expect(container.firstChild).toHaveClass('toast-warning');
  });

  it('applies info type class', () => {
    const { container } = render(<Toast message="Info" type="info" />);
    expect(container.firstChild).toHaveClass('toast-info');
  });
});
