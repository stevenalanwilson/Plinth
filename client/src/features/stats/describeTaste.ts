import { HistoryEntry } from '../../types/history';
import { FeedbackStatus } from '../../types/feedback';
import { getDecadeBucket } from './statsUtils';

// How much each album says about the listener's taste. Owning or wanting one says the most; a pick
// that was never answered is a weak signal; one marked "Not for me" says nothing in its favour.
// Keyed on the statuses, so adding one without a weight fails the type check.
const WEIGHTS: Record<FeedbackStatus | 'unanswered', number> = {
  own: 3,
  'want-vinyl': 3,
  save: 2,
  heard: 1,
  unanswered: 1,
  'not-for-me': 0,
};

// Too few albums and any pattern is chance.
const MIN_ALBUMS = 5;
// A genre has to account for a quarter of the weight to be named, a decade or country two fifths.
const GENRE_SHARE = 0.25;
const PLACE_SHARE = 0.4;
const MAX_GENRES = 2;
// "You tend to pass on" needs a few passes, and most of them in one genre.
const MIN_PASSES = 3;
const PASS_SHARE = 0.5;

// Countries that are written with "the": "from the UK", but "from Germany".
const WITH_ARTICLE = new Set([
  'uk',
  'usa',
  'united kingdom',
  'united states',
  'united states of america',
  'netherlands',
  'philippines',
  'czech republic',
  'united arab emirates',
]);

export interface TasteSummary {
  /** One to three sentences in plain English. */
  readonly text: string;
  /** How many albums it was worked out from. */
  readonly albumCount: number;
}

interface Tally {
  readonly label: string;
  readonly weight: number;
}

function weightOf(entry: HistoryEntry): number {
  return WEIGHTS[entry.feedback?.status ?? 'unanswered'];
}

/** Adds up the weight behind each label, merging labels that differ only in case. */
function tally(
  entries: readonly HistoryEntry[],
  labelsOf: (entry: HistoryEntry) => readonly string[],
  weigh: (entry: HistoryEntry) => number,
): Tally[] {
  const totals = new Map<string, Tally>();
  for (const entry of entries) {
    for (const label of new Set(labelsOf(entry))) {
      const key = label.toLowerCase();
      const current = totals.get(key);
      totals.set(key, {
        label: current?.label ?? label,
        weight: (current?.weight ?? 0) + weigh(entry),
      });
    }
  }
  // Ties are broken by name so the same library always reads the same.
  return [...totals.values()].sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label));
}

/** The labels that carry at least `minShare` of the weight of the albums that have any label. */
function dominant(
  entries: readonly HistoryEntry[],
  labelsOf: (entry: HistoryEntry) => readonly string[],
  minShare: number,
  max: number,
): string[] {
  const labelled = entries.filter((entry) => labelsOf(entry).length > 0);
  const total = labelled.reduce((sum, entry) => sum + weightOf(entry), 0);
  if (total === 0) return [];
  return tally(labelled, labelsOf, weightOf)
    .filter((item) => item.weight / total >= minShare)
    .slice(0, max)
    .map((item) => item.label);
}

const genresOf = (entry: HistoryEntry): readonly string[] => entry.recommendation.genres ?? [];

function decadeOf(entry: HistoryEntry): readonly string[] {
  const decade = getDecadeBucket(entry.recommendation.year);
  return decade === 'Unknown' ? [] : [decade];
}

const countryOf = (entry: HistoryEntry): readonly string[] =>
  entry.recommendation.country ? [entry.recommendation.country] : [];

function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function withArticle(country: string): string {
  return WITH_ARTICLE.has(country.toLowerCase()) ? `the ${country}` : country;
}

function leanSentence(entries: readonly HistoryEntry[], genres: readonly string[]): string {
  const [decade] = dominant(entries, decadeOf, PLACE_SHARE, 1);
  const [country] = dominant(entries, countryOf, PLACE_SHARE, 1);
  const places = [...(decade ? [`the ${decade}`] : []), ...(country ? [withArticle(country)] : [])];

  if (genres.length > 0) {
    const where = places.length > 0 ? `, mostly from ${joinList(places)}` : '';
    return `You lean towards ${joinList(genres)}${where}.`;
  }
  if (places.length > 0) return `Your picks are mostly from ${joinList(places)}.`;
  return 'Your picks are wide-ranging so far: no single style, era or country stands out.';
}

/** "You tend to pass on X", when most of what the listener turned down was one genre. */
function passSentence(
  entries: readonly HistoryEntry[],
  alreadyLeaningTowards: readonly string[],
): string | null {
  const passed = entries.filter((entry) => entry.feedback?.status === 'not-for-me');
  if (passed.length < MIN_PASSES) return null;

  const withGenres = passed.filter((entry) => genresOf(entry).length > 0);
  const [top] = tally(withGenres, genresOf, () => 1);
  if (!top || top.weight / withGenres.length < PASS_SHARE) return null;
  // Passing on a genre they also lean towards would contradict the sentence before it.
  if (alreadyLeaningTowards.some((genre) => genre.toLowerCase() === top.label.toLowerCase())) {
    return null;
  }
  return `You tend to pass on ${top.label}.`;
}

/**
 * Describes the listener's taste in a sentence or two, from the genres, decades and countries of
 * their albums, counting the ones they own or want most. Null until there is enough to say.
 */
export function describeTaste(history: readonly HistoryEntry[]): TasteSummary | null {
  const counted = history.filter((entry) => weightOf(entry) > 0);
  if (counted.length < MIN_ALBUMS) return null;

  const genres = dominant(history, genresOf, GENRE_SHARE, MAX_GENRES);
  const sentences = [leanSentence(history, genres), passSentence(history, genres)];

  return {
    text: sentences.filter((sentence): sentence is string => sentence !== null).join(' '),
    albumCount: history.length,
  };
}
