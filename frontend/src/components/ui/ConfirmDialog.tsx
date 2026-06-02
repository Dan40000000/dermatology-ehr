import { useEffect, useRef } from 'react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
  loading = false,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Focus the dialog when it opens
      dialogRef.current?.focus();

      // Prevent body scroll
      document.body.style.overflow = 'hidden';

      // Escape and backdrop clicks are non-dismissive. Users must explicitly
      // confirm or cancel so accidental clicks do not discard work.
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && !loading) {
          e.preventDefault();
        }
      };
      window.addEventListener('keydown', handleEscape);

      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleEscape);
      };
    }
  }, [isOpen, onCancel, loading]);

  if (!isOpen) return null;

  const variantClasses = {
    danger: 'confirm-dialog-danger',
    warning: 'confirm-dialog-warning',
    info: 'confirm-dialog-info',
  };

  const variantIcons = {
    danger: '',
    warning: '',
    info: '',
  };

  return (
    <div className="confirm-dialog-overlay">
      <div
        ref={dialogRef}
        className={`confirm-dialog animate-scale-in ${variantClasses[variant]}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        tabIndex={-1}
      >
        <div className="confirm-dialog-icon">
          {variantIcons[variant]}
        </div>

        <h2 id="confirm-dialog-title" className="confirm-dialog-title">
          {title}
        </h2>

        <p id="confirm-dialog-message" className="confirm-dialog-message">
          {message}
        </p>

        <div className="confirm-dialog-actions">
          <button
            onClick={onCancel}
            className="confirm-dialog-button cancel"
            disabled={loading}
            type="button"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`confirm-dialog-button confirm ${variant}`}
            disabled={loading}
            type="button"
          >
            {loading ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// Usage example:
// const [showConfirm, setShowConfirm] = useState(false);
//
// <ConfirmDialog
//   isOpen={showConfirm}
//   title="Delete Patient?"
//   message="This action cannot be undone."
//   variant="danger"
//   onConfirm={() => { handleDelete(); setShowConfirm(false); }}
//   onCancel={() => setShowConfirm(false)}
// />
