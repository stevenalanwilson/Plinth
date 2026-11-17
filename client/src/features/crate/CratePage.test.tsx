import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HistoryEntry } from '../../types/history';
import { FeedbackStatus } from '../../types/feedback';

vi.mock('../../services/libraryExport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/libraryExport')>()),
  downloadLibrary: vi.fn(),
  parseLibraryFile: vi.fn(),
}));

import { downloadLibrary, parseLibraryFile } from '../../services/libraryExport';
import { CratePage } from './CratePage';

const mockDownload = vi.mocked(downloadLibrary);
const mockParse = vi.mocked(parseLibraryFile);

function entry(album: string, status?: FeedbackStatus | null): HistoryEntry {
  return {
    id: album,
    createdAt: '2026-11-01T10:00:00.000Z',
    recommendation: { artist: 'Artist', album, year: '2000', reason: 'Good.' },
    artworkResponse: { artworkUrl: null, year: '2000', appleMusicUrl: null },
    ...(status === undefined ? {} : { feedback: { status, at: '2026-11-02T10:00:00.000Z' } }),
  };
}

const LIBRARY = [
  entry('Unrated'),
  entry('Saved', 'save'),
  entry('Owned One', 'own'),
  entry('Owned Two', 'own'),
  entry('Wanted', 'want-vinyl'),
  entry('Rejected', 'not-for-me'),
];

interface Handlers {
  onSelect: ReturnType<typeof vi.fn>;
  onRemove: ReturnType<typeof vi.fn>;
  onClear: ReturnType<typeof vi.fn>;
  onImport: ReturnType<typeof vi.fn>;
  onFeedback: ReturnType<typeof vi.fn>;
  onOpenInsights: ReturnType<typeof vi.fn>;
}

function renderCrate(history: readonly HistoryEntry[] = LIBRARY): Handlers {
  const handlers: Handlers = {
    onSelect: vi.fn(),
    onRemove: vi.fn(),
    onClear: vi.fn(),
    onImport: vi.fn(),
    onFeedback: vi.fn(),
    onOpenInsights: vi.fn(),
  };
  render(<CratePage history={history} {...handlers} />);
  return handlers;
}

