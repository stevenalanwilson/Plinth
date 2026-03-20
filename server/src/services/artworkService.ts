import { ArtworkResponse } from '../../shared/types';

const FETCH_TIMEOUT_MS = 8000;

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

interface ItunesAlbum {
  collectionName: string;
  artistName: string;
  collectionViewUrl: string;
}

interface ItunesSearchResult {
  results: ItunesAlbum[];
}

async function fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
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

async function fetchAppleMusicUrl(artist: string, album: string): Promise<string | null> {
  try {
    const term = encodeURIComponent(`${artist} ${album}`);
    const res = await fetchWithTimeout(
      `https://itunes.apple.com/search?term=${term}&media=music&entity=album&limit=5`,
    );
    if (!res.ok) return null;

    const data = (await res.json()) as ItunesSearchResult;
    if (!data.results || data.results.length === 0) return null;

    const albumLower = album.toLowerCase();
    const artistLower = artist.toLowerCase();

    const scored = data.results.map((result) => {
      let score = 0;
      if (result.collectionName.toLowerCase() === albumLower) score += 3;
      else if (result.collectionName.toLowerCase().includes(albumLower)) score += 1;
      if (result.artistName.toLowerCase() === artistLower) score += 2;
      else if (
        result.artistName.toLowerCase().includes(artistLower) ||
        artistLower.includes(result.artistName.toLowerCase())
      )
        score += 1;
      return { result, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0].result.collectionViewUrl ?? null;
  } catch {
    return null;
  }
}

export async function fetchArtwork(artist: string, album: string): Promise<ArtworkResponse> {
  try {
    // MusicBrainz enforces a 1 req/sec rate limit; this delay keeps us compliant
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const query = encodeURIComponent(`release:${album} AND artist:${artist}`);
    const mbUrl = `https://musicbrainz.org/ws/2/release-group?query=${query}&limit=5&fmt=json`;

    const mbRes = await fetchWithTimeout(mbUrl, {
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
    const caRes = await fetchWithTimeout(`https://coverartarchive.org/release-group/${mbid}`);

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

    const appleMusicUrl = await fetchAppleMusicUrl(artist, album);

    return { artworkUrl, year, appleMusicUrl };
  } catch {
    return { artworkUrl: null, year: null, appleMusicUrl: null };
  }
}
