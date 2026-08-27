import { useEffect, useId, useRef } from 'react';
import { useDialogFocusTrap } from '../../utils/focusTrap';

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
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const idPrefix = useId().replace(/:/g, '');
  const titleId = `confirm-dialog-title-${idPrefix}`;
  const messageId = `confirm-dialog-message-${idPrefix}`;

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Escape is a safe, non-destructive cancel while idle and is ignored during
  // an in-flight confirmation. Focus is trapped and returned to the opener.
  useDialogFocusTrap({
    isOpen,
    dialogRef,
    onClose: onCancel,
    closeOnEscape: !loading,
    initialFocusRef: cancelButtonRef,
  });

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
        aria-labelledby={titleId}
        aria-describedby={messageId}
        tabIndex={-1}
      >
        <div className="confirm-dialog-icon">
          {variantIcons[variant]}
        </div>

        <h2 id={titleId} className="confirm-dialog-title">
          {title}
        </h2>

        <p id={messageId} className="confirm-dialog-message">
          {message}
        </p>

        <div className="confirm-dialog-actions">
          <button
            ref={cancelButtonRef}
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
