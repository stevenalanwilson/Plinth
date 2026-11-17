import React, { useEffect, useRef, useState } from 'react';

const CONFIRM_WINDOW_MS = 4000;

interface ConfirmButtonProps {
  readonly label: string;
  /** Shown after the first tap, while a second tap would go ahead. */
  readonly confirmLabel: string;
  readonly onConfirm: () => void;
  /** When false the action goes ahead on the first tap, as for something easily undone. */
  readonly requireConfirm?: boolean;
  readonly className?: string;
  readonly style?: React.CSSProperties;
  readonly disabled?: boolean;
}

/**
 * A button for something that can't be undone: the first tap asks, a second within a few seconds
 * does it. Looking away, or waiting, takes the question back.
 */
export function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  requireConfirm = true,
  className,
  style,
  disabled,
}: ConfirmButtonProps): React.ReactElement {
  const [isAsking, setIsAsking] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function stopAsking(): void {
    window.clearTimeout(timer.current);
    setIsAsking(false);
  }

  function handleClick(): void {
    if (!requireConfirm || isAsking) {
      stopAsking();
      onConfirm();
      return;
    }
    setIsAsking(true);
    timer.current = window.setTimeout(() => setIsAsking(false), CONFIRM_WINDOW_MS);
  }

  return (
    <button
      type="button"
      className={className}
      style={style}
      disabled={disabled}
      data-asking={isAsking}
      aria-live="polite"
      onClick={handleClick}
      onBlur={stopAsking}
    >
      {isAsking ? confirmLabel : label}
    </button>
  );
}
