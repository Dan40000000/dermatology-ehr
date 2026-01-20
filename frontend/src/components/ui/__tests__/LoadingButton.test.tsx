import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoadingButton, LoadingIconButton } from '../LoadingButton';
import { Save } from 'lucide-react';

describe('LoadingButton Component', () => {
  it('renders button with children', () => {
    render(<LoadingButton>Save</LoadingButton>);
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<LoadingButton loading>Save</LoadingButton>);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows custom loading text', () => {
    render(
      <LoadingButton loading loadingText="Saving...">
        Save
      </LoadingButton>
    );
    expect(screen.getByText('Saving...')).toBeInTheDocument();
  });

  it('disables button when loading', () => {
    render(<LoadingButton loading>Save</LoadingButton>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('disables button when disabled prop is true', () => {
    render(<LoadingButton disabled>Save</LoadingButton>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('disables button when both loading and disabled', () => {
    render(
      <LoadingButton loading disabled>
        Save
      </LoadingButton>
    );
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('handles click when not loading', async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();

    render(<LoadingButton onClick={handleClick}>Save</LoadingButton>);

    await user.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('does not call onClick when loading', async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();

    render(
      <LoadingButton loading onClick={handleClick}>
        Save
      </LoadingButton>
    );

    await user.click(screen.getByRole('button'));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('renders with icon when not loading', () => {
    const { container } = render(
      <LoadingButton icon={<Save data-testid="save-icon" />}>Save</LoadingButton>
    );
    expect(screen.getByTestId('save-icon')).toBeInTheDocument();
  });

  it('hides icon when loading', () => {
    const { container } = render(
      <LoadingButton loading icon={<Save data-testid="save-icon" />}>
        Save
      </LoadingButton>
    );
    expect(screen.queryByTestId('save-icon')).not.toBeInTheDocument();
  });

  it('applies loading class when loading', () => {
    render(<LoadingButton loading>Save</LoadingButton>);
    expect(screen.getByRole('button')).toHaveClass('is-loading');
  });

  it('applies custom className', () => {
    render(<LoadingButton className="custom-class">Save</LoadingButton>);
    expect(screen.getByRole('button')).toHaveClass('custom-class');
  });

  it('supports different variants', () => {
    const { rerender } = render(<LoadingButton variant="primary">Save</LoadingButton>);
    expect(screen.getByRole('button')).toBeInTheDocument();

    rerender(<LoadingButton variant="danger">Delete</LoadingButton>);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('supports different sizes', () => {
    const { rerender } = render(<LoadingButton size="small">Save</LoadingButton>);
    expect(screen.getByRole('button')).toBeInTheDocument();

    rerender(<LoadingButton size="large">Save</LoadingButton>);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });
});

describe('LoadingIconButton Component', () => {
  it('renders icon button with label', () => {
    render(<LoadingIconButton icon={<Save />} label="Save document" />);
    const button = screen.getByRole('button', { name: /save document/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-label', 'Save document');
    expect(button).toHaveAttribute('title', 'Save document');
  });

  it('shows loading spinner when loading', () => {
    const { container } = render(
      <LoadingIconButton loading icon={<Save data-testid="save-icon" />} label="Save" />
    );
    expect(screen.queryByTestId('save-icon')).not.toBeInTheDocument();
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows icon when not loading', () => {
    render(<LoadingIconButton icon={<Save data-testid="save-icon" />} label="Save" />);
    expect(screen.getByTestId('save-icon')).toBeInTheDocument();
  });

  it('disables button when loading', () => {
    render(<LoadingIconButton loading icon={<Save />} label="Save" />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('disables button when disabled prop is true', () => {
    render(<LoadingIconButton disabled icon={<Save />} label="Save" />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('handles click when not loading', async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();

    render(<LoadingIconButton onClick={handleClick} icon={<Save />} label="Save" />);

    await user.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('does not call onClick when loading', async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();

    render(<LoadingIconButton loading onClick={handleClick} icon={<Save />} label="Save" />);

    await user.click(screen.getByRole('button'));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('applies loading class when loading', () => {
    render(<LoadingIconButton loading icon={<Save />} label="Save" />);
    expect(screen.getByRole('button')).toHaveClass('is-loading');
  });

  it('applies custom className', () => {
    render(<LoadingIconButton className="custom-class" icon={<Save />} label="Save" />);
    expect(screen.getByRole('button')).toHaveClass('custom-class');
  });

  it('supports different variants', () => {
    const { rerender } = render(
      <LoadingIconButton variant="primary" icon={<Save />} label="Save" />
    );
    expect(screen.getByRole('button')).toHaveClass('primary');

    rerender(<LoadingIconButton variant="danger" icon={<Save />} label="Delete" />);
    expect(screen.getByRole('button')).toHaveClass('danger');
  });

  it('defaults to text variant', () => {
    render(<LoadingIconButton icon={<Save />} label="Save" />);
    expect(screen.getByRole('button')).toHaveClass('text');
  });
});
