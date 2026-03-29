import { ArtworkResponse } from '@shared/types';

const FETCH_TIMEOUT_MS = 8000;
// Total time budget for the full artwork lookup (MusicBrainz + CAA + iTunes).
// Ensures the request never hangs indefinitely even if individual timeouts are each hit.
const REQUEST_BUDGET_MS = 30_000;

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
  artworkUrl100?: string;
}

interface ItunesSearchResult {
  results: ItunesAlbum[];
}

interface ItunesData {
  appleMusicUrl: string | null;
  artworkUrl: string | null;
}

interface SpotifyTokenResponse {
  access_token: string;
  expires_in: number;
}

interface SpotifyAlbum {
  name: string;
  artists: Array<{ name: string }>;
  external_urls: { spotify: string };
}

interface SpotifySearchResult {
  albums: { items: SpotifyAlbum[] };
}

interface SpotifyData {
  spotifyUrl: string | null;
}

let cachedSpotifyToken: { value: string; expiresAt: number } | null = null;

export function _resetSpotifyTokenForTesting(): void {
  cachedSpotifyToken = null;
}

async function fetchSpotifyToken(budgetSignal?: AbortSignal): Promise<string | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const now = Date.now();
  if (cachedSpotifyToken && cachedSpotifyToken.expiresAt > now) {
    return cachedSpotifyToken.value;
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetchWithTimeout(
    'https://accounts.spotify.com/api/token',
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    },
    budgetSignal,
  );
  if (!res.ok) return null;

  const data = (await res.json()) as SpotifyTokenResponse;
  // Cache with a 60-second safety margin before expiry
  cachedSpotifyToken = { value: data.access_token, expiresAt: now + (data.expires_in - 60) * 1000 };
  return data.access_token;
}

async function fetchSpotifyData(
  artist: string,
  album: string,
  budgetSignal?: AbortSignal,
): Promise<SpotifyData> {
  try {
    const token = await fetchSpotifyToken(budgetSignal);
    if (!token) return { spotifyUrl: null };

    const q = encodeURIComponent(`${artist} ${album}`);
    const res = await fetchWithTimeout(
      `https://api.spotify.com/v1/search?q=${q}&type=album&limit=5`,
      { headers: { Authorization: `Bearer ${token}` } },
      budgetSignal,
    );
    if (!res.ok) return { spotifyUrl: null };

    const data = (await res.json()) as SpotifySearchResult;
    const items = data.albums?.items ?? [];
    if (items.length === 0) return { spotifyUrl: null };

    const albumLower = album.toLowerCase();
    const artistLower = artist.toLowerCase();

    const scored = items.map((item) => {
      let score = 0;
      if (item.name.toLowerCase() === albumLower) score += 3;
      else if (item.name.toLowerCase().includes(albumLower)) score += 1;
      const itemArtist = item.artists[0]?.name.toLowerCase() ?? '';
      if (itemArtist === artistLower) score += 2;
      else if (itemArtist.includes(artistLower) || artistLower.includes(itemArtist)) score += 1;
      return { item, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (best.score === 0) return { spotifyUrl: null };

    return { spotifyUrl: best.item.external_urls.spotify ?? null };
  } catch {
    return { spotifyUrl: null };
  }
}

async function fetchWithTimeout(
  url: string,
  options?: RequestInit,
  budgetSignal?: AbortSignal,
): Promise<Response> {
  const signals: AbortSignal[] = [AbortSignal.timeout(FETCH_TIMEOUT_MS)];
  if (budgetSignal) signals.push(budgetSignal);
  const signal = signals.length === 1 ? signals[0] : AbortSignal.any(signals);
  return fetch(url, { ...options, signal });
}

function scoreMatch(group: MusicBrainzReleaseGroup, album: string, artist: string): number {
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

async function fetchItunesDataOnce(
  artist: string,
  album: string,
  budgetSignal?: AbortSignal,
): Promise<ItunesData> {
  const term = encodeURIComponent(`${artist} ${album}`);
  const res = await fetchWithTimeout(
    `https://itunes.apple.com/search?term=${term}&media=music&entity=album&limit=5`,
    undefined,
    budgetSignal,
  );
  if (!res.ok) return { appleMusicUrl: null, artworkUrl: null };

  const data = (await res.json()) as ItunesSearchResult;
  if (!data.results || data.results.length === 0) return { appleMusicUrl: null, artworkUrl: null };

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
  const best = scored[0].result;

  // artworkUrl100 is 100×100; replace to get 500×500
  const artworkUrl = best.artworkUrl100
    ? best.artworkUrl100.replace('100x100bb', '500x500bb')
    : null;

  return { appleMusicUrl: best.collectionViewUrl ?? null, artworkUrl };
}

async function fetchItunesData(
  artist: string,
  album: string,
  budgetSignal?: AbortSignal,
): Promise<ItunesData> {
  // Retry once on transient failure before giving up.
  // AbortErrors are rethrown immediately — retrying a cancelled request is pointless.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fetchItunesDataOnce(artist, album, budgetSignal);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
      // fall through to retry
    }
  }
  return { appleMusicUrl: null, artworkUrl: null };
}

export async function fetchArtwork(artist: string, album: string): Promise<ArtworkResponse> {
  const budgetSignal = AbortSignal.timeout(REQUEST_BUDGET_MS);

  try {
    // MusicBrainz enforces a 1 req/sec rate limit; this delay keeps us compliant
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const escapedAlbum = album.replace(/[+\-&|!(){}[\]^"~*?:\\]/g, '\\$&');
    const escapedArtist = artist.replace(/[+\-&|!(){}[\]^"~*?:\\]/g, '\\$&');
    const query = encodeURIComponent(`release:${escapedAlbum} AND artist:${escapedArtist}`);
    const mbUrl = `https://musicbrainz.org/ws/2/release-group?query=${query}&limit=5&fmt=json`;

    const mbRes = await fetchWithTimeout(
      mbUrl,
      { headers: { 'User-Agent': 'AlbumRecommender/1.0 (contact@example.com)' } },
      budgetSignal,
    );

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
    const caRes = await fetchWithTimeout(
      `https://coverartarchive.org/release-group/${mbid}`,
      undefined,
      budgetSignal,
    );

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

    const [itunesData, spotifyData] = await Promise.all([
      fetchItunesData(artist, album, budgetSignal),
      fetchSpotifyData(artist, album, budgetSignal),
    ]);

    return {
      artworkUrl: artworkUrl ?? itunesData.artworkUrl,
      year,
      appleMusicUrl: itunesData.appleMusicUrl,
      spotifyUrl: spotifyData.spotifyUrl,
    };
  } catch {
    // MusicBrainz/CAA failed — still try iTunes and Spotify
    const [itunesData, spotifyData] = await Promise.all([
      fetchItunesData(artist, album, budgetSignal).catch(() => ({
        appleMusicUrl: null,
        artworkUrl: null,
      })),
      fetchSpotifyData(artist, album, budgetSignal),
    ]);
    return {
      artworkUrl: itunesData.artworkUrl,
      year: null,
      appleMusicUrl: itunesData.appleMusicUrl,
      spotifyUrl: spotifyData.spotifyUrl,
    };
  }
}
