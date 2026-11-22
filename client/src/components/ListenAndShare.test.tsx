import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ListenAndShare } from './ListenAndShare';

function renderIcons(slug?: string | null): void {
  render(
    <ListenAndShare
      artist="The Sound"
      album="Jeopardy"
      appleMusicUrl={null}
      slug={slug}
      hook="A tightly coiled record."
    />,
  );
}

describe('ListenAndShare', () => {
  it('groups the listening links and Share under one name', () => {
    renderIcons('the-sound-jeopardy');

    const group = screen.getByRole('group', { name: 'Listen and share' });
    expect(within(group).getAllByRole('link')).toHaveLength(3);
    expect(within(group).getByRole('button', { name: 'Share' })).toBeInTheDocument();
  });

  it.each([[undefined], [null], ['']])('leaves Share out when the slug is %s', (slug) => {
    renderIcons(slug);

    expect(screen.getAllByRole('link')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument();
  });

  it('passes the Apple Music link through', () => {
    render(
      <ListenAndShare
        artist="The Sound"
        album="Jeopardy"
        appleMusicUrl="https://music.apple.com/gb/album/jeopardy/1"
        hook={null}
      />,
    );

    expect(screen.getByRole('link', { name: 'Open in Apple Music' })).toHaveAttribute(
      'href',
      'https://music.apple.com/gb/album/jeopardy/1',
    );
  });
});
