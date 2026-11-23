import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ArtworkImage } from './ArtworkImage';

describe('ArtworkImage', () => {
  it('shows the cover through the image proxy, named for screen readers', () => {
    render(
      <ArtworkImage artist="Nirvana" album="Nevermind" artworkUrl="https://img.example/n.jpg" />,
    );

    const image = screen.getByRole('img', { name: 'Nevermind album artwork' });
    expect(image.getAttribute('src')).toContain(
      '/api/v1/image?url=https%3A%2F%2Fimg.example%2Fn.jpg',
    );
  });

  it('shows the placeholder sleeve when there is no cover, rather than a wrong one', () => {
    render(<ArtworkImage artist="Nirvana" album="Nevermind" artworkUrl={null} />);

    expect(
      screen.getByRole('img', { name: 'Nevermind by Nirvana, no artwork available' }),
    ).toBeInTheDocument();
  });

  it('falls back to the placeholder when the cover fails to load', () => {
    render(
      <ArtworkImage artist="Nirvana" album="Nevermind" artworkUrl="https://img.example/n.jpg" />,
    );

    fireEvent.error(screen.getByRole('img', { name: 'Nevermind album artwork' }));

    expect(
      screen.getByRole('img', { name: 'Nevermind by Nirvana, no artwork available' }),
    ).toBeInTheDocument();
  });
});
