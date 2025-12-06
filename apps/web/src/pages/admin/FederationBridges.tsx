import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';
import {
  Plus,
  Pencil,
  Trash2,
  Globe,
  Link,
  Loader2,
  X,
  Check,
  AlertTriangle,
  Play,
  RefreshCw,
  Eye,
  EyeOff,
  Activity,
  ArrowLeftRight,
  Clock,
} from 'lucide-react';
import { adminApi, getErrorMessage } from '../../lib/api';

// Types
interface FederationBridge {
  id: string;
  name: string;
  remoteUrl: string;
  isEnabled: boolean;
  status: 'connected' | 'disconnected' | 'error';
  lastSync?: string;
  lastPing?: number;
  syncedUsers?: number;
  syncedRooms?: number;
  createdAt: string;
  updatedAt: string;
}

// Form schema
const bridgeSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  remoteUrl: z.string().url('Invalid URL'),
  sharedSecret: z.string().min(32, 'Shared secret must be at least 32 characters'),
  isEnabled: z.boolean(),
});

type BridgeFormData = z.infer<typeof bridgeSchema>;

// Bridge Form Modal
function BridgeFormModal({
  bridge,
  onClose,
  onSuccess,
}: {
  bridge?: FederationBridge;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEditing = !!bridge;
  const [showSecret, setShowSecret] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<BridgeFormData>({
    resolver: zodResolver(bridgeSchema),
    defaultValues: {
      name: bridge?.name || '',
      remoteUrl: bridge?.remoteUrl || '',
      sharedSecret: '',
      isEnabled: bridge?.isEnabled ?? true,
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: BridgeFormData) => adminApi.federation.createBridge(data),
    onSuccess: () => {
      toast.success('Bridge created');
      onSuccess();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: (data: BridgeFormData) => adminApi.federation.updateBridge(bridge!.id, data),
    onSuccess: () => {
      toast.success('Bridge updated');
      onSuccess();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const onSubmit = (data: BridgeFormData) => {
    if (isEditing) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const generateSecret = () => {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const secret = Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
    const input = document.querySelector('input[name="sharedSecret"]') as HTMLInputElement;
    if (input) {
      input.value = secret;
      const event = new Event('input', { bubbles: true });
      input.dispatchEvent(event);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-neon-border">
          <h2 className="text-lg font-semibold">
            {isEditing ? 'Edit Federation Bridge' : 'Create Federation Bridge'}
          </h2>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium mb-2">Bridge Name</label>
            <input
              type="text"
              className={`input ${errors.name ? 'input-error' : ''}`}
              placeholder="e.g. Partner Organization"
              {...register('name')}
            />
            {errors.name && (
              <p className="mt-1 text-sm text-neon-error">{errors.name.message}</p>
            )}
          </div>

          {/* Remote URL */}
          <div>
            <label className="block text-sm font-medium mb-2">Remote Instance URL</label>
            <input
              type="text"
              className={`input ${errors.remoteUrl ? 'input-error' : ''}`}
              placeholder="https://neon.partner-company.com"
              {...register('remoteUrl')}
            />
            {errors.remoteUrl && (
              <p className="mt-1 text-sm text-neon-error">{errors.remoteUrl.message}</p>
            )}
            <p className="mt-1 text-xs text-neon-text-muted">
              The base URL of the remote NEON instance
            </p>
          </div>

          {/* Shared Secret */}
          <div>
            <label className="block text-sm font-medium mb-2">Shared Secret</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showSecret ? 'text' : 'password'}
                  className={`input pr-10 font-mono text-sm ${errors.sharedSecret ? 'input-error' : ''}`}
                  placeholder={isEditing ? '(unchanged)' : 'Enter or generate a secret'}
                  {...register('sharedSecret')}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neon-text-muted"
                  onClick={() => setShowSecret(!showSecret)}
                >
                  {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={generateSecret}
              >
                Generate
              </button>
            </div>
            {errors.sharedSecret && (
              <p className="mt-1 text-sm text-neon-error">{errors.sharedSecret.message}</p>
            )}
            <p className="mt-1 text-xs text-neon-text-muted">
              This secret must match on both NEON instances
            </p>
          </div>

          {/* Enabled */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 rounded" {...register('isEnabled')} />
            <span className="text-sm">Enable this bridge</span>
          </label>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting || createMutation.isPending || updateMutation.isPending}
            >
              {(isSubmitting || createMutation.isPending || updateMutation.isPending) ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                isEditing ? 'Update' : 'Create'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Status badge component
function StatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { color: string; label: string }> = {
    connected: { color: 'badge-success', label: 'Connected' },
    disconnected: { color: 'badge-warning', label: 'Disconnected' },
    error: { color: 'badge-error', label: 'Error' },
  };

  const config = statusConfig[status] || { color: '', label: status };

  return <span className={`badge ${config.color}`}>{config.label}</span>;
}

// Main component
export default function FederationBridges() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingBridge, setEditingBridge] = useState<FederationBridge | undefined>();

  // Fetch bridges
  const { data: bridges, isLoading } = useQuery({
    queryKey: ['admin', 'federation', 'bridges'],
    queryFn: async () => {
      const response = await adminApi.federation.getBridges();
      return response.data.data as FederationBridge[];
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.federation.deleteBridge(id),
    onSuccess: () => {
      toast.success('Bridge deleted');
      queryClient.invalidateQueries({ queryKey: ['admin', 'federation', 'bridges'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  // Test mutation
  const testMutation = useMutation({
    mutationFn: (id: string) => adminApi.federation.testBridge(id),
    onSuccess: (response) => {
      const result = (response.data as any).data;
      if (result.success) {
        toast.success(`Connection successful (${result.latency}ms)`);
      } else {
        toast.error(`Connection failed: ${result.message}`);
      }
      queryClient.invalidateQueries({ queryKey: ['admin', 'federation', 'bridges'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  // Sync mutation
  const syncMutation = useMutation({
    mutationFn: (id: string) => adminApi.federation.syncBridge(id),
    onSuccess: (response) => {
      const result = (response.data as any).data;
      toast.success(`Synced ${result.synced} items`);
      queryClient.invalidateQueries({ queryKey: ['admin', 'federation', 'bridges'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">Federation Bridges</h2>
          <p className="text-neon-text-muted">
            Connect to other NEON instances for cross-organization communication
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            setEditingBridge(undefined);
            setShowModal(true);
          }}
        >
          <Plus className="w-4 h-4" />
          <span>Add Bridge</span>
        </button>
      </div>

      {/* Info card */}
      <div className="card p-4 mb-6 bg-neon-surface-hover">
        <div className="flex items-start gap-3">
          <ArrowLeftRight className="w-5 h-5 text-neon-text-muted mt-0.5" />
          <div>
            <p className="font-medium">How Federation Works</p>
            <p className="text-sm text-neon-text-muted">
              Federation allows users from different NEON instances to communicate seamlessly.
              Both instances must configure a bridge with matching shared secrets.
            </p>
          </div>
        </div>
      </div>

      {/* Bridges list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : bridges?.length === 0 ? (
        <div className="card p-8 text-center">
          <Globe className="w-12 h-12 mx-auto mb-4 text-neon-text-muted" />
          <h3 className="text-lg font-medium mb-2">No Federation Bridges</h3>
          <p className="text-neon-text-muted mb-4">
            Create a bridge to connect with another NEON instance
          </p>
          <button
            className="btn btn-primary"
            onClick={() => {
              setEditingBridge(undefined);
              setShowModal(true);
            }}
          >
            <Plus className="w-4 h-4" />
            <span>Add Bridge</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {bridges?.map((bridge) => (
            <div key={bridge.id} className="card overflow-hidden">
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-neon-surface-hover flex items-center justify-center">
                      <Globe className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{bridge.name}</p>
                        <StatusBadge status={bridge.status} />
                        {!bridge.isEnabled && (
                          <span className="badge badge-warning">Disabled</span>
                        )}
                      </div>
                      <p className="text-sm text-neon-text-muted">{bridge.remoteUrl}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => testMutation.mutate(bridge.id)}
                      disabled={testMutation.isPending}
                      title="Test connection"
                    >
                      {testMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => syncMutation.mutate(bridge.id)}
                      disabled={syncMutation.isPending}
                      title="Sync now"
                    >
                      {syncMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => {
                        setEditingBridge(bridge);
                        setShowModal(true);
                      }}
                      title="Edit"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      className="btn btn-sm btn-ghost text-neon-error"
                      onClick={() => {
                        if (confirm(`Delete bridge "${bridge.name}"?`)) {
                          deleteMutation.mutate(bridge.id);
                        }
                      }}
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-4 gap-4 pt-4 border-t border-neon-border">
                  <div>
                    <p className="text-sm text-neon-text-muted">Latency</p>
                    <p className="font-medium">
                      {bridge.lastPing ? `${bridge.lastPing}ms` : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-neon-text-muted">Synced Users</p>
                    <p className="font-medium">{bridge.syncedUsers || 0}</p>
                  </div>
                  <div>
                    <p className="text-sm text-neon-text-muted">Synced Rooms</p>
                    <p className="font-medium">{bridge.syncedRooms || 0}</p>
                  </div>
                  <div>
                    <p className="text-sm text-neon-text-muted">Last Sync</p>
                    <p className="font-medium">
                      {bridge.lastSync
                        ? formatDistanceToNow(new Date(bridge.lastSync), { addSuffix: true })
                        : 'Never'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <BridgeFormModal
          bridge={editingBridge}
          onClose={() => {
            setShowModal(false);
            setEditingBridge(undefined);
          }}
          onSuccess={() => {
            setShowModal(false);
            setEditingBridge(undefined);
            queryClient.invalidateQueries({ queryKey: ['admin', 'federation', 'bridges'] });
          }}
        />
      )}
    </div>
  );
}
