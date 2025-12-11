import { useEffect, useCallback } from 'react';

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  description: string;
  action: () => void;
  category?: string;
}

/**
 * Global keyboard shortcuts manager
 * Handles keyboard shortcuts across the application
 *
 * @param shortcuts - Array of keyboard shortcuts to register
 * @param enabled - Whether shortcuts are enabled (default: true)
 *
 * @example
 * useKeyboardShortcuts([
 *   {
 *     key: 's',
 *     ctrl: true,
 *     description: 'Save',
 *     action: handleSave,
 *     category: 'Actions'
 *   },
 *   {
 *     key: 'k',
 *     ctrl: true,
 *     description: 'Search',
 *     action: openSearch,
 *     category: 'Navigation'
 *   }
 * ]);
 */
export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[], enabled: boolean = true) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Don't trigger shortcuts when typing in input fields (unless explicitly allowed)
      const target = event.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      for (const shortcut of shortcuts) {
        const keyMatches = event.key.toLowerCase() === shortcut.key.toLowerCase();
        const ctrlMatches = shortcut.ctrl ? (event.ctrlKey || event.metaKey) : !event.ctrlKey;
        const shiftMatches = shortcut.shift ? event.shiftKey : !event.shiftKey;
        const altMatches = shortcut.alt ? event.altKey : !event.altKey;
        const metaMatches = shortcut.meta ? event.metaKey : !event.metaKey;

        if (keyMatches && ctrlMatches && shiftMatches && altMatches) {
          // Allow Ctrl+S, Ctrl+P, Ctrl+K even in inputs
          const allowedInInputs = ['s', 'p', 'k'];
          const shouldPrevent = shortcut.ctrl && allowedInInputs.includes(shortcut.key.toLowerCase());

          if (!isInput || shouldPrevent) {
            event.preventDefault();
            shortcut.action();
            return;
          }
        }
      }
    },
    [shortcuts, enabled]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

/**
 * Get formatted shortcut key display string
 * @param shortcut - The keyboard shortcut
 * @returns Formatted string (e.g., "Ctrl+S", "Cmd+K")
 */
export function getShortcutDisplay(shortcut: KeyboardShortcut): string {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const parts: string[] = [];

  if (shortcut.ctrl) {
    parts.push(isMac ? '⌘' : 'Ctrl');
  }
  if (shortcut.shift) {
    parts.push(isMac ? '⇧' : 'Shift');
  }
  if (shortcut.alt) {
    parts.push(isMac ? '⌥' : 'Alt');
  }
  if (shortcut.meta) {
    parts.push('⌘');
  }

  parts.push(shortcut.key.toUpperCase());

  return parts.join(isMac ? '' : '+');
}

/**
 * Default application shortcuts
 */
export const DEFAULT_SHORTCUTS: KeyboardShortcut[] = [
  {
    key: 'k',
    ctrl: true,
    description: 'Quick search',
    action: () => {
      // Will be overridden by component
    },
    category: 'Navigation',
  },
  {
    key: 'n',
    ctrl: true,
    description: 'New patient',
    action: () => {
      // Will be overridden by component
    },
    category: 'Actions',
  },
  {
    key: 's',
    ctrl: true,
    description: 'Save',
    action: () => {
      // Will be overridden by component
    },
    category: 'Actions',
  },
  {
    key: 'p',
    ctrl: true,
    description: 'Print',
    action: () => {
      window.print();
    },
    category: 'Actions',
  },
  {
    key: 'Escape',
    description: 'Close modal/drawer',
    action: () => {
      // Will be overridden by component
    },
    category: 'Navigation',
  },
  {
    key: '?',
    shift: true,
    description: 'Show keyboard shortcuts',
    action: () => {
      // Will be overridden by component
    },
    category: 'Help',
  },
];
