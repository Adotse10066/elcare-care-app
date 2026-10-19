// ─────────────────────────────────────────────────────────────
// __tests__/LocaleSwitcher.test.tsx — Component tests for LocaleSwitcher
// ─────────────────────────────────────────────────────────────

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';

// Clear localStorage before each test so locale state is clean
beforeEach(() => {
  localStorage.clear();
});

describe('LocaleSwitcher', () => {
  it('renders both EN and SW locale buttons', () => {
    render(<LocaleSwitcher />);
    expect(screen.getByTestId('locale-en')).toBeInTheDocument();
    expect(screen.getByTestId('locale-sw')).toBeInTheDocument();
  });

  it('shows EN as the active locale by default', () => {
    render(<LocaleSwitcher />);
    const enButton = screen.getByTestId('locale-en');
    expect(enButton).toHaveAttribute('aria-checked', 'true');
    const swButton = screen.getByTestId('locale-sw');
    expect(swButton).toHaveAttribute('aria-checked', 'false');
  });

  it('switches to Swahili when the SW button is clicked', () => {
    render(<LocaleSwitcher />);
    const swButton = screen.getByTestId('locale-sw');
    fireEvent.click(swButton);
    expect(swButton).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('locale-en')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radiogroup', { name: /current language: kiswahili/i })).toBeInTheDocument();
  });

  it('switches back to English after clicking EN', () => {
    render(<LocaleSwitcher />);
    // First switch to SW
    fireEvent.click(screen.getByTestId('locale-sw'));
    // Then switch back to EN
    fireEvent.click(screen.getByTestId('locale-en'));
    expect(screen.getByTestId('locale-en')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('locale-sw')).toHaveAttribute('aria-checked', 'false');
  });

  it('persists the chosen locale to localStorage', () => {
    render(<LocaleSwitcher />);
    fireEvent.click(screen.getByTestId('locale-sw'));
    expect(localStorage.getItem('elcarehub_locale')).toBe('sw');
  });

  it('renders the radio group with an accessible label', () => {
    render(<LocaleSwitcher />);
    const group = screen.getByRole('radiogroup', { name: /language selector, current language: english/i });
    expect(group).toBeInTheDocument();
  });

  it('names each language and exposes the selected locale semantically', () => {
    render(<LocaleSwitcher />);
    expect(screen.getByRole('radio', { name: 'English' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Kiswahili' })).toHaveAttribute('aria-checked', 'false');
  });
});
