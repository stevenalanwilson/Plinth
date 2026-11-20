import { describe, it, expect } from 'vitest';
import { coverArtUrl } from './EssentialCover';

describe('coverArtUrl', () => {
  it('asks the Cover Art Archive for the release group’s front cover', () => {
    expect(coverArtUrl('fd29e2cd-0000-4000-8000-000000000001')).toBe(
      'https://coverartarchive.org/release-group/fd29e2cd-0000-4000-8000-000000000001/front-250',
    );
  });
});
