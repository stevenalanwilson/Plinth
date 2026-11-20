import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArtistEssentialsPanel } from './ArtistEssentialsPanel';

vi.mock('../../services/apiClient', () => ({
  fetchArtistEssentials: vi.fn(),
  fetchArtistSuggestions: vi.fn(),
  buildAppleMusicSearchUrl: vi.fn(
    (artist: string, album: string) => `https://music.apple.com/search?term=${artist}+${album}`,
  ),
  buildSpotifySearchUrl: vi.fn(
    (artist: string, album: string) => `https://open.spotify.com/search/${artist}+${album}`,
  ),
  buildDiscogsSearchUrl: vi.fn(
    (artist: string, album: string) => `https://www.discogs.com/search/?q=${artist}+${album}`,
  ),
  getProxiedArtworkUrl: vi.fn((url: string) => `/api/v1/image?url=${encodeURIComponent(url)}`),
}));

import { fetchArtistEssentials, fetchArtistSuggestions } from '../../services/apiClient';

const mockFetchEssentials = vi.mocked(fetchArtistEssentials);
const mockFetchSuggestions = vi.mocked(fetchArtistSuggestions);

const mockResult = {
  artist: 'Talk Talk',
  albums: [
    { album: 'Spirit of Eden', year: '1988', reason: 'A transformative work.' },
    { album: 'Laughing Stock', year: '1991', reason: 'The culmination of their art.' },
  ],
  related: [
    {
      artist: 'Mark Hollis',
      album: 'Mark Hollis',
      year: '1998',
      connection: 'Singer’s solo album',
      reason: 'Quiet and spare.',
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchSuggestions.mockResolvedValue({ suggestions: [] });
});

describe('ArtistEssentialsPanel', () => {
  it('renders the input and submit button', () => {
    render(<ArtistEssentialsPanel />);
    expect(screen.getByRole('combobox', { name: /artist name/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /get essentials/i })).toBeInTheDocument();
  });

  it('shows loading state during fetch', async () => {
    mockFetchEssentials.mockReturnValue(new Promise(() => {})); // never resolves
    render(<ArtistEssentialsPanel />);
    const user = userEvent.setup();

    await user.type(screen.getByRole('combobox'), 'Talk Talk');
    await user.click(screen.getByRole('button', { name: /get essentials/i }));

    expect(screen.getByRole('button', { name: /finding essentials/i })).toBeDisabled();
  });

  it('renders album list on success', async () => {
    mockFetchEssentials.mockResolvedValue(mockResult);
    render(<ArtistEssentialsPanel />);
    const user = userEvent.setup();

    await user.type(screen.getByRole('combobox'), 'Talk Talk');
    await user.click(screen.getByRole('button', { name: /get essentials/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Spirit of Eden' })).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: 'Laughing Stock' })).toBeInTheDocument();
    expect(screen.getByText('A transformative work.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Mark Hollis' })).toBeInTheDocument();
    expect(screen.getByText(/Singer’s solo album/)).toBeInTheDocument();
  });

  it('says what Artist Essentials is for', () => {
    render(<ArtistEssentialsPanel />);

    expect(screen.getByRole('heading', { name: 'Artist Essentials' })).toBeInTheDocument();
    expect(screen.getByText(/Love a particular artist or band/)).toHaveTextContent(
      /band members, side projects, collaborators and producers/,
    );
  });

  it('shows error message on API failure', async () => {
    mockFetchEssentials.mockRejectedValue(new Error('Service unavailable'));
    render(<ArtistEssentialsPanel />);
    const user = userEvent.setup();

    await user.type(screen.getByRole('combobox'), 'Talk Talk');
    await user.click(screen.getByRole('button', { name: /get essentials/i }));

    await waitFor(() => {
      expect(screen.getByText('Service unavailable')).toBeInTheDocument();
    });
  });

  it('shows the daily limit as a quiet note, not as an alert', async () => {
    mockFetchEssentials.mockRejectedValue(
      Object.assign(new Error("That's all 25 picks for today."), { code: 'daily-limit' }),
    );
    render(<ArtistEssentialsPanel />);
    const user = userEvent.setup();

    await user.type(screen.getByRole('combobox'), 'Talk Talk');
    await user.click(screen.getByRole('button', { name: /get essentials/i }));

    const note = await screen.findByText("That's all 25 picks for today.");
    expect(note).toHaveAttribute('role', 'status');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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

    await user.type(screen.getByRole('combobox'), 'Talk Talk');
    await user.click(screen.getByRole('button', { name: /get essentials/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Spirit of Eden' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /recommend from this artist/i }));
    expect(onSeedArtist).toHaveBeenCalledWith('Talk Talk');
  });

  describe('suggesting artists as someone types', () => {
    const NIRVANAS = [
      { id: 'a1', name: 'Nirvana', detail: 'US grunge band' },
      { id: 'a2', name: 'Nirvana', detail: '60s band from the UK' },
    ];

    it('offers the artists found, and looks up the one that is picked by its ID', async () => {
      mockFetchSuggestions.mockResolvedValue({ suggestions: NIRVANAS });
      mockFetchEssentials.mockResolvedValue({ ...mockResult, artist: 'Nirvana' });
      render(<ArtistEssentialsPanel />);
      const user = userEvent.setup();

      await user.type(screen.getByRole('combobox'), 'nirv');
      await user.click(await screen.findByRole('option', { name: /60s band from the UK/ }));

      expect(screen.getByRole('combobox')).toHaveValue('Nirvana');
      await waitFor(() => {
        expect(mockFetchEssentials).toHaveBeenCalledWith('Nirvana', expect.any(AbortSignal), {
          id: 'a2',
          detail: '60s band from the UK',
        });
      });
    });

    it('offers artists from the crate straight away, and looks them up by name', async () => {
      mockFetchEssentials.mockResolvedValue(mockResult);
      render(<ArtistEssentialsPanel crateArtists={['Talk Talk', 'Can']} />);
      const user = userEvent.setup();

      await user.type(screen.getByRole('combobox'), 'tal');
      await user.click(screen.getByRole('option', { name: /Talk Talk/ }));

      await waitFor(() => {
        expect(mockFetchEssentials).toHaveBeenCalledWith(
          'Talk Talk',
          expect.any(AbortSignal),
          undefined,
        );
      });
    });

    it('looks up what was typed, by name, when no suggestion is picked', async () => {
      mockFetchEssentials.mockResolvedValue(mockResult);
      render(<ArtistEssentialsPanel />);
      const user = userEvent.setup();

      await user.type(screen.getByRole('combobox'), 'Talk Talk');
      await user.click(screen.getByRole('button', { name: /get essentials/i }));

      await waitFor(() => {
        expect(mockFetchEssentials).toHaveBeenCalledWith(
          'Talk Talk',
          expect.any(AbortSignal),
          undefined,
        );
      });
    });

    it('forgets the artist that was picked once the name is changed', async () => {
      mockFetchSuggestions.mockResolvedValue({ suggestions: NIRVANAS });
      mockFetchEssentials.mockResolvedValue({ ...mockResult, artist: 'Nirvana' });
      render(<ArtistEssentialsPanel />);
      const user = userEvent.setup();
      await user.type(screen.getByRole('combobox'), 'nirv');
      await user.click(await screen.findByRole('option', { name: /60s band from the UK/ }));
      await waitFor(() => expect(mockFetchEssentials).toHaveBeenCalledTimes(1));

      await user.type(screen.getByRole('combobox'), ' Tribute');
      await user.click(screen.getByRole('button', { name: /get essentials/i }));

      await waitFor(() => expect(mockFetchEssentials).toHaveBeenCalledTimes(2));
      expect(mockFetchEssentials).toHaveBeenLastCalledWith(
        'Nirvana Tribute',
        expect.any(AbortSignal),
        undefined,
      );
    });
  });
});
