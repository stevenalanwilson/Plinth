import React from 'react';
import { useExampleAlbum } from './useExampleAlbum';
import { ExampleAlbum } from './ExampleAlbum';

function WaitingMessage(): React.ReactElement {
  return (
    <div className="empty-result">
      <div className="empty-result-mark" aria-hidden="true">
        ♪
      </div>
      <p>
        Your next favourite album is waiting.
        <br />
        Set your preferences and hit the button.
      </p>
    </div>
  );
}

/** What the result panel shows before the first pick: a real example when there is one. */
export function EmptyResult(): React.ReactElement {
  const example = useExampleAlbum();
  return example ? <ExampleAlbum album={example} /> : <WaitingMessage />;
}
