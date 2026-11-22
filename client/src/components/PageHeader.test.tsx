import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageHeader } from './PageHeader';

describe('PageHeader', () => {
  it('names the page with a heading', () => {
    render(<PageHeader title="Discover" />);

    expect(screen.getByRole('heading', { name: 'Discover' })).toBeInTheDocument();
  });

  it('gives the heading an id when asked, so a section can be named by it', () => {
    render(<PageHeader title="Artist Essentials" titleId="essentials-title" />);

    expect(screen.getByRole('heading', { name: 'Artist Essentials' })).toHaveAttribute(
      'id',
      'essentials-title',
    );
  });

  it('shows what it is given beside the title', () => {
    render(
      <PageHeader title="Your Crate">
        <button type="button">Insights</button>
      </PageHeader>,
    );

    expect(screen.getByRole('button', { name: 'Insights' })).toBeInTheDocument();
  });
});
