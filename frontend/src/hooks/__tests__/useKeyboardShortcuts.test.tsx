import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useKeyboardShortcuts, getShortcutDisplay, DEFAULT_SHORTCUTS } from '../useKeyboardShortcuts';

describe('useKeyboardShortcuts', () => {
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>;
  let removeEventListenerSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should add keydown event listener on mount', () => {
    const shortcuts = [
      {
        key: 's',
        ctrl: true,
        description: 'Save',
        action: vi.fn(),
      },
    ];

    renderHook(() => useKeyboardShortcuts(shortcuts));

    expect(addEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  it('should remove keydown event listener on unmount', () => {
    const shortcuts = [
      {
        key: 's',
        ctrl: true,
        description: 'Save',
        action: vi.fn(),
      },
    ];

    const { unmount } = renderHook(() => useKeyboardShortcuts(shortcuts));

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  it('should trigger action when matching shortcut is pressed', () => {
    const action = vi.fn();
    const shortcuts = [
      {
        key: 's',
        ctrl: true,
        description: 'Save',
        action,
      },
    ];

    renderHook(() => useKeyboardShortcuts(shortcuts));

    const event = new KeyboardEvent('keydown', {
      key: 's',
      ctrlKey: true,
      bubbles: true,
    });

    window.dispatchEvent(event);

    expect(action).toHaveBeenCalled();
  });

  it('should not trigger action when shortcut does not match', () => {
    const action = vi.fn();
    const shortcuts = [
      {
        key: 's',
        ctrl: true,
        description: 'Save',
        action,
      },
    ];

    renderHook(() => useKeyboardShortcuts(shortcuts));

    const event = new KeyboardEvent('keydown', {
      key: 'a',
      ctrlKey: true,
      bubbles: true,
    });

    window.dispatchEvent(event);

    expect(action).not.toHaveBeenCalled();
  });

  it('should handle shift modifier', () => {
    const action = vi.fn();
    const shortcuts = [
      {
        key: '?',
        shift: true,
        description: 'Help',
        action,
      },
    ];

    renderHook(() => useKeyboardShortcuts(shortcuts));

    const event = new KeyboardEvent('keydown', {
      key: '?',
      shiftKey: true,
      bubbles: true,
    });

    window.dispatchEvent(event);

    expect(action).toHaveBeenCalled();
  });

  it('should handle alt modifier', () => {
    const action = vi.fn();
    const shortcuts = [
      {
        key: 'a',
        alt: true,
        description: 'Alt action',
        action,
      },
    ];

    renderHook(() => useKeyboardShortcuts(shortcuts));

    const event = new KeyboardEvent('keydown', {
      key: 'a',
      altKey: true,
      bubbles: true,
    });

    window.dispatchEvent(event);

    expect(action).toHaveBeenCalled();
  });

  it('should prevent default behavior for matching shortcuts', () => {
    const action = vi.fn();
    const shortcuts = [
      {
        key: 's',
        ctrl: true,
        description: 'Save',
        action,
      },
    ];

    renderHook(() => useKeyboardShortcuts(shortcuts));

    const event = new KeyboardEvent('keydown', {
      key: 's',
      ctrlKey: true,
      bubbles: true,
    });

    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

    window.dispatchEvent(event);

    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  it('should not trigger shortcuts in input fields', () => {
    const action = vi.fn();
    const shortcuts = [
      {
        key: 'a',
        description: 'Action',
        action,
      },
    ];

    renderHook(() => useKeyboardShortcuts(shortcuts));

    const input = document.createElement('input');
    document.body.appendChild(input);

    const event = new KeyboardEvent('keydown', {
      key: 'a',
      bubbles: true,
    });

    Object.defineProperty(event, 'target', { value: input, writable: false });

    window.dispatchEvent(event);

    expect(action).not.toHaveBeenCalled();

    document.body.removeChild(input);
  });

  it('should not trigger shortcuts in textarea', () => {
    const action = vi.fn();
    const shortcuts = [
      {
        key: 'a',
        description: 'Action',
        action,
      },
    ];

    renderHook(() => useKeyboardShortcuts(shortcuts));

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);

    const event = new KeyboardEvent('keydown', {
      key: 'a',
      bubbles: true,
    });

    Object.defineProperty(event, 'target', { value: textarea, writable: false });

    window.dispatchEvent(event);

    expect(action).not.toHaveBeenCalled();

    document.body.removeChild(textarea);
  });

  it('should allow Ctrl+S in input fields', () => {
    const action = vi.fn();
    const shortcuts = [
      {
        key: 's',
        ctrl: true,
        description: 'Save',
        action,
      },
    ];

    renderHook(() => useKeyboardShortcuts(shortcuts));

    const input = document.createElement('input');
    document.body.appendChild(input);

    const event = new KeyboardEvent('keydown', {
      key: 's',
      ctrlKey: true,
      bubbles: true,
    });

    Object.defineProperty(event, 'target', { value: input, writable: false });

    window.dispatchEvent(event);

    expect(action).toHaveBeenCalled();

    document.body.removeChild(input);
  });

  it('should not trigger shortcuts when disabled', () => {
    const action = vi.fn();
    const shortcuts = [
      {
        key: 's',
        ctrl: true,
        description: 'Save',
        action,
      },
    ];

    renderHook(() => useKeyboardShortcuts(shortcuts, false));

    const event = new KeyboardEvent('keydown', {
      key: 's',
      ctrlKey: true,
      bubbles: true,
    });

    window.dispatchEvent(event);

    expect(action).not.toHaveBeenCalled();
  });

  it('should handle multiple shortcuts', () => {
    const action1 = vi.fn();
    const action2 = vi.fn();
    const shortcuts = [
      {
        key: 's',
        ctrl: true,
        description: 'Save',
        action: action1,
      },
      {
        key: 'p',
        ctrl: true,
        description: 'Print',
        action: action2,
      },
    ];

    renderHook(() => useKeyboardShortcuts(shortcuts));

    const event1 = new KeyboardEvent('keydown', {
      key: 's',
      ctrlKey: true,
      bubbles: true,
    });

    window.dispatchEvent(event1);
    expect(action1).toHaveBeenCalled();
    expect(action2).not.toHaveBeenCalled();

    const event2 = new KeyboardEvent('keydown', {
      key: 'p',
      ctrlKey: true,
      bubbles: true,
    });

    window.dispatchEvent(event2);
    expect(action2).toHaveBeenCalled();
  });

  it('should be case insensitive', () => {
    const action = vi.fn();
    const shortcuts = [
      {
        key: 's',
        ctrl: true,
        description: 'Save',
        action,
      },
    ];

    renderHook(() => useKeyboardShortcuts(shortcuts));

    const event = new KeyboardEvent('keydown', {
      key: 'S',
      ctrlKey: true,
      bubbles: true,
    });

    window.dispatchEvent(event);

    expect(action).toHaveBeenCalled();
  });

  it('should handle meta key (Cmd on Mac)', () => {
    const action = vi.fn();
    const shortcuts = [
      {
        key: 's',
        ctrl: true,
        description: 'Save',
        action,
      },
    ];

    renderHook(() => useKeyboardShortcuts(shortcuts));

    const event = new KeyboardEvent('keydown', {
      key: 's',
      metaKey: true,
      bubbles: true,
    });

    window.dispatchEvent(event);

    expect(action).toHaveBeenCalled();
  });
});

describe('getShortcutDisplay', () => {
  const originalPlatform = navigator.platform;

  afterEach(() => {
    Object.defineProperty(navigator, 'platform', {
      value: originalPlatform,
      writable: true,
    });
  });

  it('should format Ctrl+Key for non-Mac platforms', () => {
    Object.defineProperty(navigator, 'platform', {
      value: 'Win32',
      writable: true,
    });

    const shortcut = {
      key: 's',
      ctrl: true,
      description: 'Save',
      action: () => {},
    };

    expect(getShortcutDisplay(shortcut)).toBe('Ctrl+S');
  });

  it('should format Cmd+Key for Mac platforms', () => {
    Object.defineProperty(navigator, 'platform', {
      value: 'MacIntel',
      writable: true,
    });

    const shortcut = {
      key: 's',
      ctrl: true,
      description: 'Save',
      action: () => {},
    };

    expect(getShortcutDisplay(shortcut)).toContain('S');
  });

  it('should include Shift modifier', () => {
    Object.defineProperty(navigator, 'platform', {
      value: 'Win32',
      writable: true,
    });

    const shortcut = {
      key: '?',
      shift: true,
      description: 'Help',
      action: () => {},
    };

    expect(getShortcutDisplay(shortcut)).toContain('Shift');
  });

  it('should include Alt modifier', () => {
    Object.defineProperty(navigator, 'platform', {
      value: 'Win32',
      writable: true,
    });

    const shortcut = {
      key: 'a',
      alt: true,
      description: 'Alt action',
      action: () => {},
    };

    expect(getShortcutDisplay(shortcut)).toContain('Alt');
  });

  it('should format key only when no modifiers', () => {
    const shortcut = {
      key: 'Escape',
      description: 'Close',
      action: () => {},
    };

    expect(getShortcutDisplay(shortcut)).toBe('ESCAPE');
  });

  it('should combine multiple modifiers', () => {
    Object.defineProperty(navigator, 'platform', {
      value: 'Win32',
      writable: true,
    });

    const shortcut = {
      key: 's',
      ctrl: true,
      shift: true,
      description: 'Save as',
      action: () => {},
    };

    const display = getShortcutDisplay(shortcut);
    expect(display).toContain('Ctrl');
    expect(display).toContain('Shift');
    expect(display).toContain('S');
  });
});

describe('DEFAULT_SHORTCUTS', () => {
  it('should have expected shortcuts', () => {
    expect(DEFAULT_SHORTCUTS).toBeInstanceOf(Array);
    expect(DEFAULT_SHORTCUTS.length).toBeGreaterThan(0);

    const shortcutKeys = DEFAULT_SHORTCUTS.map((s) => s.key);
    expect(shortcutKeys).toContain('k');
    expect(shortcutKeys).toContain('n');
    expect(shortcutKeys).toContain('s');
    expect(shortcutKeys).toContain('p');
    expect(shortcutKeys).toContain('Escape');
    expect(shortcutKeys).toContain('?');
  });

  it('should have categories', () => {
    const categories = DEFAULT_SHORTCUTS.map((s) => s.category);
    expect(categories).toContain('Navigation');
    expect(categories).toContain('Actions');
    expect(categories).toContain('Help');
  });

  it('should have descriptions', () => {
    DEFAULT_SHORTCUTS.forEach((shortcut) => {
      expect(shortcut.description).toBeDefined();
      expect(shortcut.description.length).toBeGreaterThan(0);
    });
  });

  it('should have action functions', () => {
    DEFAULT_SHORTCUTS.forEach((shortcut) => {
      expect(shortcut.action).toBeDefined();
      expect(typeof shortcut.action).toBe('function');
    });
  });

  it('should call window.print for print shortcut', () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

    const printShortcut = DEFAULT_SHORTCUTS.find((s) => s.key === 'p');
    expect(printShortcut).toBeDefined();

    printShortcut!.action();

    expect(printSpy).toHaveBeenCalled();

    printSpy.mockRestore();
  });
});
