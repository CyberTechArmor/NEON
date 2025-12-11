import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  FeatureKey,
  FeatureState,
  OrganizationFeatures,
  FeatureToggleEvent,
} from '@neon/shared';
import { DEFAULT_FEATURES, FEATURE_METADATA, isFeatureEnabled, getFeatureDisabledMessage } from '@neon/shared';

interface FeatureStore {
  features: OrganizationFeatures;
  isLoading: boolean;
  lastUpdated: number | null;

  // Actions
  setFeatures: (features: Partial<OrganizationFeatures>) => void;
  updateFeature: (feature: FeatureKey, state: FeatureState) => void;
  handleFeatureToggleEvent: (event: FeatureToggleEvent) => void;
  setLoading: (loading: boolean) => void;

  // Helpers
  isEnabled: (feature: FeatureKey) => boolean;
  getDisabledMessage: (feature: FeatureKey) => string | null;
  getFeatureState: (feature: FeatureKey) => FeatureState;
}

export const useFeatureStore = create<FeatureStore>()(
  persist(
    (set, get) => ({
      features: { ...DEFAULT_FEATURES },
      isLoading: false,
      lastUpdated: null,

      setFeatures: (features: Partial<OrganizationFeatures>) => {
        set({
          features: { ...DEFAULT_FEATURES, ...features },
          lastUpdated: Date.now(),
        });
      },

      updateFeature: (feature: FeatureKey, state: FeatureState) => {
        set((prev) => ({
          features: { ...prev.features, [feature]: state },
          lastUpdated: Date.now(),
        }));
      },

      handleFeatureToggleEvent: (event: FeatureToggleEvent) => {
        console.log('[Features] Received feature toggle event:', event);
        set((prev) => ({
          features: { ...prev.features, [event.feature]: event.state },
          lastUpdated: Date.now(),
        }));
      },

      setLoading: (loading: boolean) => {
        set({ isLoading: loading });
      },

      isEnabled: (feature: FeatureKey) => {
        return isFeatureEnabled(get().features, feature);
      },

      getDisabledMessage: (feature: FeatureKey) => {
        return getFeatureDisabledMessage(get().features, feature);
      },

      getFeatureState: (feature: FeatureKey) => {
        return get().features[feature] || 'enabled';
      },
    }),
    {
      name: 'neon-features',
      partialize: (state) => ({
        features: state.features,
        lastUpdated: state.lastUpdated,
      }),
    }
  )
);

// Hook for easy feature checking in components
export function useFeature(feature: FeatureKey) {
  const { isEnabled, getDisabledMessage, getFeatureState } = useFeatureStore();
  const state = getFeatureState(feature);
  const enabled = isEnabled(feature);
  const disabledMessage = getDisabledMessage(feature);
  const metadata = FEATURE_METADATA[feature];

  return {
    enabled,
    state,
    disabledMessage,
    label: metadata.label,
    description: metadata.description,
    isComingSoon: state === 'coming_soon',
    isDisabled: state === 'disabled',
  };
}

// Setup WebSocket listener for feature toggle events
export function setupFeatureListener() {
  const handleFeatureToggle = (event: CustomEvent<FeatureToggleEvent>) => {
    useFeatureStore.getState().handleFeatureToggleEvent(event.detail);
  };

  window.addEventListener('neon:feature-toggle', handleFeatureToggle as EventListener);

  return () => {
    window.removeEventListener('neon:feature-toggle', handleFeatureToggle as EventListener);
  };
}
