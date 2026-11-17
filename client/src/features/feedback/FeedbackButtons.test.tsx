import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FeedbackButtons } from './FeedbackButtons';

const LABELS = ['Save', 'Own it', 'Want on vinyl', 'Heard it', 'Not for me'];

describe('FeedbackButtons', () => {
  it('offers the five answers as a labelled group, none chosen to begin with', () => {
    render(<FeedbackButtons status={null} onChange={vi.fn()} />);

    expect(screen.getByRole('group', { name: 'Your take' })).toBeInTheDocument();
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(LABELS);
    screen.getAllByRole('button').forEach((button) => {
      expect(button).toHaveAttribute('aria-pressed', 'false');
    });
  });

  it.each([
    ['Save', 'save'],
    ['Own it', 'own'],
    ['Want on vinyl', 'want-vinyl'],
    ['Heard it', 'heard'],
    ['Not for me', 'not-for-me'],
  ])('sends %s as %s', (label, status) => {
    const onChange = vi.fn();
    render(<FeedbackButtons status={null} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: label }));

    expect(onChange).toHaveBeenCalledWith(status);
  });

  it('marks the chosen answer, and only that one', () => {
    render(<FeedbackButtons status="want-vinyl" onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Want on vinyl' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Own it' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('takes the answer back when the chosen one is tapped again', () => {
    const onChange = vi.fn();
    render(<FeedbackButtons status="own" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Own it' }));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('switches to another answer in one tap', () => {
    const onChange = vi.fn();
    render(<FeedbackButtons status="own" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Heard it' }));

    expect(onChange).toHaveBeenCalledWith('heard');
  });

  it('gives two groups on one page their own labels', () => {
    render(
      <>
        <FeedbackButtons status={null} onChange={vi.fn()} />
        <FeedbackButtons status={null} onChange={vi.fn()} />
      </>,
    );

    expect(screen.getAllByRole('group', { name: 'Your take' })).toHaveLength(2);
  });
});
