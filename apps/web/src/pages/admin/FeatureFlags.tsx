import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  ToggleLeft,
  ToggleRight,
  Loader2,
  Save,
  RefreshCw,
  Phone,
  Video,
  Calendar,
  MonitorUp,
  Upload,
  Image,
} from 'lucide-react';
import { adminApi, getErrorMessage } from '../../lib/api';

interface AvailableFeature {
  key: string;
  name: string;
  description: string;
}

interface FeatureFlagsData {
  flags: Record<string, boolean>;
  availableFeatures: AvailableFeature[];
}

// Icon mapping for features
const featureIcons: Record<string, typeof Phone> = {
  voice_calls: Phone,
  video_calls: Video,
  meetings: Calendar,
  screen_share: MonitorUp,
  file_uploads: Upload,
  rich_attachments: Image,
};

export function FeatureFlags() {
  const queryClient = useQueryClient();
  const [localFlags, setLocalFlags] = useState<Record<string, boolean>>({});
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch feature flags
  const { data, isLoading, refetch } = useQuery<FeatureFlagsData>({
    queryKey: ['admin', 'features'],
    queryFn: async () => {
      const response = await adminApi.features.get();
      return response.data.data;
    },
  });

  // Update local flags when data is loaded
  useEffect(() => {
    if (data?.flags) {
      setLocalFlags(data.flags);
      setHasChanges(false);
    }
  }, [data]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (flags: Record<string, boolean>) => {
      const response = await adminApi.features.update(flags);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'features'] });
      toast.success('Feature flags saved successfully');
      setHasChanges(false);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  // Toggle a feature flag
  const toggleFlag = (key: string) => {
    setLocalFlags((prev) => {
      const newFlags = { ...prev, [key]: !prev[key] };
      setHasChanges(true);
      return newFlags;
    });
  };

  // Save changes
  const handleSave = () => {
    saveMutation.mutate(localFlags);
  };

  // Reset changes
  const handleReset = () => {
    if (data?.flags) {
      setLocalFlags(data.flags);
      setHasChanges(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-neon-text-muted" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">Feature Flags</h2>
          <p className="text-sm text-neon-text-muted mt-1">
            Enable or disable features for your organization
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn btn-ghost"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          {hasChanges && (
            <>
              <button
                className="btn btn-secondary"
                onClick={handleReset}
                disabled={saveMutation.isPending}
              >
                Reset
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <div className="divide-y divide-neon-border">
          {data?.availableFeatures.map((feature) => {
            const Icon = featureIcons[feature.key] || ToggleLeft;
            const isEnabled = localFlags[feature.key] ?? false;

            return (
              <div
                key={feature.key}
                className="flex items-center justify-between p-4 hover:bg-neon-surface-hover transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      isEnabled
                        ? 'bg-neon-success/20 text-neon-success'
                        : 'bg-neon-surface-hover text-neon-text-muted'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-medium">{feature.name}</p>
                    <p className="text-sm text-neon-text-muted">{feature.description}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => toggleFlag(feature.key)}
                  className={`relative w-14 h-8 rounded-full transition-colors ${
                    isEnabled ? 'bg-neon-success' : 'bg-neon-border'
                  }`}
                  role="switch"
                  aria-checked={isEnabled}
                  aria-label={`Toggle ${feature.name}`}
                >
                  <span
                    className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-transform ${
                      isEnabled ? 'translate-x-7' : 'translate-x-1'
                    }`}
                  />
                  <span className="sr-only">
                    {isEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {hasChanges && (
        <div className="mt-4 p-4 bg-neon-warning/10 border border-neon-warning/30 rounded-lg">
          <p className="text-sm text-neon-warning">
            You have unsaved changes. Click "Save Changes" to apply them.
          </p>
        </div>
      )}

      <div className="mt-6 p-4 bg-neon-surface-hover rounded-lg">
        <h3 className="font-medium mb-2">About Feature Flags</h3>
        <p className="text-sm text-neon-text-muted">
          Feature flags allow you to control which features are available to users in your
          organization. When a feature is disabled, users will see a "Coming Soon" message
          or the feature will be hidden entirely. Changes are applied immediately to all
          connected users.
        </p>
      </div>
    </div>
  );
}

export default FeatureFlags;
