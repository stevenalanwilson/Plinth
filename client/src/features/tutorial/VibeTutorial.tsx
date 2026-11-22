import React, { useEffect, useState } from 'react';
import { pillStyle } from '../../components/pillStyle';
import { PlaceholderSleeve } from '../../components/PlaceholderSleeve';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { TUTORIAL_EXAMPLES, TUTORIAL_GENRES, TUTORIAL_MOODS } from './tutorialExamples';
import {
  examplesLength,
  hasReached,
  playLength,
  positionAt,
  STEP_CAPTIONS,
  STILL_POSITION,
  TutorialPosition,
} from './tutorialTimeline';
import { useTutorialPlayback } from './useTutorialPlayback';
import { useFirstInteraction } from './useFirstInteraction';
import { useDemoArtwork } from './useDemoArtwork';

const FIRST = TUTORIAL_EXAMPLES[0];
const EXAMPLES_LENGTH_MS = examplesLength(TUTORIAL_EXAMPLES.length);
const PLAY_LENGTH_MS = playLength(TUTORIAL_EXAMPLES.length);

function typedVibe(vibe: string, position: TutorialPosition): string {
  if (position.phase === 'reset') return '';
  if (position.phase !== 'vibe') return vibe;
  return vibe.slice(0, Math.ceil(position.progress * vibe.length));
}

interface DemoPillsProps {
  readonly options: readonly string[];
  readonly chosen: string | null;
}

function DemoPills({ options, chosen }: DemoPillsProps): React.ReactElement {
  return (
    <div className="vibe-tutorial-pills">
      {options.map((option) => (
        <span
          key={option}
          className="vibe-tutorial-pill"
          data-lit={option === chosen}
          style={{ ...pillStyle(option === chosen), cursor: 'default' }}
        >
          {option}
        </span>
      ))}
    </div>
  );
}

interface VibeTutorialProps {
  /** Whether the demo has finished or been cut short. It then holds on its last page, faded. */
  readonly isOver: boolean;
  /** Called once the demo has played through, or as soon as the visitor starts using the site. */
  readonly onEnd: () => void;
}

interface DemoSleeveProps {
  readonly artist: string;
  readonly album: string;
  readonly coverUrl: string | null;
}

function DemoSleeve({ artist, album, coverUrl }: DemoSleeveProps): React.ReactElement {
  const [coverFailed, setCoverFailed] = useState(false);
  if (coverUrl && !coverFailed) {
    return <img src={coverUrl} alt="" onError={() => setCoverFailed(true)} />;
  }
  return <PlaceholderSleeve artist={artist} album={album} compact />;
}

/**
 * Shows someone who hasn't had a pick yet how Plinth works: a vibe is typed, a genre and a mood
 * are chosen, the button is pressed and a record turns up. It plays in a copy of the settings,
 * never the real ones, with one example and then a closing page.
 */
export function VibeTutorial({ isOver, onEnd }: VibeTutorialProps): React.ReactElement {
  const prefersReducedMotion = usePrefersReducedMotion();
  // Coming back to the page after the demo ended shows it as it was left, without replaying.
  const [startedOver] = useState(isOver);
  const elapsedMs = useTutorialPlayback(!isOver && !prefersReducedMotion);
  useFirstInteraction(!isOver, onEnd);

  useEffect(() => {
    if (!isOver && elapsedMs >= PLAY_LENGTH_MS) onEnd();
  }, [elapsedMs, isOver, onEnd]);

  // Skipping, or starting to use the site, jumps straight to the last page.
  const isOnLastPage = isOver || elapsedMs >= EXAMPLES_LENGTH_MS;
  const position = prefersReducedMotion
    ? STILL_POSITION
    : positionAt(Math.min(elapsedMs, EXAMPLES_LENGTH_MS - 1), TUTORIAL_EXAMPLES.length);
  const example = TUTORIAL_EXAMPLES[position.exampleIndex] ?? FIRST;
  const { phase } = position;
  // Not looked up when coming back to a demo that ended, as its record is no longer shown.
  const coverUrl = useDemoArtwork(example.artist, example.album, !startedOver);
  const resultState = phase === 'found' ? 'found' : phase === 'finding' ? 'finding' : 'waiting';

  return (
    <section
      className="vibe-tutorial"
      aria-labelledby="vibe-tutorial-title"
      data-over={isOver}
      data-started-over={startedOver}
    >
      <h2 id="vibe-tutorial-title" className="vibe-tutorial-title" data-faded={isOnLastPage}>
        Plinth: Find your vibe
      </h2>
      <p className="visually-hidden">
        Describe your vibe, pick a genre and a mood, then ask Plinth. For example, “{FIRST.vibe}”
        with {FIRST.genre} and {FIRST.mood} might turn up {FIRST.album} by {FIRST.artist}.
      </p>

      <div className="vibe-tutorial-top">
        <p className="vibe-tutorial-step" aria-hidden="true">
          {isOnLastPage ? '' : STEP_CAPTIONS[phase]}
        </p>
        {!isOnLastPage && (
          <button type="button" className="vibe-tutorial-toggle" onClick={onEnd}>
            Skip demo
          </button>
        )}
      </div>

      <div className="vibe-tutorial-frame" data-last-page={isOnLastPage}>
        <div
          className="vibe-tutorial-stage"
          data-testid="vibe-tutorial-stage"
          data-result={resultState}
          aria-hidden="true"
        >
          <div className="vibe-tutorial-settings">
            <p className="vibe-tutorial-label">Describe your vibe</p>
            <p className="vibe-tutorial-vibe" data-typing={phase === 'vibe'}>
              {typedVibe(example.vibe, position)}
            </p>
            <p className="vibe-tutorial-label">Genres</p>
            <DemoPills
              options={TUTORIAL_GENRES}
              chosen={hasReached(phase, 'genre') ? example.genre : null}
            />
            <p className="vibe-tutorial-label">Mood</p>
            <DemoPills
              options={TUTORIAL_MOODS}
              chosen={hasReached(phase, 'mood') ? example.mood : null}
            />
            <span className="vibe-tutorial-ask" data-pressed={phase === 'ask'}>
              Find me something to listen to
            </span>
          </div>

          <div className="vibe-tutorial-result" data-state={resultState}>
            {resultState === 'waiting' && <span className="vibe-tutorial-note">♪</span>}
            {resultState === 'finding' && <span className="vibe-tutorial-spinner" />}
            {resultState === 'found' && (
              <div key={example.album} className="vibe-tutorial-record">
                <div className="vibe-tutorial-sleeve">
                  <DemoSleeve artist={example.artist} album={example.album} coverUrl={coverUrl} />
                </div>
                <p className="vibe-tutorial-album">{example.album}</p>
                <p className="vibe-tutorial-artist">
                  {example.artist} · {example.year}
                </p>
                <p className="vibe-tutorial-hook">{example.hook}</p>
              </div>
            )}
          </div>
        </div>
        {isOnLastPage && (
          <div className="vibe-tutorial-last-page">
            <p className="vibe-tutorial-last-title">Find your vibe</p>
          </div>
        )}
      </div>

      <p className="vibe-tutorial-prompt">
        Your turn. Set your vibe and Plinth will find one for you.
      </p>
    </section>
  );
}
