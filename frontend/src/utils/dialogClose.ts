export type DialogCloseReason = 'backdropClick' | 'escapeKeyDown';

export function shouldIgnoreImplicitDialogClose(reason?: string): boolean {
  return reason === 'backdropClick' || reason === 'escapeKeyDown';
}

export function closeDialogByExplicitAction(onClose: () => void) {
  return (_event: unknown, reason?: string) => {
    if (shouldIgnoreImplicitDialogClose(reason)) return;
    onClose();
  };
}
