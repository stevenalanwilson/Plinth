import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArtistEssentialsPanel } from './ArtistEssentialsPanel';

vi.mock('../../services/apiClient', () => ({
  fetchArtistEssentials: vi.fn(),
  buildAppleMusicSearchUrl: vi.fn(
    (artist: string, album: string) => `https://music.apple.com/search?term=${artist}+${album}`,
  ),
  buildSpotifySearchUrl: vi.fn(
    (artist: string, album: string) => `https://open.spotify.com/search/${artist}+${album}`,
  ),
  buildDiscogsSearchUrl: vi.fn(
    (artist: string, album: string) => `https://www.discogs.com/search/?q=${artist}+${album}`,
  ),
}));

import { fetchArtistEssentials } from '../../services/apiClient';

const mockFetchEssentials = vi.mocked(fetchArtistEssentials);

const mockResult = {
  artist: 'Talk Talk',
  albums: [
    { album: 'Spirit of Eden', year: '1988', reason: 'A transformative work.' },
    { album: 'Laughing Stock', year: '1991', reason: 'The culmination of their art.' },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ArtistEssentialsPanel', () => {
  it('renders the input and submit button', () => {
    render(<ArtistEssentialsPanel />);
    expect(screen.getByRole('textbox', { name: /artist name/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /get essentials/i })).toBeInTheDocument();
  });

  it('shows loading state during fetch', async () => {
    mockFetchEssentials.mockReturnValue(new Promise(() => {})); // never resolves
    render(<ArtistEssentialsPanel />);
    const user = userEvent.setup();

    await user.type(screen.getByRole('textbox'), 'Talk Talk');
    await user.click(screen.getByRole('button', { name: /get essentials/i }));

    expect(screen.getByRole('button', { name: /finding essentials/i })).toBeDisabled();
  });

  it('renders album list on success', async () => {
    mockFetchEssentials.mockResolvedValue(mockResult);
    render(<ArtistEssentialsPanel />);
    const user = userEvent.setup();

    await user.type(screen.getByRole('textbox'), 'Talk Talk');
    await user.click(screen.getByRole('button', { name: /get essentials/i }));

    await waitFor(() => {
      expect(screen.getByText('Spirit of Eden')).toBeInTheDocument();
    });
    expect(screen.getByText('Laughing Stock')).toBeInTheDocument();
    expect(screen.getByText('A transformative work.')).toBeInTheDocument();
  });

  it('shows error message on API failure', async () => {
    mockFetchEssentials.mockRejectedValue(new Error('Service unavailable'));
    render(<ArtistEssentialsPanel />);
    const user = userEvent.setup();

    await user.type(screen.getByRole('textbox'), 'Talk Talk');
    await user.click(screen.getByRole('button', { name: /get essentials/i }));

    await waitFor(() => {
      expect(screen.getByText('Service unavailable')).toBeInTheDocument();
    });
  });

  it('shows validation error when submitting with empty artist', async () => {
    render(<ArtistEssentialsPanel />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /get essentials/i }));

    expect(screen.getByText(/please enter an artist name/i)).toBeInTheDocument();
    expect(mockFetchEssentials).not.toHaveBeenCalled();
  });

  it('calls onSeedArtist with canonical artist name when seed button is clicked', async () => {
    mockFetchEssentials.mockResolvedValue(mockResult);
    const onSeedArtist = vi.fn();
    render(<ArtistEssentialsPanel onSeedArtist={onSeedArtist} />);
    const user = userEvent.setup();

    await user.type(screen.getByRole('textbox'), 'Talk Talk');
    await user.click(screen.getByRole('button', { name: /get essentials/i }));

    await waitFor(() => {
      expect(screen.getByText('Spirit of Eden')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /recommend from this artist/i }));
    expect(onSeedArtist).toHaveBeenCalledWith('Talk Talk');
  });
});
