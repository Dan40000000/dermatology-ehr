import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Return focusable descendants of a dialog/overlay without walking the page. */
export function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => {
    if (element.hasAttribute('hidden') || element.getAttribute('aria-hidden') === 'true') return false;
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
}

interface DialogFocusTrapOptions {
  isOpen: boolean;
  dialogRef: RefObject<HTMLElement | null>;
  onClose?: () => void;
  closeOnEscape?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * Keep keyboard focus inside an open dialog and return it to the opener when
 * the dialog closes. All focus queries are scoped to the dialog element.
 */
export function useDialogFocusTrap({
  isOpen,
  dialogRef,
  onClose,
  closeOnEscape = false,
  initialFocusRef,
}: DialogFocusTrapOptions) {
  const openerRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const focusTimer = window.setTimeout(() => {
        const initial = initialFocusRef?.current;
        const focusable = getFocusableElements(dialogRef.current);
        (initial && !initial.hasAttribute('disabled') ? initial : focusable[0] || dialogRef.current)?.focus();
      }, 0);
      wasOpenRef.current = true;
      return () => window.clearTimeout(focusTimer);
    }

    if (!isOpen && wasOpenRef.current) {
      const opener = openerRef.current;
      wasOpenRef.current = false;
      openerRef.current = null;
      if (opener && document.contains(opener)) {
        window.setTimeout(() => opener.focus(), 0);
      }
    }
  }, [dialogRef, initialFocusRef, isOpen]);

  useEffect(() => {
    if (!isOpen || !dialogRef.current) return;
    const dialog = dialogRef.current;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (closeOnEscape && onClose) {
          event.preventDefault();
          onClose();
        }
        return;
      }

      if (event.key !== 'Tab') return;
      const focusable = getFocusableElements(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || !dialog.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !dialog.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    dialog.addEventListener('keydown', handleKeyDown);
    return () => dialog.removeEventListener('keydown', handleKeyDown);
  }, [closeOnEscape, dialogRef, isOpen, onClose]);
}
