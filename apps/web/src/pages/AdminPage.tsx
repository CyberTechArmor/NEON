import { useState } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import {
  Activity,
  FileText,
  Users,
  Shield,
  Database,
  Server,
  HardDrive,
  Check,
  X,
  Loader2,
  Download,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Key,
  Globe,
  Upload,
} from 'lucide-react';
import { useAuthStore } from '../stores/auth';
import { adminApi, getErrorMessage } from '../lib/api';

// Import admin sub-pages
import {
  UserManagement,
  RolesPermissions,
  SSOConfiguration,
  FederationBridges,
  BulkImport,
} from './admin';

// Helper function to format bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Types for admin dashboard
interface AdminStats {
  users?: number;
  messagesToday?: number;
  activeMeetings?: number;
  onlineUsers?: number;
  storage?: {
    storageUsed?: number;
    storageLimit?: number;
  };
}

interface HealthStatus {
  healthy?: boolean;
}

interface AdminHealth {
  database?: HealthStatus;
  redis?: HealthStatus;
  storage?: HealthStatus;
  livekit?: HealthStatus;
  jobs?: Record<string, { running?: boolean; description?: string; schedule?: string; lastRun?: string }>;
}

// Dashboard overview component
function AdminDashboard() {
  const { data: stats, isLoading: isLoadingStats } = useQuery<AdminStats>({
    queryKey: ['admin', 'stats'],
    queryFn: async () => {
      const response = await adminApi.getStats();
      return response.data.data as AdminStats;
    },
  });

  const { data: health, isLoading: isLoadingHealth, refetch: refetchHealth } = useQuery<AdminHealth>({
    queryKey: ['admin', 'health'],
    queryFn: async () => {
      const response = await adminApi.getHealth();
      return response.data.data as AdminHealth;
    },
    refetchInterval: 30000,
  });

  const triggerJobMutation = useMutation({
    mutationFn: (jobName: string) => adminApi.triggerJob(jobName),
    onSuccess: () => {
      toast.success('Job triggered');
      refetchHealth();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const statCards = [
    { label: 'Total Users', value: stats?.users || 0, icon: Users, color: 'text-neon-info' },
    { label: 'Messages Today', value: stats?.messagesToday || 0, icon: FileText, color: 'text-neon-success' },
    { label: 'Active Meetings', value: stats?.activeMeetings || 0, icon: Activity, color: 'text-neon-warning' },
    { label: 'Online Now', value: stats?.onlineUsers || 0, icon: Activity, color: 'text-white' },
  ];

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Dashboard</h2>

      {/* Stats grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((stat) => (
          <div key={stat.label} className="card p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-neon-text-muted">{stat.label}</span>
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
            </div>
            {isLoadingStats ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <p className="text-2xl font-bold">{stat.value.toLocaleString()}</p>
            )}
          </div>
        ))}
      </div>

      {/* System health */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium">System Health</h3>
          <button className="btn btn-sm btn-ghost" onClick={() => refetchHealth()}>
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Database */}
          <div className="card p-4">
            <div className="flex items-center gap-3 mb-3">
              <Database className="w-5 h-5 text-neon-text-muted" />
              <span className="font-medium">Database</span>
            </div>
            {isLoadingHealth ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <div className="flex items-center gap-2">
                {health?.database?.healthy ? (
                  <Check className="w-5 h-5 text-neon-success" />
                ) : (
                  <X className="w-5 h-5 text-neon-error" />
                )}
                <span className={health?.database?.healthy ? 'text-neon-success' : 'text-neon-error'}>
                  {health?.database?.healthy ? 'Healthy' : 'Unhealthy'}
                </span>
              </div>
            )}
          </div>

          {/* Redis */}
          <div className="card p-4">
            <div className="flex items-center gap-3 mb-3">
              <Server className="w-5 h-5 text-neon-text-muted" />
              <span className="font-medium">Redis</span>
            </div>
            {isLoadingHealth ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <div className="flex items-center gap-2">
                {health?.redis?.healthy ? (
                  <Check className="w-5 h-5 text-neon-success" />
                ) : (
                  <X className="w-5 h-5 text-neon-error" />
                )}
                <span className={health?.redis?.healthy ? 'text-neon-success' : 'text-neon-error'}>
                  {health?.redis?.healthy ? 'Healthy' : 'Unhealthy'}
                </span>
              </div>
            )}
          </div>

          {/* Storage */}
          <div className="card p-4">
            <div className="flex items-center gap-3 mb-3">
              <HardDrive className="w-5 h-5 text-neon-text-muted" />
              <span className="font-medium">Storage</span>
            </div>
            {isLoadingHealth ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <div className="flex items-center gap-2">
                {health?.storage?.healthy ? (
                  <Check className="w-5 h-5 text-neon-success" />
                ) : (
                  <X className="w-5 h-5 text-neon-error" />
                )}
                <span className={health?.storage?.healthy ? 'text-neon-success' : 'text-neon-error'}>
                  {health?.storage?.healthy ? 'Healthy' : 'Unhealthy'}
                </span>
              </div>
            )}
          </div>

          {/* LiveKit */}
          <div className="card p-4">
            <div className="flex items-center gap-3 mb-3">
              <Activity className="w-5 h-5 text-neon-text-muted" />
              <span className="font-medium">LiveKit</span>
            </div>
            {isLoadingHealth ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <div className="flex items-center gap-2">
                {health?.livekit?.healthy ? (
                  <Check className="w-5 h-5 text-neon-success" />
                ) : (
                  <X className="w-5 h-5 text-neon-error" />
                )}
                <span className={health?.livekit?.healthy ? 'text-neon-success' : 'text-neon-error'}>
                  {health?.livekit?.healthy ? 'Healthy' : 'Unhealthy'}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Storage usage */}
      <div className="mb-8">
        <h3 className="text-lg font-medium mb-4">Storage Usage</h3>
        <div className="card p-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-neon-text-muted">Used Space</span>
            <span>
              {formatBytes(stats?.storage?.storageUsed || 0)} / {formatBytes(stats?.storage?.storageLimit || 0)}
            </span>
          </div>
          <div className="h-3 bg-neon-surface-hover rounded-full overflow-hidden">
            <div
              className="h-full bg-neon-info transition-all"
              style={{
                width: `${((stats?.storage?.storageUsed || 0) / (stats?.storage?.storageLimit || 1)) * 100}%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Background jobs */}
      <div>
        <h3 className="text-lg font-medium mb-4">Background Jobs</h3>
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="bg-neon-surface-hover">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-neon-text-secondary">Job</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-neon-text-secondary">Status</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-neon-text-secondary">Schedule</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-neon-text-secondary">Last Run</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-neon-text-secondary">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neon-border">
              {health?.jobs ? (
                Object.entries(health.jobs).map(([name, job]: [string, any]) => (
                  <tr key={name}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{name}</p>
                      {job.description && (
                        <p className="text-sm text-neon-text-muted">{job.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge ${job.running ? 'badge-info' : 'badge-success'}`}>
                        {job.running ? 'Running' : 'Idle'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-neon-text-secondary">
                      {job.schedule || 'Manual'}
                    </td>
                    <td className="px-4 py-3 text-sm text-neon-text-secondary">
                      {job.lastRun
                        ? formatDistanceToNow(new Date(job.lastRun), { addSuffix: true })
                        : 'Never'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => triggerJobMutation.mutate(name)}
                        disabled={job.running || triggerJobMutation.isPending}
                      >
                        {triggerJobMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4" />
                        )}
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-neon-text-muted">
                    No job data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Enhanced audit log viewer
function AuditLogViewer() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    action: '',
    resourceType: '',
    startDate: '',
    endDate: '',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'audit', page, filters],
    queryFn: async () => {
      const response = await adminApi.getAuditLog({
        page,
        limit: 25,
        ...Object.fromEntries(Object.entries(filters).filter(([_, v]) => v)),
      });
      return response.data;
    },
  });

  const verifyIntegrityMutation = useMutation({
    mutationFn: () => adminApi.verifyAuditIntegrity(),
    onSuccess: (response) => {
      const result = (response.data as any).data;
      if (result.valid) {
        toast.success('Audit log integrity verified - no tampering detected');
      } else {
        toast.error(`Integrity check failed: ${result.issues?.length || 0} issues found`);
      }
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const handleExport = async (format: 'csv' | 'json') => {
    try {
      const startDate = filters.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const endDate = filters.endDate || new Date().toISOString();
      const response = await adminApi.exportAuditLog(startDate, endDate, format);
      const url = window.URL.createObjectURL(response.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-log.${format}`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('Export started');
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Audit Log</h2>
        <div className="flex items-center gap-2">
          <button
            className="btn btn-ghost"
            onClick={() => verifyIntegrityMutation.mutate()}
            disabled={verifyIntegrityMutation.isPending}
          >
            {verifyIntegrityMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Shield className="w-4 h-4" />
            )}
            <span>Verify Integrity</span>
          </button>
          <div className="relative group">
            <button className="btn btn-secondary">
              <Download className="w-4 h-4" />
              <span>Export</span>
            </button>
            <div className="absolute right-0 top-full mt-1 hidden group-hover:block z-10">
              <div className="dropdown-menu">
                <button className="dropdown-item w-full" onClick={() => handleExport('csv')}>
                  Export as CSV
                </button>
                <button className="dropdown-item w-full" onClick={() => handleExport('json')}>
                  Export as JSON
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <select
            className="input"
            value={filters.action}
            onChange={(e) => {
              setFilters({ ...filters, action: e.target.value });
              setPage(1);
            }}
          >
            <option value="">All actions</option>
            <option value="user.login">Login</option>
            <option value="user.logout">Logout</option>
            <option value="user.create">User Created</option>
            <option value="user.update">User Updated</option>
            <option value="user.delete">User Deleted</option>
            <option value="message.create">Message Sent</option>
            <option value="message.delete">Message Deleted</option>
            <option value="meeting.create">Meeting Created</option>
            <option value="meeting.join">Meeting Joined</option>
            <option value="settings.update">Settings Changed</option>
            <option value="permission.change">Permission Changed</option>
          </select>

          <select
            className="input"
            value={filters.resourceType}
            onChange={(e) => {
              setFilters({ ...filters, resourceType: e.target.value });
              setPage(1);
            }}
          >
            <option value="">All resources</option>
            <option value="user">User</option>
            <option value="message">Message</option>
            <option value="conversation">Conversation</option>
            <option value="meeting">Meeting</option>
            <option value="organization">Organization</option>
            <option value="role">Role</option>
            <option value="department">Department</option>
          </select>

          <input
            type="date"
            className="input"
            value={filters.startDate}
            onChange={(e) => {
              setFilters({ ...filters, startDate: e.target.value });
              setPage(1);
            }}
          />

          <input
            type="date"
            className="input"
            value={filters.endDate}
            onChange={(e) => {
              setFilters({ ...filters, endDate: e.target.value });
              setPage(1);
            }}
          />

          <button
            className="btn btn-ghost"
            onClick={() => {
              setFilters({ action: '', resourceType: '', startDate: '', endDate: '' });
              setPage(1);
            }}
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Audit table */}
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-neon-surface-hover">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-neon-text-secondary">Timestamp</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-neon-text-secondary">Actor</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-neon-text-secondary">Action</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-neon-text-secondary">Resource</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-neon-text-secondary">IP Address</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-neon-text-secondary">Hash</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neon-border">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                </td>
              </tr>
            ) : data?.data?.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neon-text-muted">
                  No audit entries found
                </td>
              </tr>
            ) : (
              data?.data?.map((entry: any) => (
                <tr key={entry.id}>
                  <td className="px-4 py-3 text-sm">
                    {new Date(entry.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="avatar avatar-xs">
                        <span>{entry.actor?.name?.charAt(0).toUpperCase() || 'S'}</span>
                      </div>
                      <span className="text-sm">{entry.actor?.name || 'System'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="badge">{entry.action}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-neon-text-secondary">
                    {entry.resourceType}
                    {entry.resourceId && (
                      <span className="text-neon-text-muted"> #{entry.resourceId.slice(0, 8)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-neon-text-muted font-mono">
                    {entry.ipAddress || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <code className="text-xs text-neon-text-muted">
                      {entry.hash?.slice(0, 12)}...
                    </code>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data?.meta?.pagination && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-neon-text-muted">
            Showing {((page - 1) * 25) + 1} to {Math.min(page * 25, data.meta.pagination.total)} of {data.meta.pagination.total} entries
          </p>
          <div className="flex items-center gap-2">
            <button
              className="btn btn-sm btn-ghost"
              disabled={!data.meta.pagination.hasPrev}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm">Page {page} of {data.meta.pagination.totalPages}</span>
            <button
              className="btn btn-sm btn-ghost"
              disabled={!data.meta.pagination.hasNext}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Main admin page
export default function AdminPage() {
  const { hasPermission } = useAuthStore();

  // Check if user has any admin access
  const hasAdminAccess =
    hasPermission('org:view_settings') ||
    hasPermission('org:manage_settings') ||
    hasPermission('users:manage') ||
    hasPermission('audit:view');

  if (!hasAdminAccess) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Shield className="w-12 h-12 mx-auto mb-4 text-neon-text-muted" />
          <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
          <p className="text-neon-text-muted">
            You don't have permission to access the admin area.
          </p>
        </div>
      </div>
    );
  }

  // Define nav items with permissions
  const navItems = [
    {
      to: '/admin/dashboard',
      icon: Activity,
      label: 'Dashboard',
      permission: 'org:view_settings',
    },
    {
      to: '/admin/users',
      icon: Users,
      label: 'Users',
      permission: 'users:manage',
    },
    {
      to: '/admin/roles',
      icon: Shield,
      label: 'Roles & Permissions',
      permission: 'org:manage_roles',
    },
    {
      to: '/admin/sso',
      icon: Key,
      label: 'SSO Configuration',
      permission: 'org:manage_settings',
    },
    {
      to: '/admin/federation',
      icon: Globe,
      label: 'Federation',
      permission: 'org:manage_settings',
    },
    {
      to: '/admin/import',
      icon: Upload,
      label: 'Bulk Import',
      permission: 'users:manage',
    },
    {
      to: '/admin/audit',
      icon: FileText,
      label: 'Audit Log',
      permission: 'audit:view',
    },
  ].filter((item) => hasPermission(item.permission));

  return (
    <div className="h-full flex">
      {/* Admin sidebar */}
      <div className="w-64 flex-shrink-0 border-r border-neon-border overflow-y-auto">
        <div className="p-4">
          <h1 className="text-xl font-semibold mb-6">Admin</h1>
          <nav className="space-y-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `sidebar-item ${isActive ? 'sidebar-item-active' : ''}`
                }
              >
                <item.icon className="w-5 h-5" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      </div>

      {/* Admin content */}
      <div className="flex-1 overflow-y-auto p-8">
        <Routes>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="users" element={<UserManagement />} />
          <Route path="roles" element={<RolesPermissions />} />
          <Route path="sso" element={<SSOConfiguration />} />
          <Route path="federation" element={<FederationBridges />} />
          <Route path="import" element={<BulkImport />} />
          <Route path="audit" element={<AuditLogViewer />} />
        </Routes>
      </div>
    </div>
  );
}
