import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AlbumDetailsResponse } from '@shared/types';

vi.mock('../../services/apiClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/apiClient')>()),
  fetchAlbumDetails: vi.fn(),
}));

import { ApiError, fetchAlbumDetails } from '../../services/apiClient';
import { AlbumDetails } from './AlbumDetails';

const mockFetchAlbumDetails = vi.mocked(fetchAlbumDetails);

const DETAILS: AlbumDetailsResponse = {
  release: { date: '1980-11', country: 'GB', label: 'Korova', catalogueNumber: 'KODE 2' },
  formats: ['12" Vinyl', 'CD', 'Digital Media'],
  discs: [
    {
      position: 1,
      title: null,
      format: '12" Vinyl',
      tracks: [
        { number: 'A1', title: "I Can't Escape Myself", lengthSeconds: 236 },
        { number: 'A2', title: 'Heartland', lengthSeconds: 216 },
        { number: 'A3', title: 'Hour of Need', lengthSeconds: null },
      ],
    },
  ],
  moreFromArtist: {
    artist: 'The Sound',
    albums: [
      { title: 'From the Lions Mouth', year: '1981' },
      { title: 'Demos', year: null },
    ],
  },
};

function renderDetails(): void {
  render(<AlbumDetails slug="the-sound-jeopardy" />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AlbumDetails', () => {
  it('shows a loading state while the details load', () => {
    mockFetchAlbumDetails.mockReturnValue(new Promise(() => {}));

    renderDetails();

    expect(screen.getByRole('status', { name: 'Loading album details' })).toBeInTheDocument();
  });

  it('shows the release facts', async () => {
    mockFetchAlbumDetails.mockResolvedValue(DETAILS);

    renderDetails();

    expect(await screen.findByText('November 1980')).toBeInTheDocument();
    expect(screen.getByText('United Kingdom')).toBeInTheDocument();
    expect(screen.getByText('Korova · KODE 2')).toBeInTheDocument();
    expect(screen.getByText('12" Vinyl · CD · Digital Media')).toBeInTheDocument();
  });

  it('shows the tracklist with the numbers printed on the release and the lengths', async () => {
    mockFetchAlbumDetails.mockResolvedValue(DETAILS);

    renderDetails();

    const tracks = within(await screen.findByRole('list', { name: 'Tracklist' })).getAllByRole(
      'listitem',
    );
    expect(tracks).toHaveLength(3);
    expect(tracks[0]).toHaveTextContent("A1I Can't Escape Myself3:56");
    expect(tracks[1]).toHaveTextContent('A2Heartland3:36');
  });

  it('shows no length for a track that has none', async () => {
    mockFetchAlbumDetails.mockResolvedValue(DETAILS);

    renderDetails();

    const tracks = within(await screen.findByRole('list', { name: 'Tracklist' })).getAllByRole(
      'listitem',
    );
    expect(tracks[2]).toHaveTextContent(/^A3Hour of Need$/);
  });

  it('gives each disc a heading when there is more than one', async () => {
    mockFetchAlbumDetails.mockResolvedValue({
      ...DETAILS,
      discs: [
        {
          position: 1,
          title: null,
          format: 'CD',
          tracks: [{ number: '1', title: 'One', lengthSeconds: 60 }],
        },
        {
          position: 2,
          title: 'Bonus disc',
          format: 'CD',
          tracks: [{ number: '1', title: 'Demo', lengthSeconds: 90 }],
        },
      ],
    });

    renderDetails();

    expect(await screen.findByRole('heading', { name: 'Disc 1 · CD' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Disc 2 · Bonus disc · CD' })).toBeInTheDocument();
    expect(screen.getAllByRole('list', { name: /Tracklist/ })).toHaveLength(2);
  });

  it('gives a single disc no heading of its own', async () => {
    mockFetchAlbumDetails.mockResolvedValue(DETAILS);

    renderDetails();

    await screen.findByRole('list', { name: 'Tracklist' });
    expect(screen.queryByRole('heading', { name: /^Disc/ })).not.toBeInTheDocument();
  });

  it('lists more from the artist with a link to look each album up', async () => {
    mockFetchAlbumDetails.mockResolvedValue(DETAILS);

    renderDetails();

    expect(await screen.findByRole('heading', { name: 'More from The Sound' })).toBeInTheDocument();
    const items = within(screen.getByRole('list', { name: 'More from The Sound' })).getAllByRole(
      'listitem',
    );
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('From the Lions Mouth1981');
    expect(
      within(items[0]).getByRole('link', { name: 'From the Lions Mouth on Apple Music' }),
    ).toHaveAttribute('href', expect.stringContaining('The%20Sound%20From%20the%20Lions%20Mouth'));
    expect(
      within(items[0]).getByRole('link', { name: 'From the Lions Mouth on Spotify' }),
    ).toBeInTheDocument();
    expect(
      within(items[0]).getByRole('link', { name: 'From the Lions Mouth on Discogs' }),
    ).toBeInTheDocument();
  });

  it('leaves out whatever MusicBrainz did not have', async () => {
    mockFetchAlbumDetails.mockResolvedValue({
      release: { date: '1980', country: null, label: null, catalogueNumber: null },
      formats: [],
      discs: [],
      moreFromArtist: { artist: 'The Sound', albums: [] },
    });

    renderDetails();

    expect(await screen.findByText('1980')).toBeInTheDocument();
    expect(screen.queryByText('Country')).not.toBeInTheDocument();
    expect(screen.queryByText('Label')).not.toBeInTheDocument();
    expect(screen.queryByText('Formats')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Tracklist' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /More from/ })).not.toBeInTheDocument();
  });

  it('shows a label without a catalogue number', async () => {
    mockFetchAlbumDetails.mockResolvedValue({
      ...DETAILS,
      release: { date: '2012-04-21', country: 'XW', label: 'Rhino', catalogueNumber: null },
    });

    renderDetails();

    expect(await screen.findByText('Rhino')).toBeInTheDocument();
    expect(screen.getByText('Worldwide')).toBeInTheDocument();
  });

  it('says so when there is nothing to show', async () => {
    mockFetchAlbumDetails.mockResolvedValue({
      release: null,
      formats: [],
      discs: [],
      moreFromArtist: null,
    });

    renderDetails();

    expect(await screen.findByText('No further details found for this album.')).toBeInTheDocument();
  });

  it('shows a failure and lets you try again', async () => {
    mockFetchAlbumDetails
      .mockRejectedValueOnce(
        new ApiError("Couldn't load the album details. Please try again.", 502),
      )
      .mockResolvedValueOnce(DETAILS);

    renderDetails();

    expect(
      await screen.findByText("Couldn't load the album details. Please try again."),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('November 1980')).toBeInTheDocument();
  });
});
