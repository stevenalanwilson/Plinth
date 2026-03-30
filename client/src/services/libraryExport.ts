import { HistoryEntry } from '../types/history';

export interface LibraryExportFile {
  readonly version: 1;
  readonly exportedAt: string;
  readonly history: HistoryEntry[];
}

export function buildLibraryExport(history: readonly HistoryEntry[]): LibraryExportFile {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    history: [...history],
  };
}

export function downloadLibrary(history: readonly HistoryEntry[]): void {
  const data = buildLibraryExport(history);
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const date = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = `plinth-library-${date}.json`;
  a.click();

  URL.revokeObjectURL(url);
}

// Parses and validates a raw JSON string. Throws a descriptive Error on invalid input.
export function parseLibraryJson(json: string): HistoryEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    throw new Error('Not a valid JSON file.');
  }

  if (typeof parsed !== 'object' || parsed === null || !('history' in parsed)) {
    throw new Error('File is missing a history array.');
  }

  const { history } = parsed as Record<string, unknown>;
  if (!Array.isArray(history)) {
    throw new Error('File is missing a history array.');
  }

  const entries: HistoryEntry[] = [];
  for (const raw of history) {
    if (typeof raw !== 'object' || raw === null) continue;

    const r = raw as Record<string, unknown>;
    const rec = r['recommendation'] as Record<string, unknown> | undefined;

    if (
      !rec ||
      typeof rec['artist'] !== 'string' ||
      typeof rec['album'] !== 'string' ||
      typeof rec['year'] !== 'string' ||
      typeof rec['reason'] !== 'string'
    ) {
      throw new Error(`An entry is missing required fields (artist, album, year, reason).`);
    }

    // Preserve original createdAt if it's a valid ISO date, otherwise use now
    const rawCreatedAt = r['createdAt'];
    const createdAt =
      typeof rawCreatedAt === 'string' && !isNaN(Date.parse(rawCreatedAt))
        ? rawCreatedAt
        : new Date().toISOString();

    // Validate artworkResponse if present, otherwise use a safe default
    const rawArtwork = r['artworkResponse'] as Record<string, unknown> | undefined;
    const artworkResponse = {
      artworkUrl: typeof rawArtwork?.['artworkUrl'] === 'string' ? rawArtwork['artworkUrl'] : null,
      year: typeof rawArtwork?.['year'] === 'string' ? rawArtwork['year'] : rec['year'],
      appleMusicUrl:
        typeof rawArtwork?.['appleMusicUrl'] === 'string' ? rawArtwork['appleMusicUrl'] : null,
    };

    const genres = Array.isArray(rec['genres'])
      ? (rec['genres'] as unknown[]).filter((g): g is string => typeof g === 'string')
      : undefined;
    const country = typeof rec['country'] === 'string' ? rec['country'] : undefined;

    entries.push({
      // Always generate a fresh UUID to avoid ID collisions with existing history
      id: crypto.randomUUID(),
      createdAt,
      recommendation: {
        artist: rec['artist'],
        album: rec['album'],
        year: rec['year'],
        reason: rec['reason'],
        ...(genres !== undefined && genres.length > 0 ? { genres } : {}),
        ...(country !== undefined ? { country } : {}),
      },
      artworkResponse,
    });
  }

  return entries;
}

// Thin wrapper for use in the browser where File.prototype.text() is available.
export async function parseLibraryFile(file: File): Promise<HistoryEntry[]> {
  const text = await file.text();
  return parseLibraryJson(text);
}

const HISTORY_MAX = 50;

export function mergeHistory(
  existing: readonly HistoryEntry[],
  imported: readonly HistoryEntry[],
): HistoryEntry[] {
  // Existing entries take precedence — their key is registered first
  const seen = new Set<string>();
  const result: HistoryEntry[] = [];

  for (const entry of [...existing, ...imported]) {
    const key = `${entry.recommendation.artist.toLowerCase()}|${entry.recommendation.album.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(entry);
  }

  // Sort by createdAt descending (newest first)
  result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return result.slice(0, HISTORY_MAX);
}
