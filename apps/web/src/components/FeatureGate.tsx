import { ReactNode } from 'react';
import { useFeature } from '../stores/features';
import type { FeatureKey } from '@neon/shared';
import { Lock, Clock } from 'lucide-react';

interface FeatureGateProps {
  feature: FeatureKey;
  children: ReactNode;
  /** Render when feature is disabled/coming soon (default: grey out with message) */
  fallback?: ReactNode;
  /** Hide completely instead of showing disabled state */
  hideWhenDisabled?: boolean;
  /** Custom wrapper class */
  className?: string;
}

/**
 * Component that gates content based on feature toggle state.
 * Shows greyed out content with explanation when feature is disabled.
 */
export function FeatureGate({
  feature,
  children,
  fallback,
  hideWhenDisabled = false,
  className = '',
}: FeatureGateProps) {
  const { enabled, isComingSoon, isDisabled, disabledMessage } = useFeature(feature);

  // If enabled, render children normally
  if (enabled) {
    return <>{children}</>;
  }

  // If hideWhenDisabled, don't render anything
  if (hideWhenDisabled) {
    return null;
  }

  // If custom fallback provided, use it
  if (fallback !== undefined) {
    return <>{fallback}</>;
  }

  // Default: show disabled state with overlay
  return (
    <div className={`relative ${className}`}>
      {/* Greyed out content */}
      <div className="opacity-50 pointer-events-none select-none">
        {children}
      </div>

      {/* Overlay with message */}
      <div className="absolute inset-0 flex items-center justify-center bg-neon-bg/80 rounded">
        <div className="text-center px-4 py-2">
          {isComingSoon ? (
            <>
              <Clock className="w-5 h-5 mx-auto mb-1 text-neon-warning" />
              <p className="text-sm font-medium text-neon-warning">Coming Soon!</p>
            </>
          ) : (
            <>
              <Lock className="w-5 h-5 mx-auto mb-1 text-neon-text-muted" />
              <p className="text-sm text-neon-text-muted">
                {disabledMessage || 'This feature is disabled'}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Button wrapper that disables button when feature is off
 */
interface FeatureButtonProps {
  feature: FeatureKey;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
  title?: string;
}

export function FeatureButton({
  feature,
  children,
  onClick,
  className = '',
  disabled = false,
  title,
}: FeatureButtonProps) {
  const { enabled, disabledMessage, isComingSoon } = useFeature(feature);

  const isActuallyDisabled = disabled || !enabled;
  const tooltipMessage = !enabled
    ? (isComingSoon ? 'Coming soon!' : disabledMessage)
    : title;

  return (
    <button
      onClick={enabled ? onClick : undefined}
      disabled={isActuallyDisabled}
      className={`${className} ${!enabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      title={tooltipMessage || undefined}
    >
      {children}
    </button>
  );
}

/**
 * Hook-based check for conditional logic
 */
export function useFeatureCheck(feature: FeatureKey) {
  const featureData = useFeature(feature);
  return featureData;
}
