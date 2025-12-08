import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Settings,
  HardDrive,
  Cloud,
  Shield,
  Save,
  Loader2,
  Eye,
  EyeOff,
  Check,
  AlertTriangle,
  UserCheck,
  Copy,
  RefreshCw,
} from 'lucide-react';
import { adminApi, getErrorMessage } from '../../lib/api';

interface S3Settings {
  enabled: boolean;
  provider: 'aws' | 'minio' | 'backblaze' | 'wasabi' | 'custom';
  endpoint?: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  publicUrl?: string;
}

interface OrganizationSettings {
  storage: S3Settings;
  complianceMode: 'HIPAA' | 'GDPR' | 'STANDARD';
  messageRetentionDays: number;
  maxUploadSize: number;
  allowedFileTypes: string[];
  enableFederation: boolean;
}

interface DemoUserConfig {
  enabled: boolean;
  email?: string;
  password?: string;
  userId?: string;
}

export function AdminSettings() {
  const queryClient = useQueryClient();
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'untested' | 'success' | 'error'>('untested');
  const [showDemoPassword, setShowDemoPassword] = useState(false);

  // Fetch demo user config
  const { data: demoUserConfig } = useQuery<DemoUserConfig>({
    queryKey: ['admin', 'demo-user'],
    queryFn: async () => {
      const response = await adminApi.demoUser.get();
      return response.data.data as DemoUserConfig;
    },
  });

  // Demo user mutations
  const enableDemoUserMutation = useMutation({
    mutationFn: async () => {
      const response = await adminApi.demoUser.enable();
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'demo-user'] });
      toast.success('Demo user enabled');
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const disableDemoUserMutation = useMutation({
    mutationFn: async () => {
      const response = await adminApi.demoUser.disable();
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'demo-user'] });
      toast.success('Demo user disabled');
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const regenerateDemoPasswordMutation = useMutation({
    mutationFn: async () => {
      const response = await adminApi.demoUser.regenerate();
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'demo-user'] });
      toast.success('Demo user password regenerated');
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  // Fetch current settings
  const { data: settings, isLoading } = useQuery<OrganizationSettings>({
    queryKey: ['admin', 'settings'],
    queryFn: async () => {
      const response = await adminApi.getSettings();
      return response.data.data as OrganizationSettings;
    },
  });

  const [formData, setFormData] = useState<Partial<S3Settings>>({
    enabled: false,
    provider: 'custom',
    endpoint: '',
    bucket: '',
    region: 'us-east-1',
    accessKeyId: '',
    secretAccessKey: '',
    forcePathStyle: true,
    publicUrl: '',
  });

  // Update form data when settings are loaded
  useEffect(() => {
    if (settings?.storage) {
      setFormData({
        enabled: settings.storage.enabled || false,
        provider: settings.storage.provider || 'custom',
        endpoint: settings.storage.endpoint || '',
        bucket: settings.storage.bucket || '',
        region: settings.storage.region || 'us-east-1',
        accessKeyId: settings.storage.accessKeyId || '',
        secretAccessKey: '', // Don't pre-fill secret key
        forcePathStyle: settings.storage.forcePathStyle !== false,
        publicUrl: settings.storage.publicUrl || '',
      });
      // If storage is already enabled, set connection status to success
      if (settings.storage.enabled && settings.storage.bucket) {
        setConnectionStatus('success');
      }
    }
  }, [settings]);

  // Save settings mutation
  const saveMutation = useMutation({
    mutationFn: async (data: { storage: Partial<S3Settings> }) => {
      const response = await adminApi.updateSettings(data);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
      toast.success('Settings saved successfully');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  // Test connection
  const testConnection = async () => {
    setTestingConnection(true);
    setConnectionStatus('untested');
    try {
      await adminApi.testStorageConnection({
        ...formData,
        secretAccessKey: formData.secretAccessKey || settings?.storage?.secretAccessKey,
      });
      setConnectionStatus('success');
      toast.success('Connection successful!');
    } catch (error) {
      setConnectionStatus('error');
      toast.error('Connection failed: ' + getErrorMessage(error));
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate({ storage: formData });
  };

  const providerPresets: Record<string, Partial<S3Settings>> = {
    aws: { endpoint: '', region: 'us-east-1', forcePathStyle: false },
    minio: { endpoint: 'http://localhost:9000', region: 'us-east-1', forcePathStyle: true },
    backblaze: { endpoint: 'https://s3.us-west-000.backblazeb2.com', region: 'us-west-000', forcePathStyle: false },
    wasabi: { endpoint: 'https://s3.wasabisys.com', region: 'us-east-1', forcePathStyle: false },
    custom: { endpoint: '', region: 'us-east-1', forcePathStyle: true },
  };

  const applyPreset = (provider: S3Settings['provider']) => {
    const preset = providerPresets[provider];
    setFormData({
      ...formData,
      provider,
      ...preset,
    });
    setConnectionStatus('untested');
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
      <h2 className="text-xl font-semibold mb-6">System Settings</h2>

      {/* Storage Configuration */}
      <form onSubmit={handleSubmit}>
        <div className="card p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-neon-accent/20 flex items-center justify-center">
              <Cloud className="w-5 h-5 text-neon-accent" />
            </div>
            <div>
              <h3 className="text-lg font-medium">S3-Compatible Storage</h3>
              <p className="text-sm text-neon-text-muted">
                Configure external storage for file uploads
              </p>
            </div>
          </div>

          {/* Enable toggle */}
          <div className="flex items-center justify-between p-4 bg-neon-surface-hover rounded-lg mb-6">
            <div>
              <p className="font-medium">Enable External Storage</p>
              <p className="text-sm text-neon-text-muted">
                Use S3-compatible storage instead of local filesystem
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={formData.enabled}
                onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-neon-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-neon-accent"></div>
            </label>
          </div>

          {formData.enabled && (
            <div className="space-y-6">
              {/* Provider selection */}
              <div>
                <label className="block text-sm font-medium mb-2">Provider</label>
                <div className="grid grid-cols-5 gap-2">
                  {(['aws', 'minio', 'backblaze', 'wasabi', 'custom'] as const).map((provider) => (
                    <button
                      key={provider}
                      type="button"
                      className={`p-3 rounded-lg border text-center text-sm font-medium transition-colors ${
                        formData.provider === provider
                          ? 'border-neon-accent bg-neon-accent/20 text-white'
                          : 'border-neon-border hover:border-neon-text-muted'
                      }`}
                      onClick={() => applyPreset(provider)}
                    >
                      {provider === 'aws' && 'AWS S3'}
                      {provider === 'minio' && 'MinIO'}
                      {provider === 'backblaze' && 'Backblaze'}
                      {provider === 'wasabi' && 'Wasabi'}
                      {provider === 'custom' && 'Custom'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Endpoint */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Endpoint URL
                    {formData.provider === 'aws' && (
                      <span className="text-neon-text-muted ml-1">(optional for AWS)</span>
                    )}
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder="https://s3.example.com"
                    value={formData.endpoint || ''}
                    onChange={(e) => setFormData({ ...formData, endpoint: e.target.value })}
                  />
                </div>

                {/* Region */}
                <div>
                  <label className="block text-sm font-medium mb-2">Region</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="us-east-1"
                    value={formData.region}
                    onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                  />
                </div>
              </div>

              {/* Bucket */}
              <div>
                <label className="block text-sm font-medium mb-2">Bucket Name</label>
                <input
                  type="text"
                  className="input"
                  placeholder="my-bucket"
                  value={formData.bucket}
                  onChange={(e) => setFormData({ ...formData, bucket: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Access Key ID */}
                <div>
                  <label className="block text-sm font-medium mb-2">Access Key ID</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="AKIAIOSFODNN7EXAMPLE"
                    value={formData.accessKeyId}
                    onChange={(e) => setFormData({ ...formData, accessKeyId: e.target.value })}
                  />
                </div>

                {/* Secret Access Key */}
                <div>
                  <label className="block text-sm font-medium mb-2">Secret Access Key</label>
                  <div className="relative">
                    <input
                      type={showSecretKey ? 'text' : 'password'}
                      className="input pr-10"
                      placeholder={settings?.storage?.secretAccessKey ? '••••••••••••' : 'Enter secret key'}
                      value={formData.secretAccessKey}
                      onChange={(e) => setFormData({ ...formData, secretAccessKey: e.target.value })}
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neon-text-muted"
                      onClick={() => setShowSecretKey(!showSecretKey)}
                    >
                      {showSecretKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Public URL */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Public URL
                  <span className="text-neon-text-muted ml-1">(optional)</span>
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="https://cdn.example.com"
                  value={formData.publicUrl || ''}
                  onChange={(e) => setFormData({ ...formData, publicUrl: e.target.value })}
                />
                <p className="mt-1 text-xs text-neon-text-muted">
                  Custom URL for accessing files (e.g., CDN). Leave empty to use default.
                </p>
              </div>

              {/* Path style */}
              <div className="flex items-center justify-between p-4 bg-neon-surface-hover rounded-lg">
                <div>
                  <p className="font-medium">Force Path Style</p>
                  <p className="text-sm text-neon-text-muted">
                    Use path-style URLs instead of virtual-hosted-style
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.forcePathStyle}
                    onChange={(e) => setFormData({ ...formData, forcePathStyle: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-neon-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-neon-accent"></div>
                </label>
              </div>

              {/* Test connection */}
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={testConnection}
                  disabled={testingConnection || !formData.bucket || !formData.accessKeyId}
                >
                  {testingConnection ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Testing...</span>
                    </>
                  ) : (
                    <span>Test Connection</span>
                  )}
                </button>
                {connectionStatus === 'success' && (
                  <>
                    <span className="flex items-center gap-2 text-neon-success">
                      <Check className="w-4 h-4" />
                      Connection successful
                    </span>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => saveMutation.mutate({ storage: formData })}
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
                          <span>Save S3 Settings</span>
                        </>
                      )}
                    </button>
                  </>
                )}
                {connectionStatus === 'error' && (
                  <span className="flex items-center gap-2 text-neon-error">
                    <AlertTriangle className="w-4 h-4" />
                    Connection failed
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Compliance & Security */}
        <div className="card p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-neon-warning/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-neon-warning" />
            </div>
            <div>
              <h3 className="text-lg font-medium">Compliance & Security</h3>
              <p className="text-sm text-neon-text-muted">
                Configure data retention and security policies
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium mb-2">Compliance Mode</label>
              <select className="input" defaultValue={settings?.complianceMode || 'STANDARD'}>
                <option value="STANDARD">Standard</option>
                <option value="HIPAA">HIPAA</option>
                <option value="GDPR">GDPR</option>
              </select>
              <p className="mt-1 text-xs text-neon-text-muted">
                Affects data retention, encryption, and audit requirements
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Message Retention (days)</label>
              <input
                type="number"
                className="input"
                min="0"
                defaultValue={settings?.messageRetentionDays || 365}
              />
              <p className="mt-1 text-xs text-neon-text-muted">
                0 = keep forever
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Max Upload Size (MB)</label>
              <input
                type="number"
                className="input"
                min="1"
                max="1024"
                defaultValue={settings?.maxUploadSize || 50}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Allowed File Types</label>
              <input
                type="text"
                className="input"
                placeholder="pdf,doc,docx,xls,xlsx,png,jpg"
                defaultValue={settings?.allowedFileTypes?.join(',') || 'pdf,doc,docx,xls,xlsx,png,jpg,gif'}
              />
              <p className="mt-1 text-xs text-neon-text-muted">
                Comma-separated file extensions
              </p>
            </div>
          </div>
        </div>

        {/* Demo User Settings */}
        <div className="card">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-neon-primary" />
              <h2 className="card-title">Demo User</h2>
            </div>
            <p className="card-description">
              Enable a demo user account for testing chat features (can only receive/respond, not initiate)
            </p>
          </div>
          <div className="card-body space-y-4">
            {/* Enable/Disable toggle */}
            <div className="flex items-center justify-between p-4 bg-neon-surface-hover rounded-lg">
              <div>
                <p className="font-medium">Demo User Account</p>
                <p className="text-sm text-neon-text-muted">
                  {demoUserConfig?.enabled
                    ? 'Demo user is currently enabled'
                    : 'Demo user is currently disabled'}
                </p>
              </div>
              <button
                type="button"
                className={`btn ${demoUserConfig?.enabled ? 'btn-error' : 'btn-primary'}`}
                onClick={() => {
                  if (demoUserConfig?.enabled) {
                    disableDemoUserMutation.mutate();
                  } else {
                    enableDemoUserMutation.mutate();
                  }
                }}
                disabled={enableDemoUserMutation.isPending || disableDemoUserMutation.isPending}
              >
                {(enableDemoUserMutation.isPending || disableDemoUserMutation.isPending) ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : demoUserConfig?.enabled ? (
                  'Disable'
                ) : (
                  'Enable'
                )}
              </button>
            </div>

            {/* Demo credentials */}
            {demoUserConfig?.enabled && demoUserConfig?.email && (
              <div className="p-4 bg-neon-surface-hover rounded-lg space-y-4">
                <div className="flex items-center gap-2 text-neon-success">
                  <Check className="w-5 h-5" />
                  <span className="font-medium">Demo User Credentials</span>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-sm text-neon-text-muted">Email</label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 p-2 bg-neon-bg rounded font-mono text-sm">
                        {demoUserConfig.email}
                      </code>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => copyToClipboard(demoUserConfig.email!)}
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm text-neon-text-muted">Password</label>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <input
                          type={showDemoPassword ? 'text' : 'password'}
                          readOnly
                          value={demoUserConfig.password || '••••••••'}
                          className="input w-full font-mono text-sm"
                        />
                        <button
                          type="button"
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-neon-text-muted hover:text-neon-text"
                          onClick={() => setShowDemoPassword(!showDemoPassword)}
                        >
                          {showDemoPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => copyToClipboard(demoUserConfig.password!)}
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => regenerateDemoPasswordMutation.mutate()}
                        disabled={regenerateDemoPasswordMutation.isPending}
                      >
                        {regenerateDemoPasswordMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-neon-text-muted">
                  This demo user can only receive and respond to chat messages, not initiate conversations.
                  Use these credentials to test the chat features.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Save button */}
        <div className="flex justify-end">
          <button
            type="submit"
            className="btn btn-primary"
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
                <span>Save Settings</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export default AdminSettings;
