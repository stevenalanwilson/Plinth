import React from 'react';
import { SearchCombobox } from '../../components/SearchCombobox';
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

/** A text box that offers artists as you type. */
export function ArtistSearchBox(props: ArtistSearchBoxProps): React.ReactElement {
  return (
    <SearchCombobox
      {...props}
      label="Artist name"
      placeholder="Artist or band…"
      listLabel="Artist suggestions"
      noun="artists"
      inputClassName="essentials-input"
    />
  );
}
