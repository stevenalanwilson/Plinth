import { HistoryEntry } from '../types/history';
import { parseFeedback } from '../types/feedback';
import { pruneLibrary } from './libraryRetention';
import { albumKeys } from './albumIdentity';

// Version 2 added each album's feedback. Files without it (version 1) still import.
export interface LibraryExportFile {
  readonly version: 2;
  readonly exportedAt: string;
  readonly history: HistoryEntry[];
}

export function buildLibraryExport(history: readonly HistoryEntry[]): LibraryExportFile {
  return {
    version: 2,
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

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
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
    // The permalink, hook and MusicBrainz ID are what make a pick an album page and let its
    // cover be found exactly, so they travel with the entry.
    const slug = nonEmptyString(rec['slug']);
    const hook = nonEmptyString(rec['hook']);
    const releaseGroupId = nonEmptyString(rec['releaseGroupId']);
    const feedback = parseFeedback(r['feedback']);

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
        ...(slug !== undefined ? { slug } : {}),
        ...(hook !== undefined ? { hook } : {}),
        ...(releaseGroupId !== undefined ? { releaseGroupId } : {}),
      },
      artworkResponse,
      ...(feedback ? { feedback } : {}),
    });
  }

  return entries;
}

// Thin wrapper for use in the browser where File.prototype.text() is available.
export async function parseLibraryFile(file: File): Promise<HistoryEntry[]> {
  const text = await file.text();
  return parseLibraryJson(text);
}

/** Keeps the entry's own details, but takes the other's verdict when it was given more recently. */
function withNewerFeedback(kept: HistoryEntry, other: HistoryEntry): HistoryEntry {
  if (!other.feedback) return kept;
  if (kept.feedback && Date.parse(other.feedback.at) <= Date.parse(kept.feedback.at)) return kept;
  return { ...kept, feedback: other.feedback };
}

export function mergeHistory(
  existing: readonly HistoryEntry[],
  imported: readonly HistoryEntry[],
): HistoryEntry[] {
  // Existing entries take precedence — they are registered first. Only the verdict is
  // merged, and the later one wins, so a rating made on another device isn't lost.
  const result: HistoryEntry[] = [];
  const positionByKey = new Map<string, number>();

  for (const entry of [...existing, ...imported]) {
    const keys = albumKeys(entry.recommendation);
    const seenAt = keys.map((key) => positionByKey.get(key)).find((index) => index !== undefined);

    if (seenAt !== undefined) {
      result[seenAt] = withNewerFeedback(result[seenAt], entry);
      keys.forEach((key) => positionByKey.set(key, seenAt));
      continue;
    }

    keys.forEach((key) => positionByKey.set(key, result.length));
    result.push(entry);
  }

  // Sort by createdAt descending (newest first)
  result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return pruneLibrary(result);
}
