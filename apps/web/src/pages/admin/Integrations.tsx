import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Video,
  Check,
  X,
  Loader2,
  RefreshCw,
  ExternalLink,
  Trash2,
  Eye,
  EyeOff,
  AlertCircle,
  Settings,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { adminApi, getErrorMessage } from '../../lib/api';

interface MeetIntegrationData {
  configured: boolean;
  baseUrl: string;
  isConnected: boolean;
  enabled: boolean;
  autoJoin?: boolean;
  defaultQuality?: string;
  options?: {
    serverVersion?: string;
    activeRooms?: number;
    totalParticipants?: number;
    settings?: {
      publicAccessEnabled?: boolean;
      maxParticipantsPerMeeting?: number;
      maxConcurrentMeetings?: number;
    };
    recommendations?: {
      maxParticipantsPerMeeting?: number;
      maxConcurrentMeetings?: number;
    };
  };
  lastCheckedAt?: string;
  lastError?: string;
  hasApiKey?: boolean;
}

interface TestResult {
  connected: boolean;
  error?: string;
  latency?: number;
  serverInfo?: {
    version: string;
    activeRooms: number;
    totalParticipants: number;
  };
  settings?: Record<string, unknown>;
  recommendations?: Record<string, unknown>;
}

export default function Integrations() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'meet'>('meet');

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Integrations</h2>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-neon-border">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'meet'
              ? 'border-neon-accent text-white'
              : 'border-transparent text-neon-text-muted hover:text-white'
          }`}
          onClick={() => setActiveTab('meet')}
        >
          <Video className="w-4 h-4 inline-block mr-2" />
          MEET Video
        </button>
      </div>

      {/* Content */}
      {activeTab === 'meet' && <MeetIntegration />}
    </div>
  );
}

function MeetIntegration() {
  const queryClient = useQueryClient();
  const [showApiKey, setShowApiKey] = useState(false);
  const [formData, setFormData] = useState({
    baseUrl: '',
    apiKey: '',
    enabled: true,
    autoJoin: true,
    defaultQuality: 'auto',
  });
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  // Fetch current integration config
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'integrations', 'meet'],
    queryFn: async () => {
      const response = await adminApi.meet.get();
      return response.data.data as MeetIntegrationData;
    },
  });

  // Update form when data loads
  useEffect(() => {
    if (data) {
      setFormData({
        baseUrl: data.baseUrl || '',
        apiKey: '', // Never pre-fill API key for security
        enabled: data.enabled ?? true,
        autoJoin: data.autoJoin ?? true,
        defaultQuality: data.defaultQuality || 'auto',
      });
    }
  }, [data]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const response = await adminApi.meet.save({
        baseUrl: formData.baseUrl,
        apiKey: formData.apiKey || undefined,
        enabled: formData.enabled,
        autoJoin: formData.autoJoin,
        defaultQuality: formData.defaultQuality,
      });
      return response.data.data;
    },
    onSuccess: () => {
      toast.success('MEET integration saved');
      setFormData((prev) => ({ ...prev, apiKey: '' })); // Clear API key after save
      queryClient.invalidateQueries({ queryKey: ['admin', 'integrations', 'meet'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  // Test mutation
  const testMutation = useMutation({
    mutationFn: async () => {
      const response = await adminApi.meet.test({
        baseUrl: formData.baseUrl || undefined,
        apiKey: formData.apiKey || undefined,
      });
      return response.data.data as TestResult;
    },
    onSuccess: (result) => {
      setTestResult(result);
      if (result.connected) {
        toast.success(`Connected successfully (${result.latency}ms)`);
        queryClient.invalidateQueries({ queryKey: ['admin', 'integrations', 'meet'] });
      } else {
        toast.error(result.error || 'Connection failed');
      }
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const response = await adminApi.meet.delete();
      return response.data.data;
    },
    onSuccess: () => {
      toast.success('MEET integration removed');
      setFormData({
        baseUrl: '',
        apiKey: '',
        enabled: true,
        autoJoin: true,
        defaultQuality: 'auto',
      });
      setTestResult(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'integrations', 'meet'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-neon-text-muted" />
      </div>
    );
  }

  const isConfigured = data?.configured && data?.hasApiKey;

  return (
    <div className="space-y-6">
      {/* Connection Status Card */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              data?.isConnected ? 'bg-neon-success/20' : 'bg-neon-surface-hover'
            }`}>
              <Video className={`w-5 h-5 ${data?.isConnected ? 'text-neon-success' : 'text-neon-text-muted'}`} />
            </div>
            <div>
              <h3 className="font-medium">MEET Video Conferencing</h3>
              <p className="text-sm text-neon-text-muted">
                Integrate MEET for video calls within conversations
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {data?.isConnected ? (
              <span className="flex items-center gap-1.5 text-sm text-neon-success">
                <Wifi className="w-4 h-4" />
                Connected
              </span>
            ) : isConfigured ? (
              <span className="flex items-center gap-1.5 text-sm text-neon-error">
                <WifiOff className="w-4 h-4" />
                Disconnected
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-sm text-neon-text-muted">
                <AlertCircle className="w-4 h-4" />
                Not configured
              </span>
            )}
          </div>
        </div>

        {/* Server Info (when connected) */}
        {data?.isConnected && data?.options && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 p-4 bg-neon-surface-hover rounded-lg">
            <div>
              <p className="text-xs text-neon-text-muted mb-1">Server Version</p>
              <p className="font-medium">{data.options.serverVersion || 'Unknown'}</p>
            </div>
            <div>
              <p className="text-xs text-neon-text-muted mb-1">Active Rooms</p>
              <p className="font-medium">{data.options.activeRooms || 0}</p>
            </div>
            <div>
              <p className="text-xs text-neon-text-muted mb-1">Total Participants</p>
              <p className="font-medium">{data.options.totalParticipants || 0}</p>
            </div>
          </div>
        )}

        {/* Last Error */}
        {data?.lastError && (
          <div className="mb-4 p-3 bg-neon-error/10 border border-neon-error/30 rounded-lg text-sm text-neon-error">
            <AlertCircle className="w-4 h-4 inline-block mr-2" />
            {data.lastError}
          </div>
        )}

        {/* Configuration Form */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Base URL <span className="text-neon-error">*</span>
            </label>
            <input
              type="url"
              className="input"
              placeholder="https://meet2.neoncore.io"
              value={formData.baseUrl}
              onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
            />
            <p className="text-xs text-neon-text-muted mt-1">
              The base URL of your MEET server instance
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              API Key {!isConfigured && <span className="text-neon-error">*</span>}
            </label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                className="input pr-10"
                placeholder={isConfigured ? 'Enter new API key to update' : 'Enter your MEET API key'}
                value={formData.apiKey}
                onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neon-text-muted hover:text-white"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-neon-text-muted mt-1">
              {isConfigured
                ? 'Leave blank to keep existing API key, or enter a new one to update'
                : 'Generate an API key from your MEET admin panel'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Default Quality</label>
              <select
                className="input"
                value={formData.defaultQuality}
                onChange={(e) => setFormData({ ...formData, defaultQuality: e.target.value })}
              >
                <option value="auto">Auto (Adaptive)</option>
                <option value="low">Low (720p)</option>
                <option value="balanced">Balanced</option>
                <option value="high">High (1080p)</option>
                <option value="max">Maximum</option>
              </select>
            </div>

            <div className="space-y-3 pt-6">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-neon-border"
                  checked={formData.enabled}
                  onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                />
                <span className="text-sm">Enable MEET integration</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-neon-border"
                  checked={formData.autoJoin}
                  onChange={(e) => setFormData({ ...formData, autoJoin: e.target.checked })}
                />
                <span className="text-sm">Auto-join when name provided</span>
              </label>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between mt-6 pt-6 border-t border-neon-border">
          <div className="flex items-center gap-2">
            <button
              className="btn btn-secondary"
              onClick={() => testMutation.mutate()}
              disabled={!formData.baseUrl || testMutation.isPending}
            >
              {testMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Test Connection
            </button>
            {isConfigured && (
              <button
                className="btn btn-ghost text-neon-error hover:bg-neon-error/10"
                onClick={() => {
                  if (confirm('Are you sure you want to remove the MEET integration?')) {
                    deleteMutation.mutate();
                  }
                }}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                Remove
              </button>
            )}
          </div>
          <button
            className="btn btn-primary"
            onClick={() => saveMutation.mutate()}
            disabled={!formData.baseUrl || (!isConfigured && !formData.apiKey) || saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Save Configuration
              </>
            )}
          </button>
        </div>
      </div>

      {/* Test Result */}
      {testResult && (
        <div className={`card p-6 ${testResult.connected ? 'border-neon-success' : 'border-neon-error'}`}>
          <h4 className="font-medium mb-4 flex items-center gap-2">
            {testResult.connected ? (
              <>
                <Check className="w-5 h-5 text-neon-success" />
                Connection Successful
              </>
            ) : (
              <>
                <X className="w-5 h-5 text-neon-error" />
                Connection Failed
              </>
            )}
          </h4>

          {testResult.connected && testResult.serverInfo && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-neon-text-muted">Latency</p>
                  <p className="font-medium">{testResult.latency}ms</p>
                </div>
                <div>
                  <p className="text-neon-text-muted">Server Version</p>
                  <p className="font-medium">{testResult.serverInfo.version}</p>
                </div>
                <div>
                  <p className="text-neon-text-muted">Active Rooms</p>
                  <p className="font-medium">{testResult.serverInfo.activeRooms}</p>
                </div>
                <div>
                  <p className="text-neon-text-muted">Total Participants</p>
                  <p className="font-medium">{testResult.serverInfo.totalParticipants}</p>
                </div>
              </div>
            </div>
          )}

          {!testResult.connected && testResult.error && (
            <p className="text-sm text-neon-error">{testResult.error}</p>
          )}
        </div>
      )}

      {/* Server Settings (when connected) */}
      {data?.isConnected && data?.options?.settings && (
        <div className="card p-6">
          <h4 className="font-medium mb-4 flex items-center gap-2">
            <Settings className="w-5 h-5" />
            MEET Server Settings
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="p-3 bg-neon-surface-hover rounded-lg">
              <p className="text-neon-text-muted mb-1">Public Access</p>
              <p className="font-medium flex items-center gap-2">
                {data.options.settings.publicAccessEnabled ? (
                  <>
                    <Check className="w-4 h-4 text-neon-success" />
                    Enabled
                  </>
                ) : (
                  <>
                    <X className="w-4 h-4 text-neon-error" />
                    Disabled
                  </>
                )}
              </p>
            </div>
            <div className="p-3 bg-neon-surface-hover rounded-lg">
              <p className="text-neon-text-muted mb-1">Max Participants/Meeting</p>
              <p className="font-medium">
                {data.options.settings.maxParticipantsPerMeeting || 'Unlimited'}
                {data.options.recommendations?.maxParticipantsPerMeeting && (
                  <span className="text-xs text-neon-text-muted ml-2">
                    (Recommended: {data.options.recommendations.maxParticipantsPerMeeting})
                  </span>
                )}
              </p>
            </div>
            <div className="p-3 bg-neon-surface-hover rounded-lg">
              <p className="text-neon-text-muted mb-1">Max Concurrent Meetings</p>
              <p className="font-medium">
                {data.options.settings.maxConcurrentMeetings || 'Unlimited'}
                {data.options.recommendations?.maxConcurrentMeetings && (
                  <span className="text-xs text-neon-text-muted ml-2">
                    (Recommended: {data.options.recommendations.maxConcurrentMeetings})
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Documentation */}
      <div className="card p-6">
        <h4 className="font-medium mb-4">Integration Guide</h4>
        <div className="space-y-3 text-sm text-neon-text-muted">
          <p>
            MEET integration enables video conferencing directly within chat conversations.
            Once configured, users can start or join video calls using the video call button in the chat header.
          </p>
          <div className="space-y-2">
            <p className="text-white font-medium">Setup steps:</p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>Enter your MEET server base URL (e.g., https://meet2.neoncore.io)</li>
              <li>Generate an API key from your MEET admin panel</li>
              <li>Enter the API key and test the connection</li>
              <li>Configure quality settings and auto-join preference</li>
              <li>Save the configuration to enable video calls</li>
            </ol>
          </div>
          <p className="mt-4">
            <a
              href="https://meet2.neoncore.io/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="text-neon-info hover:underline inline-flex items-center gap-1"
            >
              View MEET API Documentation
              <ExternalLink className="w-3 h-3" />
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
