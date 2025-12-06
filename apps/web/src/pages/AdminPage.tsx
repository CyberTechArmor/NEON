import { useState } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
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
  AlertTriangle,
  Loader2,
  Download,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useAuthStore } from '../stores/auth';
import { adminApi, getErrorMessage } from '../lib/api';

// Dashboard overview
function AdminDashboard() {
  const { data: stats, isLoading: isLoadingStats } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: async () => {
      const response = await adminApi.getStats();
      return response.data.data;
    },
  });

  const { data: health, isLoading: isLoadingHealth } = useQuery({
    queryKey: ['admin', 'health'],
    queryFn: async () => {
      const response = await adminApi.getHealth();
      return response.data.data;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const statCards = [
    {
      label: 'Active Users',
      value: stats?.users || 0,
      icon: Users,
      color: 'text-neon-info',
    },
    {
      label: 'Messages',
      value: stats?.messages || 0,
      icon: FileText,
      color: 'text-neon-success',
    },
    {
      label: 'Meetings',
      value: stats?.meetings || 0,
      icon: Activity,
      color: 'text-neon-warning',
    },
    {
      label: 'Active Today',
      value: stats?.activeToday || 0,
      icon: Activity,
      color: 'text-white',
    },
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
        <h3 className="text-lg font-medium mb-4">System Health</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                <span
                  className={
                    health?.database?.healthy
                      ? 'text-neon-success'
                      : 'text-neon-error'
                  }
                >
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
                <span
                  className={
                    health?.redis?.healthy
                      ? 'text-neon-success'
                      : 'text-neon-error'
                  }
                >
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
            {isLoadingStats ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <div>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-neon-text-muted">Used</span>
                  <span>
                    {formatBytes(stats?.storage?.storageUsed || 0)} /{' '}
                    {formatBytes(stats?.storage?.storageLimit || 0)}
                  </span>
                </div>
                <div className="h-2 bg-neon-surface-hover rounded-full overflow-hidden">
                  <div
                    className="h-full bg-neon-info"
                    style={{
                      width: `${
                        ((stats?.storage?.storageUsed || 0) /
                          (stats?.storage?.storageLimit || 1)) *
                        100
                      }%`,
                    }}
                  />
                </div>
              </div>
            )}
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
                <th className="px-4 py-3 text-left text-sm font-medium text-neon-text-secondary">
                  Job
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-neon-text-secondary">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-neon-text-secondary">
                  Last Run
                </th>
                <th className="px-4 py-3 text-right text-sm font-medium text-neon-text-secondary">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neon-border">
              {health?.jobs ? (
                Object.entries(health.jobs).map(([name, job]: [string, any]) => (
                  <tr key={name}>
                    <td className="px-4 py-3 font-medium">{name}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`badge ${
                          job.running ? 'badge-info' : 'badge-success'
                        }`}
                      >
                        {job.running ? 'Running' : 'Idle'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-neon-text-secondary">
                      {job.lastRun
                        ? formatDistanceToNow(new Date(job.lastRun), {
                            addSuffix: true,
                          })
                        : 'Never'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button className="btn btn-sm btn-ghost">
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-neon-text-muted">
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

// Audit log viewer
function AuditLogViewer() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    action: '',
    resourceType: '',
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'audit', page, filters],
    queryFn: async () => {
      const response = await adminApi.getAuditLog({
        page,
        limit: 20,
        ...filters,
      });
      return response.data;
    },
  });

  const handleExport = async () => {
    try {
      const response = await adminApi.exportAuditLog(
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        new Date().toISOString(),
        'csv'
      );
      const url = window.URL.createObjectURL(response.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'audit-log.csv';
      a.click();
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Audit Log</h2>
        <div className="flex items-center gap-2">
          <button className="btn btn-secondary" onClick={handleExport}>
            <Download className="w-4 h-4" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <select
          className="input w-auto"
          value={filters.action}
          onChange={(e) => setFilters({ ...filters, action: e.target.value })}
        >
          <option value="">All actions</option>
          <option value="user.login">Login</option>
          <option value="user.logout">Logout</option>
          <option value="message.create">Message created</option>
          <option value="message.delete">Message deleted</option>
          <option value="meeting.create">Meeting created</option>
          <option value="settings.update">Settings updated</option>
        </select>

        <select
          className="input w-auto"
          value={filters.resourceType}
          onChange={(e) =>
            setFilters({ ...filters, resourceType: e.target.value })
          }
        >
          <option value="">All resources</option>
          <option value="user">User</option>
          <option value="message">Message</option>
          <option value="conversation">Conversation</option>
          <option value="meeting">Meeting</option>
          <option value="organization">Organization</option>
        </select>
      </div>

      {/* Audit table */}
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-neon-surface-hover">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-neon-text-secondary">
                Timestamp
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-neon-text-secondary">
                Actor
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-neon-text-secondary">
                Action
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-neon-text-secondary">
                Resource
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-neon-text-secondary">
                IP Address
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neon-border">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                </td>
              </tr>
            ) : data?.data?.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-neon-text-muted"
                >
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
                        <span>
                          {entry.actor?.name?.charAt(0).toUpperCase() || 'S'}
                        </span>
                      </div>
                      <span className="text-sm">
                        {entry.actor?.name || 'System'}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="badge">{entry.action}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-neon-text-secondary">
                    {entry.resourceType}
                    {entry.resourceId && `: ${entry.resourceId.slice(0, 8)}...`}
                  </td>
                  <td className="px-4 py-3 text-sm text-neon-text-muted font-mono">
                    {entry.ipAddress || '-'}
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
            Page {page} of {data.meta.pagination.totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              className="btn btn-sm btn-ghost"
              disabled={!data.meta.pagination.hasPrev}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
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

// Helper function to format bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Main admin page
export default function AdminPage() {
  const { hasPermission } = useAuthStore();

  // Check if user has admin access
  if (!hasPermission('org:view_settings') && !hasPermission('audit:view')) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Shield className="w-12 h-12 mx-auto mb-4 text-neon-text-muted" />
          <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
          <p className="text-neon-text-muted">
            You don't have permission to access this area.
          </p>
        </div>
      </div>
    );
  }

  const navItems = [
    {
      to: '/admin/dashboard',
      icon: Activity,
      label: 'Dashboard',
      permission: 'org:view_settings',
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
      <div className="w-64 flex-shrink-0 border-r border-neon-border p-4">
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

      {/* Admin content */}
      <div className="flex-1 overflow-y-auto p-8">
        <Routes>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="audit" element={<AuditLogViewer />} />
        </Routes>
      </div>
    </div>
  );
}
