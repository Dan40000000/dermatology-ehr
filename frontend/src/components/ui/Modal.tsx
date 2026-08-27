import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useDialogFocusTrap } from '../../utils/focusTrap';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'full';
  showClose?: boolean;
  footer?: ReactNode;
  /** Allow Escape to dismiss only for overlays where cancelling is safe. */
  closeOnEscape?: boolean;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  showClose = true,
  footer,
  closeOnEscape = true,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const generatedId = useId();
  const titleId = `modal-title-${generatedId.replace(/:/g, '')}`;
  useDialogFocusTrap({ isOpen, dialogRef, onClose, closeOnEscape });

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'modal-sm',
    md: 'modal-md',
    lg: 'modal-lg',
    full: 'modal-full',
  };

  // Render via portal to escape any stacking context issues
  return createPortal(
    <div className="modal-overlay" role="presentation">
      <div
        ref={dialogRef}
        className={`modal ${sizeClasses[size]}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
      >
        {(title || showClose) && (
          <div className="modal-header">
            {title && (
                <h2 id={titleId} className="modal-title">
                {title}
              </h2>
            )}
            {showClose && (
              <button
                type="button"
                className="modal-close"
                onClick={onClose}
                aria-label="Close modal"
              >
                ×
              </button>
            )}
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
