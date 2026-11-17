import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { useMoreLikeThisFromNavigation } from './useMoreLikeThisFromNavigation';
import { moreLikeThisState } from './moreLikeThis';

function Discover({ start }: { readonly start: (pivot: unknown) => void }): React.ReactElement {
  useMoreLikeThisFromNavigation(start);
  const location = useLocation();
  return <div data-testid="state">{JSON.stringify(location.state)}</div>;
}

function renderAt(state: unknown, start: (pivot: unknown) => void): void {
  render(
    <React.StrictMode>
      <MemoryRouter initialEntries={[{ pathname: '/', state }]}>
        <Routes>
          <Route path="/" element={<Discover start={start} />} />
        </Routes>
      </MemoryRouter>
    </React.StrictMode>,
  );
}

describe('useMoreLikeThisFromNavigation', () => {
  it('starts the asked-for pick once, even in strict mode, and clears the request', () => {
    const start = vi.fn();

    renderAt(moreLikeThisState('The Sound', 'Jeopardy'), start);

    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith({
      type: 'more-like-this',
      artist: 'The Sound',
      album: 'Jeopardy',
    });
    expect(screen.getByTestId('state')).toHaveTextContent('null');
  });

  it('does nothing without a request', () => {
    const start = vi.fn();

    renderAt(null, start);

    expect(start).not.toHaveBeenCalled();
  });
});
