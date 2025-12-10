import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';
import {
  Code,
  Key,
  Webhook,
  Plus,
  Trash2,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  ExternalLink,
  Check,
  X,
  RefreshCw,
  AlertTriangle,
  Play,
  BookOpen,
} from 'lucide-react';
import { adminApi, getErrorMessage } from '../../lib/api';

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  rateLimit?: number;
  createdAt: string;
  lastUsedAt?: string;
  expiresAt?: string;
}

interface WebhookData {
  id: string;
  name: string;
  url: string;
  events: string[];
  enabled: boolean;
  lastTriggeredAt?: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  failureCount: number;
  successCount: number;
  createdAt: string;
  secret?: string;
}

interface EventOption {
  id: string;
  name: string;
  description: string;
}

interface ScopeOption {
  id: string;
  name: string;
  description: string;
}

export function Developers() {
  const queryClient = useQueryClient();
  const [showCreateApiKey, setShowCreateApiKey] = useState(false);
  const [showCreateWebhook, setShowCreateWebhook] = useState(false);
  const [newApiKey, setNewApiKey] = useState<{ key: string; name: string } | null>(null);
  const [newWebhookSecret, setNewWebhookSecret] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);

  // Fetch available events and scopes
  const { data: eventsData } = useQuery<EventOption[]>({
    queryKey: ['admin', 'developers', 'events'],
    queryFn: async () => {
      const response = await adminApi.developers.getEvents();
      return response.data.data as EventOption[];
    },
  });

  const { data: scopesData } = useQuery<ScopeOption[]>({
    queryKey: ['admin', 'developers', 'scopes'],
    queryFn: async () => {
      const response = await adminApi.developers.getScopes();
      return response.data.data as ScopeOption[];
    },
  });

  // Fetch API keys
  const { data: apiKeysData, isLoading: isLoadingApiKeys } = useQuery({
    queryKey: ['admin', 'developers', 'api-keys'],
    queryFn: async () => {
      const response = await adminApi.developers.apiKeys.list({ limit: 100 });
      return response.data;
    },
  });

  // Fetch webhooks
  const { data: webhooksData, isLoading: isLoadingWebhooks } = useQuery({
    queryKey: ['admin', 'developers', 'webhooks'],
    queryFn: async () => {
      const response = await adminApi.developers.webhooks.list({ limit: 100 });
      return response.data;
    },
  });

  const apiKeys = (apiKeysData?.data || []) as ApiKey[];
  const webhooks = (webhooksData?.data || []) as WebhookData[];

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Developers</h2>

      {/* API Documentation Link */}
      <div className="card p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-neon-primary/20 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-neon-primary" />
          </div>
          <div>
            <h3 className="text-lg font-medium">API Documentation</h3>
            <p className="text-sm text-neon-text-muted">
              Learn how to integrate with the NEON API
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <a
            href="/api/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
          >
            <BookOpen className="w-4 h-4" />
            <span>View API Documentation</span>
            <ExternalLink className="w-4 h-4" />
          </a>
          <span className="text-sm text-neon-text-muted">
            Base URL: <code className="bg-neon-surface-hover px-2 py-1 rounded">{window.location.origin}/api</code>
          </span>
        </div>
      </div>

      {/* API Keys Section */}
      <div className="card p-6 mb-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-neon-accent/20 flex items-center justify-center">
              <Key className="w-5 h-5 text-neon-accent" />
            </div>
            <div>
              <h3 className="text-lg font-medium">API Keys</h3>
              <p className="text-sm text-neon-text-muted">
                Manage API keys for programmatic access
              </p>
            </div>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => setShowCreateApiKey(true)}
          >
            <Plus className="w-4 h-4" />
            <span>Create API Key</span>
          </button>
        </div>

        {/* New API Key Display */}
        {newApiKey && (
          <div className="mb-6 p-4 bg-neon-success/10 border border-neon-success/30 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <Check className="w-5 h-5 text-neon-success" />
              <span className="font-medium text-neon-success">API Key Created: {newApiKey.name}</span>
            </div>
            <p className="text-sm text-neon-text-muted mb-2">
              Copy your API key now. You won't be able to see it again!
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 p-3 bg-neon-bg rounded font-mono text-sm break-all">
                {newApiKey.key}
              </code>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  copyToClipboard(newApiKey.key);
                }}
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
            <button
              className="mt-3 text-sm text-neon-text-muted hover:text-neon-text"
              onClick={() => setNewApiKey(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* API Keys Table */}
        {isLoadingApiKeys ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-neon-text-muted" />
          </div>
        ) : apiKeys.length === 0 ? (
          <div className="text-center py-8 text-neon-text-muted">
            <Key className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No API keys yet</p>
            <p className="text-sm">Create your first API key to get started</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-neon-surface-hover">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-neon-text-secondary">Name</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-neon-text-secondary">Key</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-neon-text-secondary">Scopes</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-neon-text-secondary">Last Used</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-neon-text-secondary">Created</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-neon-text-secondary">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neon-border">
                {apiKeys.map((key) => (
                  <ApiKeyRow
                    key={key.id}
                    apiKey={key}
                    onRevoke={() => queryClient.invalidateQueries({ queryKey: ['admin', 'developers', 'api-keys'] })}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Webhooks Section */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-neon-warning/20 flex items-center justify-center">
              <Webhook className="w-5 h-5 text-neon-warning" />
            </div>
            <div>
              <h3 className="text-lg font-medium">Webhooks</h3>
              <p className="text-sm text-neon-text-muted">
                Receive real-time event notifications
              </p>
            </div>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => setShowCreateWebhook(true)}
          >
            <Plus className="w-4 h-4" />
            <span>Add Webhook</span>
          </button>
        </div>

        {/* New Webhook Secret Display */}
        {newWebhookSecret && (
          <div className="mb-6 p-4 bg-neon-success/10 border border-neon-success/30 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <Check className="w-5 h-5 text-neon-success" />
              <span className="font-medium text-neon-success">Webhook Created</span>
            </div>
            <p className="text-sm text-neon-text-muted mb-2">
              Copy your webhook secret now. You won't be able to see it again!
            </p>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type={showSecret ? 'text' : 'password'}
                  readOnly
                  value={newWebhookSecret}
                  className="input w-full font-mono text-sm pr-10"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-neon-text-muted hover:text-neon-text"
                  onClick={() => setShowSecret(!showSecret)}
                >
                  {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <button
                className="btn btn-secondary"
                onClick={() => copyToClipboard(newWebhookSecret)}
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
            <button
              className="mt-3 text-sm text-neon-text-muted hover:text-neon-text"
              onClick={() => {
                setNewWebhookSecret(null);
                setShowSecret(false);
              }}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Webhooks List */}
        {isLoadingWebhooks ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-neon-text-muted" />
          </div>
        ) : webhooks.length === 0 ? (
          <div className="text-center py-8 text-neon-text-muted">
            <Webhook className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No webhooks configured</p>
            <p className="text-sm">Add a webhook to receive real-time notifications</p>
          </div>
        ) : (
          <div className="space-y-4">
            {webhooks.map((webhook) => (
              <WebhookCard
                key={webhook.id}
                webhook={webhook}
                events={eventsData || []}
                onUpdate={() => queryClient.invalidateQueries({ queryKey: ['admin', 'developers', 'webhooks'] })}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create API Key Modal */}
      {showCreateApiKey && (
        <CreateApiKeyModal
          scopes={scopesData || []}
          onClose={() => setShowCreateApiKey(false)}
          onCreated={(key) => {
            setNewApiKey(key);
            setShowCreateApiKey(false);
            queryClient.invalidateQueries({ queryKey: ['admin', 'developers', 'api-keys'] });
          }}
        />
      )}

      {/* Create Webhook Modal */}
      {showCreateWebhook && (
        <CreateWebhookModal
          events={eventsData || []}
          onClose={() => setShowCreateWebhook(false)}
          onCreated={(secret) => {
            setNewWebhookSecret(secret);
            setShowCreateWebhook(false);
            queryClient.invalidateQueries({ queryKey: ['admin', 'developers', 'webhooks'] });
          }}
        />
      )}
    </div>
  );
}

// API Key Row Component
function ApiKeyRow({ apiKey, onRevoke }: { apiKey: ApiKey; onRevoke: () => void }) {
  const revokeMutation = useMutation({
    mutationFn: () => adminApi.developers.apiKeys.revoke(apiKey.id),
    onSuccess: () => {
      toast.success('API key revoked');
      onRevoke();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <tr>
      <td className="px-4 py-3 font-medium">{apiKey.name}</td>
      <td className="px-4 py-3">
        <code className="text-sm text-neon-text-muted">{apiKey.keyPrefix}...</code>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {apiKey.scopes.length === 0 ? (
            <span className="text-sm text-neon-text-muted">None</span>
          ) : (
            apiKey.scopes.slice(0, 3).map((scope) => (
              <span key={scope} className="badge badge-sm">{scope}</span>
            ))
          )}
          {apiKey.scopes.length > 3 && (
            <span className="badge badge-sm">+{apiKey.scopes.length - 3}</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-neon-text-secondary">
        {apiKey.lastUsedAt
          ? formatDistanceToNow(new Date(apiKey.lastUsedAt), { addSuffix: true })
          : 'Never'}
      </td>
      <td className="px-4 py-3 text-sm text-neon-text-secondary">
        {formatDistanceToNow(new Date(apiKey.createdAt), { addSuffix: true })}
      </td>
      <td className="px-4 py-3 text-right">
        <button
          className="btn btn-sm btn-ghost text-neon-error"
          onClick={() => {
            if (confirm('Are you sure you want to revoke this API key? This action cannot be undone.')) {
              revokeMutation.mutate();
            }
          }}
          disabled={revokeMutation.isPending}
        >
          {revokeMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Trash2 className="w-4 h-4" />
          )}
        </button>
      </td>
    </tr>
  );
}

// Webhook Card Component
function WebhookCard({ webhook, events, onUpdate }: { webhook: WebhookData; events: EventOption[]; onUpdate: () => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    name: webhook.name,
    url: webhook.url,
    events: webhook.events,
    enabled: webhook.enabled,
  });

  const updateMutation = useMutation({
    mutationFn: (data: typeof editData) => adminApi.developers.webhooks.update(webhook.id, data),
    onSuccess: () => {
      toast.success('Webhook updated');
      setIsEditing(false);
      onUpdate();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: () => adminApi.developers.webhooks.delete(webhook.id),
    onSuccess: () => {
      toast.success('Webhook deleted');
      onUpdate();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const testMutation = useMutation({
    mutationFn: () => adminApi.developers.webhooks.test(webhook.id),
    onSuccess: (response) => {
      const result = response.data.data;
      if (result.success) {
        toast.success(`Test successful (${result.latency}ms)`);
      } else {
        toast.error(result.message);
      }
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const toggleEvent = (eventId: string) => {
    setEditData((prev) => ({
      ...prev,
      events: prev.events.includes(eventId)
        ? prev.events.filter((e) => e !== eventId)
        : [...prev.events, eventId],
    }));
  };

  if (isEditing) {
    return (
      <div className="p-4 bg-neon-surface-hover rounded-lg">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-2">Name</label>
            <input
              type="text"
              className="input"
              value={editData.name}
              onChange={(e) => setEditData({ ...editData, name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">URL</label>
            <input
              type="url"
              className="input"
              value={editData.url}
              onChange={(e) => setEditData({ ...editData, url: e.target.value })}
            />
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Events</label>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-2 bg-neon-bg rounded-lg">
            {events.map((event) => (
              <label
                key={event.id}
                className="flex items-center gap-2 p-2 rounded hover:bg-neon-surface-hover cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={editData.events.includes(event.id)}
                  onChange={() => toggleEvent(event.id)}
                  className="rounded"
                />
                <span className="text-sm">{event.name}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={editData.enabled}
              onChange={(e) => setEditData({ ...editData, enabled: e.target.checked })}
              className="rounded"
            />
            <span className="text-sm">Enabled</span>
          </label>
          <div className="flex items-center gap-2">
            <button
              className="btn btn-ghost"
              onClick={() => setIsEditing(false)}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={() => updateMutation.mutate(editData)}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Save'
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-neon-surface-hover rounded-lg">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="font-medium">{webhook.name}</h4>
            <span className={`badge ${webhook.enabled ? 'badge-success' : 'badge-error'}`}>
              {webhook.enabled ? 'Active' : 'Disabled'}
            </span>
          </div>
          <code className="text-sm text-neon-text-muted">{webhook.url}</code>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
            title="Test webhook"
          >
            {testMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
          </button>
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => setIsEditing(true)}
          >
            Edit
          </button>
          <button
            className="btn btn-sm btn-ghost text-neon-error"
            onClick={() => {
              if (confirm('Are you sure you want to delete this webhook?')) {
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
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 mb-3">
        {webhook.events.slice(0, 5).map((event) => (
          <span key={event} className="badge badge-sm">{event}</span>
        ))}
        {webhook.events.length > 5 && (
          <span className="badge badge-sm">+{webhook.events.length - 5} more</span>
        )}
      </div>

      <div className="flex items-center gap-4 text-sm text-neon-text-muted">
        <span className="flex items-center gap-1">
          <Check className="w-4 h-4 text-neon-success" />
          {webhook.successCount} successful
        </span>
        <span className="flex items-center gap-1">
          <X className="w-4 h-4 text-neon-error" />
          {webhook.failureCount} failed
        </span>
        {webhook.lastTriggeredAt && (
          <span>
            Last triggered {formatDistanceToNow(new Date(webhook.lastTriggeredAt), { addSuffix: true })}
          </span>
        )}
      </div>
    </div>
  );
}

// Create API Key Modal
function CreateApiKeyModal({
  scopes,
  onClose,
  onCreated,
}: {
  scopes: ScopeOption[];
  onClose: () => void;
  onCreated: (key: { key: string; name: string }) => void;
}) {
  const [name, setName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);

  const createMutation = useMutation({
    mutationFn: () => adminApi.developers.apiKeys.create({ name, scopes: selectedScopes }),
    onSuccess: (response) => {
      const data = response.data.data;
      onCreated({ key: data.key, name: data.name });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const toggleScope = (scopeId: string) => {
    setSelectedScopes((prev) =>
      prev.includes(scopeId)
        ? prev.filter((s) => s !== scopeId)
        : [...prev, scopeId]
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Create API Key</h3>
        </div>
        <div className="modal-body space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Name</label>
            <input
              type="text"
              className="input"
              placeholder="My API Key"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Scopes (optional)</label>
            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 bg-neon-surface-hover rounded-lg">
              {scopes.map((scope) => (
                <label
                  key={scope.id}
                  className="flex items-start gap-2 p-2 rounded hover:bg-neon-bg cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedScopes.includes(scope.id)}
                    onChange={() => toggleScope(scope.id)}
                    className="rounded mt-0.5"
                  />
                  <div>
                    <span className="text-sm font-medium">{scope.name}</span>
                    <p className="text-xs text-neon-text-muted">{scope.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => createMutation.mutate()}
            disabled={!name || createMutation.isPending}
          >
            {createMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'Create API Key'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Create Webhook Modal
function CreateWebhookModal({
  events,
  onClose,
  onCreated,
}: {
  events: EventOption[];
  onClose: () => void;
  onCreated: (secret: string) => void;
}) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);

  const createMutation = useMutation({
    mutationFn: () => adminApi.developers.webhooks.create({ name, url, events: selectedEvents }),
    onSuccess: (response) => {
      const data = response.data.data;
      onCreated(data.secret);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const toggleEvent = (eventId: string) => {
    setSelectedEvents((prev) =>
      prev.includes(eventId)
        ? prev.filter((e) => e !== eventId)
        : [...prev, eventId]
    );
  };

  const selectAll = () => {
    setSelectedEvents(events.map((e) => e.id));
  };

  const selectNone = () => {
    setSelectedEvents([]);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Add Webhook</h3>
        </div>
        <div className="modal-body space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Name</label>
              <input
                type="text"
                className="input"
                placeholder="My Webhook"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">URL</label>
              <input
                type="url"
                className="input"
                placeholder="https://example.com/webhook"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Events</label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="text-xs text-neon-accent hover:underline"
                  onClick={selectAll}
                >
                  Select all
                </button>
                <span className="text-neon-text-muted">|</span>
                <button
                  type="button"
                  className="text-xs text-neon-accent hover:underline"
                  onClick={selectNone}
                >
                  Select none
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-64 overflow-y-auto p-2 bg-neon-surface-hover rounded-lg">
              {events.map((event) => (
                <label
                  key={event.id}
                  className="flex items-start gap-2 p-2 rounded hover:bg-neon-bg cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedEvents.includes(event.id)}
                    onChange={() => toggleEvent(event.id)}
                    className="rounded mt-0.5"
                  />
                  <div>
                    <span className="text-sm font-medium">{event.name}</span>
                    <p className="text-xs text-neon-text-muted">{event.description}</p>
                  </div>
                </label>
              ))}
            </div>
            {selectedEvents.length === 0 && (
              <p className="mt-2 text-sm text-neon-warning flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" />
                Select at least one event
              </p>
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => createMutation.mutate()}
            disabled={!name || !url || selectedEvents.length === 0 || createMutation.isPending}
          >
            {createMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'Create Webhook'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Developers;
