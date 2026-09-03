import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { LanguageSwitcher } from '../LanguageSwitcher';

describe('LanguageSwitcher', () => {
  it('includes the visible current language in the trigger name and exposes popup state', () => {
    render(<LanguageSwitcher />);

    const trigger = screen.getByRole('button', { name: /Change language.*English.*EN/i });
    expect(screen.getByText('EN')).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-controls', 'language-switcher-options');
    expect(trigger).toHaveStyle({
      background: '#ffffff',
      borderColor: '#0369a1',
      borderStyle: 'solid',
      borderWidth: '1px',
      color: '#0369a1',
    });
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<LanguageSwitcher />);

    const trigger = screen.getByRole('button', { name: /Change language.*English.*EN/i });
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    const options = document.getElementById('language-switcher-options');
    expect(options).toBeInTheDocument();
    const englishOption = within(options as HTMLElement).getByRole('button', { name: /English/i });
    englishOption.focus();
    await user.keyboard('{Escape}');

    expect(screen.queryByText('Español')).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });
});
