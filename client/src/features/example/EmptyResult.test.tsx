import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AlbumResponse } from '@shared/types';

vi.mock('./useExampleAlbum', () => ({ useExampleAlbum: vi.fn() }));

import { useExampleAlbum } from './useExampleAlbum';
import { EmptyResult } from './EmptyResult';

const mockUseExampleAlbum = vi.mocked(useExampleAlbum);

const ALBUM: AlbumResponse = {
  slug: 'the-sound-jeopardy',
  releaseGroupId: 'rg-1',
  artist: 'The Sound',
  album: 'Jeopardy',
  year: '1980',
  hook: 'A hook.',
  genres: [],
  country: null,
  artworkUrl: null,
  appleMusicUrl: null,
};

function renderEmptyResult(): void {
  render(
    <MemoryRouter>
      <EmptyResult />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('EmptyResult', () => {
  it('shows the waiting message while there is no example', () => {
    mockUseExampleAlbum.mockReturnValue(null);

    renderEmptyResult();

    expect(screen.getByText(/next favourite album is waiting/)).toBeInTheDocument();
    expect(screen.queryByText('Example')).not.toBeInTheDocument();
  });

  it('shows the example in place of the waiting message once there is one', () => {
    mockUseExampleAlbum.mockReturnValue(ALBUM);

    renderEmptyResult();

    expect(screen.getByText('Example')).toBeInTheDocument();
    expect(screen.queryByText(/next favourite album is waiting/)).not.toBeInTheDocument();
  });
});
