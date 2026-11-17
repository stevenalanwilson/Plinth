import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FeedbackBadge } from './FeedbackBadge';

describe('FeedbackBadge', () => {
  it.each([
    ['save', 'Save'],
    ['own', 'Own it'],
    ['want-vinyl', 'Want on vinyl'],
    ['heard', 'Heard it'],
    ['not-for-me', 'Not for me'],
  ] as const)('labels %s as %s', (status, label) => {
    render(<FeedbackBadge status={status} />);

    expect(screen.getByText(label)).toHaveAttribute('data-status', status);
  });

  it.each([null, undefined])('shows nothing for %s', (status) => {
    const { container } = render(<FeedbackBadge status={status} />);

    expect(container).toBeEmptyDOMElement();
  });
});
