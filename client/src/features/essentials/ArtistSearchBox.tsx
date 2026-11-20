import React, { useId, useState } from 'react';
import { SuggestionOption } from './useArtistSuggestions';

interface ArtistSearchBoxProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Artists to offer. The box closes the list when there are none. */
  readonly options: readonly SuggestionOption[];
  /** True while artists are being looked up, which shows a spinner in the box. */
  readonly isSearching: boolean;
  readonly onChoose: (option: SuggestionOption) => void;
  readonly disabled: boolean;
}

function statusText(isShowing: boolean, count: number, isSearching: boolean): string {
  if (isSearching) return 'Searching for artists…';
  return isShowing ? `${count} suggestions. Use the up and down arrows to choose.` : '';
}

/**
 * A text box that offers artists as you type: a combobox, so the arrow keys move through the list,
 * Enter picks the highlighted artist (or, with none highlighted, submits what was typed as it
 * always did), Escape closes it, and a screen reader hears how many there are.
 */
export function ArtistSearchBox({
  value,
  onChange,
  options,
  isSearching,
  onChoose,
  disabled,
}: ArtistSearchBoxProps): React.ReactElement {
  const listId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const isShowing = isOpen && options.length > 0;
  const optionId = (index: number): string => `${listId}-option-${index}`;

  function close(): void {
    setIsOpen(false);
    setActiveIndex(-1);
  }

  function choose(option: SuggestionOption): void {
    close();
    onChoose(option);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape') {
      if (isShowing) {
        event.preventDefault();
        close();
      }
      return;
    }
    if (options.length === 0) return;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setIsOpen(true);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      // From nothing highlighted, down goes to the first and up to the last.
      const from = activeIndex === -1 ? (step === 1 ? -1 : 0) : activeIndex;
      setActiveIndex((from + step + options.length) % options.length);
      return;
    }
    if (event.key === 'Enter' && isShowing && activeIndex >= 0) {
      event.preventDefault();
      choose(options[activeIndex]);
    }
  }

  return (
    <div className="artist-search">
      <input
        type="text"
        role="combobox"
        aria-expanded={isShowing}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-busy={isSearching}
        aria-activedescendant={isShowing && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        aria-label="Artist name"
        autoComplete="off"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setIsOpen(true);
          setActiveIndex(-1);
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsOpen(true)}
        onBlur={close}
        placeholder="Artist or band…"
        maxLength={100}
        className="essentials-input"
        disabled={disabled}
      />
      {isSearching && <span className="artist-search-spinner" aria-hidden="true" />}
      <ul
        id={listId}
        role="listbox"
        aria-label="Artist suggestions"
        className="artist-suggestions"
        hidden={!isShowing}
      >
        {options.map((option, index) => (
          <li
            key={option.key}
            id={optionId(index)}
            role="option"
            aria-selected={index === activeIndex}
            className="artist-suggestion"
            // Before the box loses focus, which would close the list before the click lands.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(option)}
            onMouseMove={() => setActiveIndex(index)}
          >
            <span className="artist-suggestion-name">{option.name}</span>
            {option.detail !== '' && (
              <span className="artist-suggestion-detail">{option.detail}</span>
            )}
          </li>
        ))}
      </ul>
      <p className="visually-hidden" role="status">
        {statusText(isShowing, options.length, isSearching)}
      </p>
    </div>
  );
}
