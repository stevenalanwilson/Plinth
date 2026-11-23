import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ComboboxOption, SearchCombobox } from './SearchCombobox';

interface AlbumOption extends ComboboxOption {
  readonly releaseGroupId: string;
}

const OPTIONS: AlbumOption[] = [
  { key: 'a', name: 'Kind of Blue', detail: 'Miles Davis · 1959', releaseGroupId: 'rg-a' },
  { key: 'b', name: 'Kind of Blues', detail: '', releaseGroupId: 'rg-b' },
];

function Harness({
  onChoose,
  isSearching = false,
}: {
  readonly onChoose: (option: AlbumOption) => void;
  readonly isSearching?: boolean;
}): React.ReactElement {
  const [value, setValue] = useState('');
  return (
    <SearchCombobox
      value={value}
      onChange={setValue}
      options={OPTIONS}
      isSearching={isSearching}
      onChoose={onChoose}
      disabled={false}
      label="Album or artist"
      placeholder="Search…"
      listLabel="Album results"
      noun="albums"
    />
  );
}

describe('SearchCombobox', () => {
  it('names the box, the list and what it is searching for from what it is given', async () => {
    render(<Harness onChoose={vi.fn()} isSearching />);
    await userEvent.type(screen.getByRole('combobox'), 'kind');

    expect(screen.getByRole('combobox', { name: 'Album or artist' })).toHaveAttribute(
      'placeholder',
      'Search…',
    );
    expect(screen.getByRole('listbox', { name: 'Album results' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Searching for albums');
  });

  it('hands back the option it was given, with whatever else it carried', async () => {
    const onChoose = vi.fn();
    render(<Harness onChoose={onChoose} />);
    await userEvent.type(screen.getByRole('combobox'), 'kind');

    await userEvent.click(screen.getAllByRole('option')[0]);

    expect(onChoose).toHaveBeenCalledWith(OPTIONS[0]);
  });

  it('leaves out the detail when an option has none', async () => {
    render(<Harness onChoose={vi.fn()} />);
    await userEvent.type(screen.getByRole('combobox'), 'kind');

    const [first, second] = screen.getAllByRole('option');

    expect(first).toHaveTextContent('Kind of BlueMiles Davis · 1959');
    expect(second).toHaveTextContent(/^Kind of Blues$/);
  });
});
