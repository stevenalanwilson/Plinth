import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PrivacyPage } from './PrivacyPage';

function renderPage(): void {
  render(
    <MemoryRouter>
      <PrivacyPage />
    </MemoryRouter>,
  );
}

describe('PrivacyPage', () => {
  it('has a heading, and a way back to Plinth', () => {
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Privacy' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Plinth' })).toHaveAttribute('href', '/');
  });

  it('covers where things are kept, signing in, picks and logs', () => {
    renderPage();

    [
      'On your device',
      'On the server',
      'If you sign in',
      'When you ask for a pick',
      'Logs',
    ].forEach((name) => {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
    });
  });

  it('says what is saved when you sign in, and for how long', () => {
    renderPage();

    expect(screen.getByText(/and a copy of your crate/)).toBeInTheDocument();
    expect(screen.getByText(/remembered for 60 days/)).toBeInTheDocument();
    expect(screen.getByText(/dropped from your account after 90 days/)).toBeInTheDocument();
  });

  it('says the crate is only in the browser unless you sign in', () => {
    renderPage();

    expect(screen.getByText(/nowhere else unless you sign in/)).toBeInTheDocument();
  });

  it('says what deleting an account removes, and that the crate on the device stays', () => {
    renderPage();

    expect(screen.getByText(/You can delete your account/)).toBeInTheDocument();
    expect(
      screen.getByText(/removes your email address, the copy of your crate/),
    ).toBeInTheDocument();
    expect(screen.getByText(/The crate on your device stays/)).toBeInTheDocument();
  });

  it('says signing out takes the crate off the device', () => {
    renderPage();

    expect(screen.getByText(/takes your crate off that device/)).toBeInTheDocument();
  });

  it('says there are no cookies, and that logs never hold the email or the device code', () => {
    renderPage();

    expect(screen.getByText(/Plinth sets no cookies/)).toBeInTheDocument();
    expect(
      screen.getByText(/never contain your email address, your device code, or your crate/),
    ).toBeInTheDocument();
  });
});
