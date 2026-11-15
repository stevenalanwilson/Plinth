import { ArtistRelationsResponse } from '@shared/types';
import { escapeLucene, musicBrainzFetch } from '../repositories/musicBrainzClient';

const REQUEST_BUDGET_MS = 20_000;
const MAX_RELATIONS = 8;

const TYPE_LABELS: Record<string, string> = {
  'member of band': 'Member',
  collaboration: 'Collaborator',
  subgroup: 'Side project',
  'is person': 'Also known as',
  teacher: 'Mentor',
  student: 'Protégé',
  'supporting musician': 'Session musician',
  tribute: 'Tribute act',
};

const SUPPORTED_TYPES = new Set(Object.keys(TYPE_LABELS));

interface MusicBrainzArtist {
  id: string;
  name: string;
  score?: number;
}

interface MusicBrainzArtistSearchResult {
  artists: MusicBrainzArtist[];
}

interface MusicBrainzRelation {
  type: string;
  direction: 'forward' | 'backward';
  artist?: MusicBrainzArtist;
}

interface MusicBrainzArtistDetail {
  relations?: MusicBrainzRelation[];
}

interface MusicBrainzArtistCredit {
  name: string;
  artist?: {
    id: string;
    name: string;
  };
}

interface MusicBrainzRecording {
  'artist-credit'?: MusicBrainzArtistCredit[];
}

interface MusicBrainzRecordingBrowseResult {
  recordings?: MusicBrainzRecording[];
}

const MIN_MATCH_SCORE = 70;

async function findArtistMbid(name: string, budgetSignal: AbortSignal): Promise<string | null> {
  // Use the artist: Lucene field so we match on the artist name specifically,
  // rather than doing a broad free-text search across all fields.
  const query = encodeURIComponent(`artist:"${escapeLucene(name)}"`);
  const res = await musicBrainzFetch(`artist?query=${query}&limit=5&fmt=json`, budgetSignal);

  if (!res.ok) return null;

  const data = (await res.json()) as MusicBrainzArtistSearchResult;
  if (!data.artists || data.artists.length === 0) return null;

  const best = data.artists[0];
  // Reject low-confidence matches — they're likely the wrong artist entirely.
  if ((best.score ?? 0) < MIN_MATCH_SCORE) return null;

  return best.id;
}

async function fetchRelationsForMbid(
  mbid: string,
  budgetSignal: AbortSignal,
): Promise<MusicBrainzRelation[]> {
  const res = await musicBrainzFetch(`artist/${mbid}?inc=artist-rels&fmt=json`, budgetSignal);

  if (!res.ok) return [];

  const data = (await res.json()) as MusicBrainzArtistDetail;
  return data.relations ?? [];
}

// Fetches recordings credited to this artist and returns co-credited artist names.
// Covers collaborations, guest appearances, and split releases — data that is reliably
// populated in MusicBrainz even when direct artist-to-artist relations are not documented.
async function fetchRecordingCollaborators(
  mbid: string,
  artistNameLower: string,
  budgetSignal: AbortSignal,
): Promise<string[]> {
  const res = await musicBrainzFetch(
    `recording?artist=${mbid}&inc=artist-credits&fmt=json&limit=50`,
    budgetSignal,
  );

  if (!res.ok) return [];

  const data = (await res.json()) as MusicBrainzRecordingBrowseResult;
  const seen = new Set<string>();
  const collaborators: string[] = [];

  for (const recording of data.recordings ?? []) {
    for (const credit of recording['artist-credit'] ?? []) {
      const name = credit.artist?.name;
      if (!name) continue;
      if (name.toLowerCase() === artistNameLower) continue;
      if (seen.has(name)) continue;
      seen.add(name);
      collaborators.push(name);
    }
  }

  return collaborators;
}

export async function fetchArtistRelations(artist: string): Promise<ArtistRelationsResponse> {
  const budgetSignal = AbortSignal.timeout(REQUEST_BUDGET_MS);

  try {
    const mbid = await findArtistMbid(artist, budgetSignal);
    if (!mbid) return { relations: [] };

    const artistNameLower = artist.toLowerCase();
    const seen = new Set<string>();
    const result: Array<{ name: string; type: string }> = [];

    // Pass 1: typed artist-to-artist relationships (member, collaborator, side project, etc.)
    const relations = await fetchRelationsForMbid(mbid, budgetSignal);
    for (const rel of relations) {
      if (result.length >= MAX_RELATIONS) break;
      if (!rel.artist) continue;
      if (!SUPPORTED_TYPES.has(rel.type)) continue;
      const name = rel.artist.name;
      if (seen.has(name)) continue;
      seen.add(name);
      result.push({ name, type: TYPE_LABELS[rel.type] });
    }

    // Pass 2: recording co-credits fill remaining slots — these are always well-populated
    // because MusicBrainz requires artist credits when adding releases.
    if (result.length < MAX_RELATIONS) {
      const collaborators = await fetchRecordingCollaborators(mbid, artistNameLower, budgetSignal);
      for (const name of collaborators) {
        if (result.length >= MAX_RELATIONS) break;
        if (seen.has(name)) continue;
        seen.add(name);
        result.push({ name, type: 'Collaborator' });
      }
    }

    return { relations: result };
  } catch {
    return { relations: [] };
  }
}
