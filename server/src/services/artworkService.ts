import { ArtworkResponse } from '../../shared/types';

interface MusicBrainzReleaseGroup {
  id: string;
  title: string;
  'first-release-date'?: string;
  'artist-credit'?: Array<{ name: string }>;
}

interface MusicBrainzSearchResult {
  'release-groups': MusicBrainzReleaseGroup[];
}

interface CoverArtImage {
  front?: boolean;
  image: string;
  thumbnails?: {
    '500'?: string;
    '250'?: string;
    small?: string;
  };
}

interface CoverArtResult {
  images?: CoverArtImage[];
}

function scoreMatch(
  group: MusicBrainzReleaseGroup,
  album: string,
  artist: string,
): number {
  let score = 0;
  const albumLower = album.toLowerCase();
  const artistLower = artist.toLowerCase();

  if (group.title?.toLowerCase() === albumLower) score += 3;
  else if (group.title?.toLowerCase().includes(albumLower)) score += 1;

  const credit = group['artist-credit']?.[0]?.name?.toLowerCase() ?? '';
  if (credit === artistLower) score += 2;
  else if (credit.includes(artistLower) || artistLower.includes(credit)) score += 1;

  return score;
}

export async function fetchArtwork(artist: string, album: string): Promise<ArtworkResponse> {
  try {
    // MusicBrainz enforces a 1 req/sec rate limit; this delay keeps us compliant
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const query = encodeURIComponent(`release:${album} AND artist:${artist}`);
    const mbUrl = `https://musicbrainz.org/ws/2/release-group?query=${query}&limit=5&fmt=json`;

    const mbRes = await fetch(mbUrl, {
      headers: { 'User-Agent': 'AlbumRecommender/1.0 (contact@example.com)' },
    });

    if (!mbRes.ok) throw new Error(`MusicBrainz returned ${mbRes.status}`);

    const mbData = (await mbRes.json()) as MusicBrainzSearchResult;
    const groups = mbData['release-groups'];

    if (!groups || groups.length === 0) throw new Error('No MusicBrainz results');

    const sorted = [...groups].sort(
      (a, b) => scoreMatch(b, album, artist) - scoreMatch(a, album, artist),
    );
    const best = sorted[0];

    const year = best['first-release-date']?.substring(0, 4) ?? null;
    const mbid = best.id;

    let artworkUrl: string | null = null;
    const caRes = await fetch(`https://coverartarchive.org/release-group/${mbid}`);

    if (caRes.ok) {
      const caData = (await caRes.json()) as CoverArtResult;
      const front = caData.images?.find((i) => i.front) ?? caData.images?.[0];
      if (front) {
        artworkUrl =
          front.thumbnails?.['500'] ??
          front.thumbnails?.['250'] ??
          front.thumbnails?.small ??
          front.image ??
          null;
      }
    }

    return { artworkUrl, year };
  } catch {
    return { artworkUrl: null, year: null };
  }
}
