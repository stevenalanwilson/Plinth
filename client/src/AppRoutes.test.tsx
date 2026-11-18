import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('./App', () => ({ default: () => <div>Discover app</div> }));
vi.mock('./features/album/AlbumPage', () => ({
  AlbumPage: () => <div>Album page</div>,
}));

vi.mock('./features/account/SignInPage', () => ({
  SignInPage: () => <div>Sign-in page</div>,
}));
vi.mock('./features/privacy/PrivacyPage', () => ({
  PrivacyPage: () => <div>Privacy page</div>,
}));

import { AppRoutes } from './AppRoutes';

function renderAt(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe('AppRoutes', () => {
  it('shows the album page at /album/:slug', () => {
    renderAt('/album/the-sound-jeopardy');

    expect(screen.getByText('Album page')).toBeInTheDocument();
  });

  it('shows the app at the root', () => {
    renderAt('/');

    expect(screen.getByText('Discover app')).toBeInTheDocument();
  });

  it('shows the app for any other path, as before', () => {
    renderAt('/anything/else');

    expect(screen.getByText('Discover app')).toBeInTheDocument();
  });

  it('shows the sign-in page at /signin', () => {
    renderAt('/signin');

    expect(screen.getByText('Sign-in page')).toBeInTheDocument();
  });

  it('shows the privacy page at /privacy', () => {
    renderAt('/privacy');

    expect(screen.getByText('Privacy page')).toBeInTheDocument();
  });

  it('does not treat a bare /album as an album page', () => {
    renderAt('/album');

    expect(screen.getByText('Discover app')).toBeInTheDocument();
  });
});
