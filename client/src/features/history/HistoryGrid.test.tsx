import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HistoryGrid } from './HistoryGrid';
import { HistoryEntry } from '../../types/history';

const entries: HistoryEntry[] = [
  {
    recommendation: { artist: 'Burial', album: 'Untrue', year: '2007', reason: 'Great album.' },
    artworkResponse: { artworkUrl: null, year: '2007', appleMusicUrl: null },
  },
  {
    recommendation: { artist: 'Four Tet', album: 'There Is Love In You', year: '2010', reason: 'Lovely.' },
    artworkResponse: {
      artworkUrl: 'https://example.com/art.jpg',
      year: '2010',
      appleMusicUrl: 'https://music.apple.com/gb/album/there-is-love-in-you/12345',
    },
  },
];

describe('HistoryGrid', () => {
  it('renders all history entries', () => {
    render(<HistoryGrid history={entries} />);
    expect(screen.getByText('Untrue')).toBeInTheDocument();
    expect(screen.getByText('There Is Love In You')).toBeInTheDocument();
  });

  it('renders artist names', () => {
    render(<HistoryGrid history={entries} />);
    expect(screen.getByText('Burial')).toBeInTheDocument();
    expect(screen.getByText('Four Tet')).toBeInTheDocument();
  });

  it('renders artwork when artworkUrl is provided', () => {
    render(<HistoryGrid history={entries} />);
    const img = screen.getByAltText('There Is Love In You') as HTMLImageElement;
    expect(img).toBeInTheDocument();
  });

  it('links directly to appleMusicUrl when available', () => {
    render(<HistoryGrid history={entries} />);
    const links = screen.getAllByRole('link');
    const fourTetLink = links.find((l) => l.getAttribute('href') === 'https://music.apple.com/gb/album/there-is-love-in-you/12345');
    expect(fourTetLink).toBeDefined();
    expect(fourTetLink).toHaveAttribute('target', '_blank');
  });

  it('falls back to Apple Music search URL when appleMusicUrl is null', () => {
    render(<HistoryGrid history={entries} />);
    const links = screen.getAllByRole('link');
    const burialLink = links.find((l) => l.getAttribute('href')?.includes('music.apple.com/gb/search'));
    expect(burialLink).toBeDefined();
    expect(burialLink?.getAttribute('href')).toContain('Burial');
  });

  it('renders the hover overlay text for every item', () => {
    render(<HistoryGrid history={entries} />);
    const overlays = screen.getAllByText('Open in Apple Music');
    expect(overlays).toHaveLength(entries.length);
  });
});
