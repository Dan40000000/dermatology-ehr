import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from '../ConfirmDialog';

describe('ConfirmDialog Component', () => {
  beforeEach(() => {
    // Reset body overflow style before each test
    document.body.style.overflow = '';
  });

  afterEach(() => {
    // Clean up after each test
    document.body.style.overflow = '';
  });

  it('renders when isOpen is true', () => {
    render(
      <ConfirmDialog
        isOpen={true}
        title="Confirm Action"
        message="Are you sure?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Confirm Action')).toBeInTheDocument();
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <ConfirmDialog
        isOpen={false}
        title="Confirm Action"
        message="Are you sure?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders default button labels', () => {
    render(
      <ConfirmDialog
        isOpen={true}
        title="Confirm"
        message="Are you sure?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /confirm/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('renders custom button labels', () => {
    render(
      <ConfirmDialog
        isOpen={true}
        title="Delete Item"
        message="Are you sure?"
        confirmLabel="Delete"
        cancelLabel="Keep"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /keep/i })).toBeInTheDocument();
  });

  it('calls onConfirm when confirm button clicked', async () => {
    const handleConfirm = vi.fn();
    const user = userEvent.setup();

    render(
      <ConfirmDialog
        isOpen={true}
        title="Confirm"
        message="Are you sure?"
        onConfirm={handleConfirm}
        onCancel={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /confirm/i }));
    expect(handleConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when cancel button clicked', async () => {
    const handleCancel = vi.fn();
    const user = userEvent.setup();

    render(
      <ConfirmDialog
        isOpen={true}
        title="Confirm"
        message="Are you sure?"
        onConfirm={vi.fn()}
        onCancel={handleCancel}
      />
    );

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when overlay clicked', async () => {
    const handleCancel = vi.fn();
    const user = userEvent.setup();

    const { container } = render(
      <ConfirmDialog
        isOpen={true}
        title="Confirm"
        message="Are you sure?"
        onConfirm={vi.fn()}
        onCancel={handleCancel}
      />
    );

    const overlay = container.querySelector('.confirm-dialog-overlay');
    if (overlay) {
      await user.click(overlay);
      expect(handleCancel).toHaveBeenCalledTimes(1);
    }
  });

  it('does not call onCancel when dialog content clicked', async () => {
    const handleCancel = vi.fn();
    const user = userEvent.setup();

    render(
      <ConfirmDialog
        isOpen={true}
        title="Confirm"
        message="Are you sure?"
        onConfirm={vi.fn()}
        onCancel={handleCancel}
      />
    );

    await user.click(screen.getByRole('dialog'));
    expect(handleCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel when Escape key pressed', async () => {
    const handleCancel = vi.fn();
    const user = userEvent.setup();

    render(
      <ConfirmDialog
        isOpen={true}
        title="Confirm"
        message="Are you sure?"
        onConfirm={vi.fn()}
        onCancel={handleCancel}
      />
    );

    await user.keyboard('{Escape}');
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });

  it('does not call onCancel on Escape when loading', async () => {
    const handleCancel = vi.fn();
    const user = userEvent.setup();

    render(
      <ConfirmDialog
        isOpen={true}
        title="Confirm"
        message="Are you sure?"
        onConfirm={vi.fn()}
        onCancel={handleCancel}
        loading={true}
      />
    );

    await user.keyboard('{Escape}');
    expect(handleCancel).not.toHaveBeenCalled();
  });

  it('disables buttons when loading', () => {
    render(
      <ConfirmDialog
        isOpen={true}
        title="Confirm"
        message="Are you sure?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        loading={true}
      />
    );

    expect(screen.getByRole('button', { name: /processing/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
  });

  it('shows loading text on confirm button', () => {
    render(
      <ConfirmDialog
        isOpen={true}
        title="Confirm"
        message="Are you sure?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        loading={true}
      />
    );

    expect(screen.getByText('Processing...')).toBeInTheDocument();
  });

  it('does not allow overlay click when loading', async () => {
    const handleCancel = vi.fn();
    const user = userEvent.setup();

    const { container } = render(
      <ConfirmDialog
        isOpen={true}
        title="Confirm"
        message="Are you sure?"
        onConfirm={vi.fn()}
        onCancel={handleCancel}
        loading={true}
      />
    );

    const overlay = container.querySelector('.confirm-dialog-overlay');
    if (overlay) {
      await user.click(overlay);
      expect(handleCancel).not.toHaveBeenCalled();
    }
  });

  it('applies danger variant class', () => {
    const { container } = render(
      <ConfirmDialog
        isOpen={true}
        title="Delete"
        message="Are you sure?"
        variant="danger"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(container.querySelector('.confirm-dialog-danger')).toBeInTheDocument();
  });

  it('applies warning variant class', () => {
    const { container } = render(
      <ConfirmDialog
        isOpen={true}
        title="Warning"
        message="Are you sure?"
        variant="warning"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(container.querySelector('.confirm-dialog-warning')).toBeInTheDocument();
  });

  it('applies info variant class', () => {
    const { container } = render(
      <ConfirmDialog
        isOpen={true}
        title="Info"
        message="Are you sure?"
        variant="info"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(container.querySelector('.confirm-dialog-info')).toBeInTheDocument();
  });

  it('prevents body scroll when open', () => {
    render(
      <ConfirmDialog
        isOpen={true}
        title="Confirm"
        message="Are you sure?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(document.body.style.overflow).toBe('hidden');
  });

  it('restores body scroll when closed', () => {
    const { rerender } = render(
      <ConfirmDialog
        isOpen={true}
        title="Confirm"
        message="Are you sure?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(document.body.style.overflow).toBe('hidden');

    rerender(
      <ConfirmDialog
        isOpen={false}
        title="Confirm"
        message="Are you sure?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(document.body.style.overflow).toBe('');
  });

  it('has proper accessibility attributes', () => {
    render(
      <ConfirmDialog
        isOpen={true}
        title="Confirm Action"
        message="Are you sure you want to proceed?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'confirm-dialog-title');
    expect(dialog).toHaveAttribute('aria-describedby', 'confirm-dialog-message');
  });
});
