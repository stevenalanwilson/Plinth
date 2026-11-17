import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ConfirmButton } from './ConfirmButton';

function renderButton(props: Partial<React.ComponentProps<typeof ConfirmButton>> = {}): {
  onConfirm: ReturnType<typeof vi.fn>;
} {
  const onConfirm = vi.fn();
  render(
    <ConfirmButton
      label="Clear"
      confirmLabel="Tap again to clear"
      onConfirm={onConfirm}
      {...props}
    />,
  );
  return { onConfirm };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ConfirmButton', () => {
  it('asks on the first tap and does nothing yet', () => {
    const { onConfirm } = renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Tap again to clear' })).toBeInTheDocument();
  });

  it('goes ahead on a second tap, and goes back to its label', () => {
    const { onConfirm } = renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tap again to clear' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
  });

  it('takes the question back after a few seconds', () => {
    const { onConfirm } = renderButton();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('takes the question back when focus moves away', () => {
    renderButton();
    const button = screen.getByRole('button', { name: 'Clear' });
    fireEvent.click(button);

    fireEvent.blur(screen.getByRole('button', { name: 'Tap again to clear' }));

    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
  });

  it('does it on the first tap when no confirmation is needed', () => {
    const { onConfirm } = renderButton({ requireConfirm: false });

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('can be disabled', () => {
    const { onConfirm } = renderButton({ disabled: true });

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('announces the question to assistive technology', () => {
    renderButton();

    expect(screen.getByRole('button', { name: 'Clear' })).toHaveAttribute('aria-live', 'polite');
  });

  it('leaves no timer running when it goes away mid-question', () => {
    const { onConfirm } = renderButton();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    document.body.innerHTML = '';

    expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
