import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Toggle,
  Clock,
  Lock,
  Loader2,
  Phone,
  Video,
  Calendar,
  FileUp,
  Monitor,
  Heart,
  Edit3,
  Trash2,
  Eye,
  Keyboard,
  RefreshCw,
} from 'lucide-react';
import { adminApi, getErrorMessage } from '../../lib/api';
import { useFeatureStore } from '../../stores/features';
import type { FeatureKey, FeatureState, OrganizationFeatures } from '@neon/shared';
import { FEATURE_METADATA, DEFAULT_FEATURES } from '@neon/shared';

// Icon mapping for features
const FEATURE_ICONS: Record<FeatureKey, typeof Phone> = {
  voice_calls: Phone,
  video_calls: Video,
  meetings: Calendar,
  file_sharing: FileUp,
  screen_sharing: Monitor,
  message_reactions: Heart,
  message_editing: Edit3,
  message_deletion: Trash2,
  read_receipts: Eye,
  typing_indicators: Keyboard,
};

// Category labels
const CATEGORY_LABELS = {
  communication: 'Communication',
  messaging: 'Messaging',
  collaboration: 'Collaboration',
};

// Group features by category
function groupFeaturesByCategory() {
  const groups: Record<string, FeatureKey[]> = {
    communication: [],
    messaging: [],
    collaboration: [],
  };

  for (const [key, metadata] of Object.entries(FEATURE_METADATA)) {
    groups[metadata.category].push(key as FeatureKey);
  }

  return groups;
}

export default function FeatureManagement() {
  const queryClient = useQueryClient();
  const { setFeatures } = useFeatureStore();
  const [pendingChanges, setPendingChanges] = useState<Record<string, FeatureState>>({});

  // Fetch features
  const { data: featuresData, isLoading, refetch } = useQuery({
    queryKey: ['admin-features'],
    queryFn: async () => {
      const response = await adminApi.features.get();
      const features = response.data.data as OrganizationFeatures;
      setFeatures(features);
      return features;
    },
  });

  const features = { ...DEFAULT_FEATURES, ...featuresData };

  // Update feature mutation
  const updateMutation = useMutation({
    mutationFn: async ({ feature, state }: { feature: FeatureKey; state: FeatureState }) => {
      const response = await adminApi.features.toggle(feature, state);
      return response.data.data;
    },
    onSuccess: (data) => {
      toast.success('Feature updated successfully');
      queryClient.invalidateQueries({ queryKey: ['admin-features'] });
      if (data.features) {
        setFeatures(data.features as OrganizationFeatures);
      }
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  // Batch update mutation
  const batchUpdateMutation = useMutation({
    mutationFn: async (updates: Record<string, FeatureState>) => {
      const response = await adminApi.features.update(updates);
      return response.data.data;
    },
    onSuccess: (data) => {
      toast.success('Features updated successfully');
      setPendingChanges({});
      queryClient.invalidateQueries({ queryKey: ['admin-features'] });
      setFeatures(data as OrganizationFeatures);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  const handleToggle = (feature: FeatureKey, currentState: FeatureState) => {
    const newState: FeatureState = currentState === 'enabled' ? 'disabled' : 'enabled';
    updateMutation.mutate({ feature, state: newState });
  };

  const handleStateChange = (feature: FeatureKey, state: FeatureState) => {
    updateMutation.mutate({ feature, state });
  };

  const categoryGroups = groupFeaturesByCategory();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-neon-text-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Feature Management</h2>
          <p className="text-sm text-neon-text-muted mt-1">
            Enable or disable features for your organization. Changes take effect immediately.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="btn btn-secondary btn-sm"
          disabled={isLoading}
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Feature Categories */}
      {Object.entries(categoryGroups).map(([category, featureKeys]) => (
        <div key={category} className="card">
          <div className="card-header">
            <h3 className="text-lg font-medium">
              {CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS]}
            </h3>
          </div>
          <div className="card-body">
            <div className="space-y-4">
              {featureKeys.map((featureKey) => {
                const metadata = FEATURE_METADATA[featureKey];
                const currentState = features[featureKey] || 'enabled';
                const Icon = FEATURE_ICONS[featureKey];
                const isUpdating = updateMutation.isPending;

                return (
                  <div
                    key={featureKey}
                    className="flex items-center justify-between p-4 bg-neon-surface-hover rounded-lg"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-lg ${
                        currentState === 'enabled' ? 'bg-neon-success/20' :
                        currentState === 'coming_soon' ? 'bg-neon-warning/20' :
                        'bg-neon-error/20'
                      }`}>
                        <Icon className={`w-5 h-5 ${
                          currentState === 'enabled' ? 'text-neon-success' :
                          currentState === 'coming_soon' ? 'text-neon-warning' :
                          'text-neon-error'
                        }`} />
                      </div>
                      <div>
                        <h4 className="font-medium">{metadata.label}</h4>
                        <p className="text-sm text-neon-text-muted">
                          {metadata.description}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* State selector */}
                      <select
                        value={currentState}
                        onChange={(e) => handleStateChange(featureKey, e.target.value as FeatureState)}
                        disabled={isUpdating}
                        className="input py-1.5 px-3 text-sm min-w-[140px]"
                      >
                        <option value="enabled">Enabled</option>
                        <option value="disabled">Disabled</option>
                        <option value="coming_soon">Coming Soon</option>
                      </select>

                      {/* Quick toggle button */}
                      <button
                        onClick={() => handleToggle(featureKey, currentState)}
                        disabled={isUpdating}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          currentState === 'enabled' ? 'bg-neon-success' :
                          currentState === 'coming_soon' ? 'bg-neon-warning' :
                          'bg-neon-surface'
                        }`}
                        title={currentState === 'enabled' ? 'Click to disable' : 'Click to enable'}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            currentState === 'enabled' ? 'translate-x-6' :
                            currentState === 'coming_soon' ? 'translate-x-3' :
                            'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ))}

      {/* Info box */}
      <div className="bg-neon-info/10 border border-neon-info/30 rounded-lg p-4">
        <h4 className="font-medium text-neon-info mb-2">About Feature States</h4>
        <ul className="text-sm text-neon-text-muted space-y-1">
          <li className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-neon-success" />
            <strong>Enabled:</strong> Feature is fully available to all users
          </li>
          <li className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-neon-error" />
            <strong>Disabled:</strong> Feature is hidden/greyed out with "disabled by organization" message
          </li>
          <li className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-neon-warning" />
            <strong>Coming Soon:</strong> Feature is visible but greyed out with "Coming Soon!" message
          </li>
        </ul>
      </div>
    </div>
  );
}
