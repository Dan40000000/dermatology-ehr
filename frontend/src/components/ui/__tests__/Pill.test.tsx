import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Pill } from '../Pill';

describe('Pill Component', () => {
  it('renders children', () => {
    render(<Pill>Active</Pill>);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('applies default variant', () => {
    const { container } = render(<Pill>Default</Pill>);
    expect(container.querySelector('.pill')).toBeInTheDocument();
  });

  it('applies subtle variant', () => {
    const { container } = render(<Pill variant="subtle">Subtle</Pill>);
    expect(container.querySelector('.subtle')).toBeInTheDocument();
  });

  it('applies warn variant', () => {
    const { container } = render(<Pill variant="warn">Warning</Pill>);
    expect(container.querySelector('.warn')).toBeInTheDocument();
  });

  it('applies success variant', () => {
    const { container } = render(<Pill variant="success">Success</Pill>);
    expect(container.querySelector('.success')).toBeInTheDocument();
  });

  it('applies error variant', () => {
    const { container } = render(<Pill variant="error">Error</Pill>);
    expect(container.querySelector('.error')).toBeInTheDocument();
  });

  it('applies default size', () => {
    const { container } = render(<Pill>Default Size</Pill>);
    const pill = container.querySelector('.pill');
    expect(pill).not.toHaveClass('tiny');
    expect(pill).not.toHaveClass('small');
  });

  it('applies tiny size', () => {
    const { container } = render(<Pill size="tiny">Tiny</Pill>);
    expect(container.querySelector('.tiny')).toBeInTheDocument();
  });

  it('applies small size', () => {
    const { container } = render(<Pill size="small">Small</Pill>);
    expect(container.querySelector('.small')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<Pill className="custom-pill">Custom</Pill>);
    expect(container.querySelector('.custom-pill')).toBeInTheDocument();
  });

  it('combines variant, size, and custom class', () => {
    const { container } = render(
      <Pill variant="success" size="small" className="custom">
        Combined
      </Pill>
    );

    const pill = container.querySelector('.pill');
    expect(pill).toHaveClass('success');
    expect(pill).toHaveClass('small');
    expect(pill).toHaveClass('custom');
  });

  it('renders as span element', () => {
    const { container } = render(<Pill>Content</Pill>);
    expect(container.querySelector('span')).toBeInTheDocument();
  });
});
