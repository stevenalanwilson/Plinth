import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { useStartFromNavigation } from './useStartFromNavigation';

function wantsGreeting(state: unknown): string | null {
  const greeting = (state as { greeting?: unknown } | null)?.greeting;
  return typeof greeting === 'string' ? greeting : null;
}

function Home({ start }: { readonly start: (value: string) => void }): React.ReactElement {
  useStartFromNavigation(wantsGreeting, start);
  const location = useLocation();
  return <div data-testid="state">{JSON.stringify(location.state)}</div>;
}

function renderAt(state: unknown, start: (value: string) => void, search = ''): void {
  render(
    <React.StrictMode>
      <MemoryRouter initialEntries={[{ pathname: '/', search, state }]}>
        <Routes>
          <Route path="/" element={<Home start={start} />} />
        </Routes>
      </MemoryRouter>
    </React.StrictMode>,
  );
}

describe('useStartFromNavigation', () => {
  it('starts what was asked for once, even in strict mode, and clears the request', () => {
    const start = vi.fn();

    renderAt({ greeting: 'hello' }, start);

    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith('hello');
    expect(screen.getByTestId('state')).toHaveTextContent('null');
  });

  it('does nothing without a request, or for one it does not understand', () => {
    const start = vi.fn();

    renderAt(null, start);
    renderAt({ greeting: 5 }, start);

    expect(start).not.toHaveBeenCalled();
  });

  it('keeps the rest of the address when it clears the request', () => {
    renderAt({ greeting: 'hello' }, vi.fn(), '?tab=1');

    expect(screen.getByTestId('state')).toHaveTextContent('null');
  });
});
