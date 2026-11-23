import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArtistSearchBox } from './ArtistSearchBox';
import { SuggestionOption } from './useArtistSuggestions';

const OPTIONS: SuggestionOption[] = [
  { key: 'mb:a1', name: 'Nirvana', detail: 'US grunge band', artistId: 'a1' },
  { key: 'mb:a2', name: 'Nirvana', detail: '60s band from the UK', artistId: 'a2' },
  { key: 'crate:nina', name: 'Nina Simone', detail: 'In your crate', artistId: null },
];

const onChoose = vi.fn();
const onSubmit = vi.fn();

function Harness({
  options = OPTIONS,
  disabled = false,
  isSearching = false,
}: {
  readonly options?: SuggestionOption[];
  readonly disabled?: boolean;
  readonly isSearching?: boolean;
}): React.ReactElement {
  const [value, setValue] = useState('');
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <ArtistSearchBox
        value={value}
        onChange={setValue}
        options={options}
        isSearching={isSearching}
        onChoose={onChoose}
        disabled={disabled}
      />
    </form>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

async function typeIn(text = 'ni'): Promise<void> {
  await userEvent.type(screen.getByRole('combobox', { name: 'Artist name' }), text);
}

describe('ArtistSearchBox', () => {
  it('is a combobox that starts with its list closed', () => {
    render(<Harness />);

    const box = screen.getByRole('combobox', { name: 'Artist name' });
    expect(box).toHaveAttribute('aria-expanded', 'false');
    expect(box).toHaveAttribute('aria-autocomplete', 'list');
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('offers the artists, with what tells them apart, once someone types', async () => {
    render(<Harness />);

    await typeIn();

    const list = screen.getByRole('listbox', { name: 'Artist suggestions' });
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'true');
    expect(within(list).getAllByRole('option')).toHaveLength(3);
    expect(within(list).getByText('US grunge band')).toBeInTheDocument();
    expect(within(list).getByText('60s band from the UK')).toBeInTheDocument();
    expect(within(list).getByText('In your crate')).toBeInTheDocument();
  });

  it('tells a screen reader how many there are', async () => {
    render(<Harness />);

    await typeIn();

    expect(screen.getByRole('status')).toHaveTextContent(/3 suggestions/);
  });

  it('stays closed when there is nothing to offer', async () => {
    render(<Harness options={[]} />);

    await typeIn();

    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false');
  });

  it('moves down and up through the list, and points at the one highlighted', async () => {
    render(<Harness />);
    await typeIn();
    const box = screen.getByRole('combobox');

    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
    expect(box.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[0].id);

    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(screen.getAllByRole('option')[2]).toHaveAttribute('aria-selected', 'true');

    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');

    await userEvent.keyboard('{ArrowUp}');
    expect(screen.getAllByRole('option')[2]).toHaveAttribute('aria-selected', 'true');
  });

  it('starts from the last one when going up from nothing highlighted', async () => {
    render(<Harness />);
    await typeIn();

    await userEvent.keyboard('{ArrowUp}');

    expect(screen.getAllByRole('option')[2]).toHaveAttribute('aria-selected', 'true');
  });

  it('chooses the highlighted artist on Enter, without submitting the form', async () => {
    render(<Harness />);
    await typeIn();

    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');

    expect(onChoose).toHaveBeenCalledWith(OPTIONS[1]);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false');
  });

  it('submits what was typed on Enter when nothing is highlighted', async () => {
    render(<Harness />);
    await typeIn();

    await userEvent.keyboard('{Enter}');

    expect(onChoose).not.toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('chooses an artist that is clicked', async () => {
    render(<Harness />);
    await typeIn();

    await userEvent.click(screen.getAllByRole('option')[0]);

    expect(onChoose).toHaveBeenCalledWith(OPTIONS[0]);
  });

  it('closes on Escape, and the next key opens it again', async () => {
    render(<Harness />);
    await typeIn();

    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false');

    await userEvent.keyboard('r');
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'true');
  });

  it('closes when it loses focus', async () => {
    render(<Harness />);
    await typeIn();

    await userEvent.tab();

    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows a spinner, and says it is busy, while artists are being looked up', async () => {
    const { container } = render(<Harness options={[]} isSearching />);

    expect(container.querySelector('.search-box-spinner')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Searching for artists');
  });

  it('shows no spinner when nothing is being looked up', () => {
    const { container } = render(<Harness options={[]} />);

    expect(container.querySelector('.search-box-spinner')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-busy', 'false');
  });

  it('keeps showing the suggestions it has, with the spinner, while more are on the way', async () => {
    const { container } = render(<Harness isSearching />);

    await typeIn();

    expect(screen.getAllByRole('option')).toHaveLength(3);
    expect(container.querySelector('.search-box-spinner')).toBeInTheDocument();
  });

  it('can be switched off while something is being looked up', () => {
    render(<Harness disabled />);

    expect(screen.getByRole('combobox')).toBeDisabled();
  });
});
