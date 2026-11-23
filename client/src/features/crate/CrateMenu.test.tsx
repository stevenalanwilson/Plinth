import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HistoryEntry } from '../../types/history';

vi.mock('../../services/libraryExport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/libraryExport')>()),
  downloadLibrary: vi.fn(),
  parseLibraryFile: vi.fn(),
}));

import { downloadLibrary, parseLibraryFile } from '../../services/libraryExport';
import { CrateMenu, CrateView } from './CrateMenu';

const mockDownload = vi.mocked(downloadLibrary);
const mockParse = vi.mocked(parseLibraryFile);

function entry(album: string): HistoryEntry {
  return {
    id: album,
    createdAt: '2026-11-01T10:00:00.000Z',
    recommendation: { artist: 'Artist', album, year: '2000', reason: 'Good.' },
    artworkResponse: { artworkUrl: null, year: '2000', appleMusicUrl: null },
  };
}

const LIBRARY = [entry('One'), entry('Two')];

interface Handlers {
  onNavigate: ReturnType<typeof vi.fn>;
  onImport: ReturnType<typeof vi.fn>;
  onClear: ReturnType<typeof vi.fn>;
}

function renderMenu(
  options: { view?: CrateView; history?: readonly HistoryEntry[] } = {},
): Handlers {
  const handlers: Handlers = { onNavigate: vi.fn(), onImport: vi.fn(), onClear: vi.fn() };
  render(
    <CrateMenu view={options.view ?? 'crate'} history={options.history ?? LIBRARY} {...handlers} />,
  );
  return handlers;
}

function file(): File {
  return new File(['{}'], 'plinth-library.json', { type: 'application/json' });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CrateMenu', () => {
  describe('the pages', () => {
    it('names the crate page and marks My crate as the one you are on', () => {
      renderMenu({ view: 'crate' });

      expect(screen.getByRole('heading', { name: 'Your Crate' })).toBeInTheDocument();
      const nav = screen.getByRole('navigation', { name: 'Crate' });
      expect(within(nav).getByRole('button', { name: 'My crate' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      expect(within(nav).getByRole('button', { name: 'Insights' })).not.toHaveAttribute(
        'aria-current',
      );
    });

    it('names the insights page and marks Insights as the one you are on', () => {
      renderMenu({ view: 'insights' });

      expect(screen.getByRole('heading', { name: 'Insights' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Insights' })).toHaveAttribute(
        'aria-current',
        'page',
      );
    });

    it('goes to the page that is tapped', async () => {
      const { onNavigate } = renderMenu({ view: 'crate' });

      await userEvent.click(screen.getByRole('button', { name: 'Insights' }));
      expect(onNavigate).toHaveBeenCalledWith('insights');

      await userEvent.click(screen.getByRole('button', { name: 'My crate' }));
      expect(onNavigate).toHaveBeenCalledWith('crate');
    });
    it('names the top 3 page and marks My top 3 as the one you are on', () => {
      renderMenu({ view: 'top3' });

      expect(screen.getByRole('heading', { name: 'My top 3' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'My top 3' })).toHaveAttribute(
        'aria-current',
        'page',
      );
    });

    it('goes to My top 3 when it is tapped', async () => {
      const { onNavigate } = renderMenu({ view: 'crate' });

      await userEvent.click(screen.getByRole('button', { name: 'My top 3' }));

      expect(onNavigate).toHaveBeenCalledWith('top3');
    });

    it('leaves out the actions on the whole crate where they do not apply', () => {
      renderMenu({ view: 'top3' });

      expect(screen.queryByRole('group', { name: 'Crate actions' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Import' })).not.toBeInTheDocument();
    });
  });

  describe('an empty crate', () => {
    it('still lets a saved crate be imported, but not exported or cleared', () => {
      renderMenu({ history: [] });

      expect(screen.getByRole('button', { name: 'Import' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Clear crate' })).toBeDisabled();
    });
  });

  describe('crate actions', () => {
    it('exports the whole library', async () => {
      renderMenu();

      await userEvent.click(screen.getByRole('button', { name: 'Export' }));

      expect(mockDownload).toHaveBeenCalledWith(LIBRARY);
    });

    it('works the same from Insights', async () => {
      renderMenu({ view: 'insights' });

      await userEvent.click(screen.getByRole('button', { name: 'Export' }));

      expect(mockDownload).toHaveBeenCalledWith(LIBRARY);
    });

    it('asks before clearing, and clears on the second tap', async () => {
      const { onClear } = renderMenu();

      await userEvent.click(screen.getByRole('button', { name: 'Clear crate' }));
      expect(onClear).not.toHaveBeenCalled();

      await userEvent.click(screen.getByRole('button', { name: 'Tap again to clear it all' }));
      expect(onClear).toHaveBeenCalledTimes(1);
    });
  });

  describe('importing', () => {
    it('hands the albums in the file over to be merged', async () => {
      const imported = [entry('Imported')];
      mockParse.mockResolvedValue(imported);
      const { onImport } = renderMenu();

      await userEvent.upload(screen.getByLabelText('Import a crate file'), file());

      await waitFor(() => expect(onImport).toHaveBeenCalledWith(imported));
    });

    it('shows why a file could not be imported, and can be dismissed', async () => {
      mockParse.mockRejectedValue(new Error('Not a valid JSON file.'));
      const { onImport } = renderMenu();

      await userEvent.upload(screen.getByLabelText('Import a crate file'), file());

      expect(await screen.findByRole('alert')).toHaveTextContent('Not a valid JSON file.');
      expect(onImport).not.toHaveBeenCalled();

      await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('clears an earlier error when another file is chosen', async () => {
      mockParse.mockRejectedValueOnce(new Error('Bad file.')).mockResolvedValueOnce([]);
      renderMenu();
      const input = screen.getByLabelText('Import a crate file');

      await userEvent.upload(input, file());
      await screen.findByRole('alert');
      fireEvent.change(input, { target: { files: [file()] } });

      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    });

    it('opens the file chooser from the Import button', async () => {
      renderMenu();
      const input = screen.getByLabelText('Import a crate file') as HTMLInputElement;
      const click = vi.spyOn(input, 'click');

      await userEvent.click(screen.getByRole('button', { name: 'Import' }));

      expect(click).toHaveBeenCalled();
    });
  });
});