function cardNames(): string[] {
  return screen
    .queryAllByRole('button', { name: /^Load / })
    .map((card) => card.getAttribute('aria-label') ?? '');
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CratePage', () => {
  describe('the collection', () => {
    it('shows every album except the ones marked Not for me, to begin with', () => {
      renderCrate();

      expect(cardNames()).toEqual([
        'Load Unrated by Artist',
        'Load Saved by Artist, marked Save',
        'Load Owned One by Artist, marked Own it',
        'Load Owned Two by Artist, marked Own it',
        'Load Wanted by Artist, marked Want on vinyl',
      ]);
    });

    it('counts each filter on its chip', () => {
      renderCrate();

      const group = screen.getByRole('group', { name: 'Filter by answer' });
      const chip = (name: string): string =>
        within(group).getByRole('button', { name: new RegExp(`^${name}`) }).textContent ?? '';
      expect(chip('All')).toBe('All5');
      expect(chip('Saved')).toBe('Saved1');
      expect(chip('Own it')).toBe('Own it2');
      expect(chip('Want on vinyl')).toBe('Want on vinyl1');
      expect(chip('Heard it')).toBe('Heard it0');
      expect(chip('Not for me')).toBe('Not for me1');
    });

    it('starts on All', () => {
      renderCrate();

      expect(screen.getByRole('button', { name: /^All/ })).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('filtering', () => {
    it('shows only the albums with the chosen answer', async () => {
      renderCrate();

      await userEvent.click(screen.getByRole('button', { name: /^Own it/ }));

      expect(cardNames()).toEqual([
        'Load Owned One by Artist, marked Own it',
        'Load Owned Two by Artist, marked Own it',
      ]);
      expect(screen.getByRole('button', { name: /^Own it/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.getByRole('button', { name: /^All/ })).toHaveAttribute('aria-pressed', 'false');
    });

    it('shows the albums wanted on vinyl as a want list, with links, not as cards', async () => {
      renderCrate();

      await userEvent.click(screen.getByRole('button', { name: /^Want on vinyl/ }));

      const list = screen.getByRole('list');
      expect(within(list).getAllByRole('listitem')).toHaveLength(1);
      expect(
        within(list).getByRole('button', { name: 'Load Wanted by Artist' }),
      ).toBeInTheDocument();
      expect(within(list).getByRole('link', { name: 'Discogs' })).toBeInTheDocument();
      expect(document.querySelector('.history-grid')).toBeNull();
    });

    it('goes back to cards for the other filters', async () => {
      renderCrate();
      await userEvent.click(screen.getByRole('button', { name: /^Want on vinyl/ }));

      await userEvent.click(screen.getByRole('button', { name: /^Own it/ }));

      expect(screen.queryByRole('list')).not.toBeInTheDocument();
      expect(document.querySelector('.history-grid')).not.toBeNull();
    });

    it('says how to start a want list when it is empty', async () => {
      renderCrate([entry('Unrated')]);

      await userEvent.click(screen.getByRole('button', { name: /^Want on vinyl/ }));

      expect(screen.queryByRole('list')).not.toBeInTheDocument();
      expect(
        screen.getByText('Nothing on your want list yet. Tap Want on vinyl on a pick to add it.'),
      ).toBeInTheDocument();
    });

    it('marks an album as owned when it is bought', async () => {
      const { onFeedback } = renderCrate();
      await userEvent.click(screen.getByRole('button', { name: /^Want on vinyl/ }));

      await userEvent.click(screen.getByRole('button', { name: 'Mark Wanted as owned' }));

      expect(onFeedback).toHaveBeenCalledWith('Wanted', 'own');
    });

    it('opens an album from the want list', async () => {
      const { onSelect } = renderCrate();
      await userEvent.click(screen.getByRole('button', { name: /^Want on vinyl/ }));

      await userEvent.click(screen.getByRole('button', { name: 'Load Wanted by Artist' }));

      expect(onSelect).toHaveBeenCalledWith('Wanted');
    });

    it('shows the albums marked Not for me under their own filter', async () => {
      renderCrate();

      await userEvent.click(screen.getByRole('button', { name: /^Not for me/ }));

      expect(cardNames()).toEqual(['Load Rejected by Artist, marked Not for me']);
    });

    it('says so when nothing has the chosen answer', async () => {
      renderCrate();

      await userEvent.click(screen.getByRole('button', { name: /^Heard it/ }));

      expect(cardNames()).toEqual([]);
      expect(screen.getByText('No albums marked as heard yet.')).toBeInTheDocument();
    });

    it('says so when all that is left is Not for me', () => {
      renderCrate([entry('Rejected', 'not-for-me')]);

      expect(screen.getByText('Only albums marked Not for me so far.')).toBeInTheDocument();
    });

    it('returns to everything from All', async () => {
      renderCrate();
      await userEvent.click(screen.getByRole('button', { name: /^Own it/ }));

      await userEvent.click(screen.getByRole('button', { name: /^All/ }));

      expect(cardNames()).toHaveLength(5);
    });
  });

  describe('an empty crate', () => {
    it('explains itself and offers no filters', () => {
      renderCrate([]);

      expect(screen.getByText(/Your crate is empty/)).toBeInTheDocument();
      expect(screen.queryByRole('group', { name: 'Filter by answer' })).not.toBeInTheDocument();
    });

    it('still lets a saved crate be imported, but not exported or cleared', () => {
      renderCrate([]);

      expect(screen.getByRole('button', { name: 'Import' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Clear crate' })).toBeDisabled();
    });
  });

  describe('opening an album', () => {
    it('hands over the album that was tapped', async () => {
      const { onSelect } = renderCrate();

      await userEvent.click(
        screen.getByRole('button', { name: 'Load Wanted by Artist, marked Want on vinyl' }),
      );

      expect(onSelect).toHaveBeenCalledWith('Wanted');
    });
  });

  describe('library actions', () => {
    it('opens the insights', async () => {
      const { onOpenInsights } = renderCrate();

      await userEvent.click(screen.getByRole('button', { name: 'Insights' }));

      expect(onOpenInsights).toHaveBeenCalled();
    });

    it('exports the whole library, including what is filtered out of view', async () => {
      renderCrate();
      await userEvent.click(screen.getByRole('button', { name: /^Own it/ }));

      await userEvent.click(screen.getByRole('button', { name: 'Export' }));

      expect(mockDownload).toHaveBeenCalledWith(LIBRARY);
    });

    it('asks before clearing, and clears on the second tap', async () => {
      const { onClear } = renderCrate();

      await userEvent.click(screen.getByRole('button', { name: 'Clear crate' }));
      expect(onClear).not.toHaveBeenCalled();

      await userEvent.click(screen.getByRole('button', { name: 'Tap again to clear it all' }));
      expect(onClear).toHaveBeenCalledTimes(1);
    });
  });

  describe('importing', () => {
    function file(): File {
      return new File(['{}'], 'plinth-library.json', { type: 'application/json' });
    }

    it('hands the albums in the file over to be merged', async () => {
      const imported = [entry('Imported', 'own')];
      mockParse.mockResolvedValue(imported);
      const { onImport } = renderCrate();

      await userEvent.upload(screen.getByLabelText('Import a crate file'), file());

      await waitFor(() => expect(onImport).toHaveBeenCalledWith(imported));
    });

    it('shows why a file could not be imported, and can be dismissed', async () => {
      mockParse.mockRejectedValue(new Error('Not a valid JSON file.'));
      const { onImport } = renderCrate();

      await userEvent.upload(screen.getByLabelText('Import a crate file'), file());

      expect(await screen.findByRole('alert')).toHaveTextContent('Not a valid JSON file.');
      expect(onImport).not.toHaveBeenCalled();

      await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('clears an earlier error when another file is chosen', async () => {
      mockParse.mockRejectedValueOnce(new Error('Bad file.')).mockResolvedValueOnce([]);
      renderCrate();
      const input = screen.getByLabelText('Import a crate file');

      await userEvent.upload(input, file());
      await screen.findByRole('alert');
      fireEvent.change(input, { target: { files: [file()] } });

      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    });

    it('opens the file chooser from the Import button', async () => {
      renderCrate();
      const input = screen.getByLabelText('Import a crate file') as HTMLInputElement;
      const click = vi.spyOn(input, 'click');

      await userEvent.click(screen.getByRole('button', { name: 'Import' }));

      expect(click).toHaveBeenCalled();
    });
  });
});
