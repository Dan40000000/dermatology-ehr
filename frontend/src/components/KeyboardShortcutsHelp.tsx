import { useState, useEffect } from 'react';
import { type KeyboardShortcut, getShortcutDisplay } from '../hooks/useKeyboardShortcuts';

interface KeyboardShortcutsHelpProps {
  shortcuts: KeyboardShortcut[];
}

export function KeyboardShortcutsHelp({ shortcuts }: KeyboardShortcutsHelpProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '?' && e.shiftKey) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  // Group shortcuts by category
  const groupedShortcuts = shortcuts.reduce((acc, shortcut) => {
    const category = shortcut.category || 'General';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(shortcut);
    return acc;
  }, {} as Record<string, KeyboardShortcut[]>);

  return (
    <div className="keyboard-shortcuts-overlay" onClick={() => setIsOpen(false)}>
      <div
        className="keyboard-shortcuts-dialog animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="keyboard-shortcuts-header">
          <h2>Keyboard Shortcuts</h2>
          <button
            onClick={() => setIsOpen(false)}
            className="keyboard-shortcuts-close"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="keyboard-shortcuts-content">
          {Object.entries(groupedShortcuts).map(([category, categoryShortcuts]) => (
            <div key={category} className="keyboard-shortcuts-category">
              <h3 className="keyboard-shortcuts-category-title">{category}</h3>
              <div className="keyboard-shortcuts-list">
                {categoryShortcuts.map((shortcut, index) => (
                  <div key={index} className="keyboard-shortcut-item">
                    <span className="keyboard-shortcut-description">
                      {shortcut.description}
                    </span>
                    <kbd className="keyboard-shortcut-key">
                      {getShortcutDisplay(shortcut)}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="keyboard-shortcuts-footer">
          <p>Press <kbd>Shift</kbd> + <kbd>?</kbd> to toggle this panel</p>
        </div>
      </div>
    </div>
  );
}
