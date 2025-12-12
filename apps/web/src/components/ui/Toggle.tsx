import { forwardRef } from 'react';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  'aria-label'?: string;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Standardized Toggle component matching Feature Flags page styling.
 *
 * Sizes:
 * - sm: 40px × 24px (w-10 h-6), thumb 16px (w-4 h-4)
 * - md: 56px × 32px (w-14 h-8), thumb 24px (w-6 h-6) - default
 * - lg: 64px × 36px (w-16 h-9), thumb 28px (w-7 h-7)
 */
export const Toggle = forwardRef<HTMLButtonElement, ToggleProps>(
  ({ checked, onChange, disabled = false, label, 'aria-label': ariaLabel, size = 'md' }, ref) => {
    const sizeClasses = {
      sm: {
        track: 'w-10 h-6',
        thumb: 'w-4 h-4 left-1 top-1',
        translate: 'translate-x-4',
      },
      md: {
        track: 'w-14 h-8',
        thumb: 'w-6 h-6 left-1 top-1',
        translate: 'translate-x-6',
      },
      lg: {
        track: 'w-16 h-9',
        thumb: 'w-7 h-7 left-1 top-1',
        translate: 'translate-x-7',
      },
    };

    const { track, thumb, translate } = sizeClasses[size];

    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel || label}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`
          relative rounded-full transition-colors duration-200 ease-in-out
          focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-neon-bg
          ${track}
          ${checked ? 'bg-neon-success' : 'bg-neon-border'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        <span
          className={`
            absolute bg-white rounded-full shadow-sm transition-transform duration-200 ease-in-out
            ${thumb}
            ${checked ? translate : 'translate-x-0'}
          `}
        />
        <span className="sr-only">{checked ? 'Enabled' : 'Disabled'}</span>
      </button>
    );
  }
);

Toggle.displayName = 'Toggle';

export default Toggle;
