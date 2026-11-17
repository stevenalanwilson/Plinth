import { MAX_TASTE_AVOID, MAX_TASTE_SAMPLE, TasteHint } from '@shared/types';
import { HistoryEntry } from '../types/history';
import { FeedbackStatus } from '../types/feedback';
import { albumLabel } from './albumIdentity';
import { newestAnswerFirst } from './answerOrder';
import { isRated } from './libraryRetention';

// Owning, wanting or saving an album says the listener likes that kind of record. Having heard
// one is neutral: it only keeps it from being picked again.
const LIKED: readonly FeedbackStatus[] = ['save', 'own', 'want-vinyl'];

function sample(entries: readonly HistoryEntry[], limit: number): string[] {
  return entries.slice(0, limit).map((entry) => albumLabel(entry.recommendation));
}

/**
 * What to tell the server about the listener's taste, from the albums they have answered: all of
 * them to keep out of picks, and the latest few they like and dislike to steer by. Newest answers
 * first, so the lean follows where their taste is now. Nothing when they haven't answered any.
 */
export function buildTaste(history: readonly HistoryEntry[]): TasteHint | undefined {
  const answered = newestAnswerFirst(history.filter(isRated));
  if (answered.length === 0) return undefined;

  const status = (entry: HistoryEntry): FeedbackStatus | null => entry.feedback?.status ?? null;
  return {
    avoid: sample(answered, MAX_TASTE_AVOID),
    liked: sample(
      answered.filter((entry) => LIKED.some((liked) => liked === status(entry))),
      MAX_TASTE_SAMPLE,
    ),
    disliked: sample(
      answered.filter((entry) => status(entry) === 'not-for-me'),
      MAX_TASTE_SAMPLE,
    ),
  };
}
