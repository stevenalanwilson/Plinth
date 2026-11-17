import React, { useState } from 'react';
import { HistoryEntry } from '../../types/history';
import { getProxiedArtworkUrl } from '../../services/apiClient';
import { ListeningLinks } from '../../components/ListeningLinks';
import { PlaceholderSleeve } from '../../components/PlaceholderSleeve';
import { newestAnswerFirst } from './wantOrder';

interface WantListProps {
  readonly entries: readonly HistoryEntry[];
  /** Brings an album back as the pick on screen. */
  readonly onSelect: (id: string) => void;
  /** The listener has bought it: it leaves the want list and becomes one they own. */
  readonly onGotIt: (id: string) => void;
}

function WantCover({ entry }: { readonly entry: HistoryEntry }): React.ReactElement {
  const [failed, setFailed] = useState(false);
  const { artist, album } = entry.recommendation;
  const { artworkUrl } = entry.artworkResponse;

  if (!artworkUrl || failed) return <PlaceholderSleeve artist={artist} album={album} compact />;
  return (
    <img
      src={getProxiedArtworkUrl(artworkUrl)}
      alt={`${album} album artwork`}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

/** The albums the listener wants on vinyl, newest first, each with where to hear or buy it. */
export function WantList({ entries, onSelect, onGotIt }: WantListProps): React.ReactElement {
  return (
    <ul className="want-list">
      {newestAnswerFirst(entries).map((entry) => {
        const { artist, album, year } = entry.recommendation;
        return (
          <li key={entry.id} className="want-row">
            <div className="want-cover">
              <WantCover entry={entry} />
            </div>
            <div className="want-body">
              <button
                type="button"
                className="want-title"
                aria-label={`Load ${album} by ${artist}`}
                onClick={() => onSelect(entry.id)}
              >
                {album}
              </button>
              <div className="want-meta">
                {artist} · {year}
              </div>
              <div className="want-actions">
                <ListeningLinks
                  artist={artist}
                  album={album}
                  appleMusicUrl={entry.artworkResponse.appleMusicUrl}
                />
                <button
                  type="button"
                  className="want-got-it"
                  aria-label={`Mark ${album} as owned`}
                  onClick={() => onGotIt(entry.id)}
                >
                  Got it
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
