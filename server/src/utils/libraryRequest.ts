import {
  Feedback,
  FEEDBACK_STATUSES,
  LIBRARY_SYNC_MAX_DELETIONS,
  LIBRARY_SYNC_MAX_ITEMS,
  LibraryDeletion,
  LibraryItem,
  LibrarySyncRequest,
} from '@shared/types';

// Generous for anything real, and what stops one account storing a great deal in one album.
const MAX_NAME_LENGTH = 300;
const MAX_REASON_LENGTH = 4000;
const MAX_URL_LENGTH = 2000;
const MAX_SHORT_LENGTH = 100;
const MAX_GENRES = 20;
const MAX_KEY_LENGTH = MAX_NAME_LENGTH * 2 + 1;

export type ParsedLibraryRequest =
  | { readonly request: LibrarySyncRequest }
  | { readonly error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(
  value: unknown,
  maxLength: number,
  options: { allowEmpty?: boolean } = {},
): string | null {
  if (typeof value !== 'string' || value.length > maxLength) return null;
  return value === '' && !options.allowEmpty ? null : value;
}

function optionalText(value: unknown, maxLength: number): string | undefined | null {
  if (value === undefined || value === null) return undefined;
  return text(value, maxLength);
}

function nullableUrl(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || value.length > MAX_URL_LENGTH) return undefined;
  return /^https?:\/\//i.test(value) ? value : undefined;
}

function nullableText(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  return text(value, MAX_SHORT_LENGTH, { allowEmpty: true }) ?? undefined;
}

function isoDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function parseItem(raw: unknown): LibraryItem | null {
  if (!isRecord(raw) || !isRecord(raw.recommendation)) return null;
  const pick = raw.recommendation;
  const artist = text(pick.artist, MAX_NAME_LENGTH);
  const album = text(pick.album, MAX_NAME_LENGTH);
  const year = text(pick.year, MAX_SHORT_LENGTH, { allowEmpty: true });
  const reason = text(pick.reason, MAX_REASON_LENGTH, { allowEmpty: true });
  const createdAt = isoDate(raw.createdAt);
  if (artist === null || album === null || year === null || reason === null || createdAt === null) {
    return null;
  }

  const country = optionalText(pick.country, MAX_SHORT_LENGTH);
  const slug = optionalText(pick.slug, MAX_NAME_LENGTH);
  const hook = optionalText(pick.hook, MAX_REASON_LENGTH);
  const releaseGroupId = optionalText(pick.releaseGroupId, MAX_SHORT_LENGTH);
  if (country === null || slug === null || hook === null || releaseGroupId === null) return null;

  let genres: string[] | undefined;
  if (pick.genres !== undefined) {
    if (
      !Array.isArray(pick.genres) ||
      pick.genres.length > MAX_GENRES ||
      !pick.genres.every((genre) => text(genre, MAX_SHORT_LENGTH) !== null)
    ) {
      return null;
    }
    genres = pick.genres as string[];
  }

  const artwork = isRecord(raw.artwork) ? raw.artwork : {};
  const artworkUrl = nullableUrl(artwork.artworkUrl);
  const appleMusicUrl = nullableUrl(artwork.appleMusicUrl);
  const artworkYear = nullableText(artwork.year);
  if (artworkUrl === undefined || appleMusicUrl === undefined || artworkYear === undefined) {
    return null;
  }

  let feedback: LibraryItem['feedback'];
  if (raw.feedback !== undefined) {
    if (!isRecord(raw.feedback)) return null;
    const at = isoDate(raw.feedback.at);
    const { status } = raw.feedback;
    const known = status === null || FEEDBACK_STATUSES.some((allowed) => allowed === status);
    if (at === null || !known) return null;
    feedback = { status: status as Feedback['status'], at };
  }

  return {
    recommendation: {
      artist,
      album,
      year,
      reason,
      ...(genres && genres.length > 0 ? { genres } : {}),
      ...(country !== undefined ? { country } : {}),
      ...(releaseGroupId !== undefined ? { releaseGroupId } : {}),
      ...(hook !== undefined ? { hook } : {}),
      ...(slug !== undefined ? { slug } : {}),
    },
    artwork: { artworkUrl, year: artworkYear, appleMusicUrl },
    createdAt,
    ...(feedback ? { feedback } : {}),
  };
}

function parseDeletion(raw: unknown): LibraryDeletion | null {
  if (!isRecord(raw)) return null;
  const key = text(raw.key, MAX_KEY_LENGTH);
  const at = isoDate(raw.at);
  return key === null || at === null ? null : { key, at };
}

/** Reads a sync request from a request body, keeping only the fields it knows. */
export function parseLibrarySyncRequest(body: unknown): ParsedLibraryRequest {
  if (!isRecord(body)) return { error: 'The request must be an object.' };

  let since: string | null = null;
  if (body.since !== null && body.since !== undefined) {
    since = isoDate(body.since);
    if (since === null) return { error: 'since must be a date or null.' };
  }

  const { items: rawItems = [], deletions: rawDeletions = [] } = body;
  if (!Array.isArray(rawItems) || !Array.isArray(rawDeletions)) {
    return { error: 'items and deletions must be lists.' };
  }
  if (rawItems.length > LIBRARY_SYNC_MAX_ITEMS) {
    return { error: `Send at most ${LIBRARY_SYNC_MAX_ITEMS} albums at a time.` };
  }
  if (rawDeletions.length > LIBRARY_SYNC_MAX_DELETIONS) {
    return { error: `Send at most ${LIBRARY_SYNC_MAX_DELETIONS} removals at a time.` };
  }

  const items: LibraryItem[] = [];
  for (const raw of rawItems) {
    const item = parseItem(raw);
    if (!item) return { error: 'An album in the request is not valid.' };
    items.push(item);
  }

  const deletions: LibraryDeletion[] = [];
  for (const raw of rawDeletions) {
    const deletion = parseDeletion(raw);
    if (!deletion) return { error: 'A removal in the request is not valid.' };
    deletions.push(deletion);
  }

  return { request: { since, items, deletions } };
}
