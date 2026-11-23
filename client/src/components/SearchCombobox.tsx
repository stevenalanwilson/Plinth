import React, { useId, useState } from 'react';

/** One line in the list offered while typing. */
export interface ComboboxOption {
  readonly key: string;
  readonly name: string;
  /** What tells options with the same name apart. */
  readonly detail: string;
}

interface SearchComboboxProps<Option extends ComboboxOption> {
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** What to offer. The box closes the list when there are none. */
  readonly options: readonly Option[];
  /** True while options are being looked up, which shows a spinner in the box. */
  readonly isSearching: boolean;
  readonly onChoose: (option: Option) => void;
  readonly disabled: boolean;
  /** The box's name for screen readers, such as "Artist name". */
  readonly label: string;
  readonly placeholder: string;
  /** The list's name for screen readers, such as "Artist suggestions". */
  readonly listLabel: string;
  /** What is being searched for, in the plural, for the spoken status: "artists". */
  readonly noun: string;
  readonly maxLength?: number;
  /** Styles the text box itself. */
  readonly inputClassName?: string;
}

function statusText(isShowing: boolean, count: number, isSearching: boolean, noun: string): string {
  if (isSearching) return `Searching for ${noun}…`;
  return isShowing ? `${count} suggestions. Use the up and down arrows to choose.` : '';
}

/**
 * A text box that offers matches as you type: a combobox, so the arrow keys move through the list,
 * Enter picks the highlighted match (or, with none highlighted, submits what was typed as it
 * always did), Escape closes it, and a screen reader hears how many there are.
 */
export function SearchCombobox<Option extends ComboboxOption>({
  value,
  onChange,
  options,
  isSearching,
  onChoose,
  disabled,
  label,
  placeholder,
  listLabel,
  noun,
  maxLength = 100,
  inputClassName,
}: SearchComboboxProps<Option>): React.ReactElement {
  const listId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const isShowing = isOpen && options.length > 0;
  const optionId = (index: number): string => `${listId}-option-${index}`;

  function close(): void {
    setIsOpen(false);
    setActiveIndex(-1);
  }

  function choose(option: Option): void {
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
    <div className="search-box">
      <input
        type="text"
        role="combobox"
        aria-expanded={isShowing}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-busy={isSearching}
        aria-activedescendant={isShowing && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        aria-label={label}
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
        placeholder={placeholder}
        maxLength={maxLength}
        className={inputClassName}
        disabled={disabled}
      />
      {isSearching && <span className="search-box-spinner" aria-hidden="true" />}
      <ul
        id={listId}
        role="listbox"
        aria-label={listLabel}
        className="search-box-options"
        hidden={!isShowing}
      >
        {options.map((option, index) => (
          <li
            key={option.key}
            id={optionId(index)}
            role="option"
            aria-selected={index === activeIndex}
            className="search-box-option"
            // Before the box loses focus, which would close the list before the click lands.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(option)}
            onMouseMove={() => setActiveIndex(index)}
          >
            <span className="search-box-option-name">{option.name}</span>
            {option.detail !== '' && (
              <span className="search-box-option-detail">{option.detail}</span>
            )}
          </li>
        ))}
      </ul>
      <p className="visually-hidden" role="status">
        {statusText(isShowing, options.length, isSearching, noun)}
      </p>
    </div>
  );
}
