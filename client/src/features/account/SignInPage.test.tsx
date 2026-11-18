import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../services/apiClient', () => ({ verifySignIn: vi.fn() }));

import { verifySignIn } from '../../services/apiClient';
import { SignInPage } from './SignInPage';

const mockVerify = vi.mocked(verifySignIn);

function renderPage(): void {
  render(
    <MemoryRouter>
      <SignInPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerify.mockResolvedValue({ account: { email: 'person@example.com' } });
});

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('SignInPage', () => {
  it('waits for a tap before using the link, since mail programs open links to look at them', () => {
    window.history.replaceState(null, '', '/signin#token=pls_abc');

    renderPage();

    expect(screen.getByRole('heading', { name: 'Sign in to Plinth' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('signs in on the tap, and says who is signed in', async () => {
    window.history.replaceState(null, '', '/signin#token=pls_abc');
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { name: "You're signed in" })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Signed in as person@example.com.');
    expect(screen.getByRole('link', { name: 'Go to Plinth' })).toHaveAttribute('href', '/');
  });

  it('says why when the link is no good, and offers a way back', async () => {
    mockVerify.mockRejectedValue(new Error('That link has expired or has already been used.'));
    window.history.replaceState(null, '', '/signin#token=pls_abc');
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That link has expired or has already been used.',
    );
    expect(screen.getByRole('link', { name: 'Go to Plinth' })).toBeInTheDocument();
  });

  it('says the link is incomplete when there is no token', () => {
    window.history.replaceState(null, '', '/signin');

    renderPage();

    expect(screen.getByRole('heading', { name: 'This link is incomplete' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument();
  });
});
