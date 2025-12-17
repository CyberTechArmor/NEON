import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import {
  Search,
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  Key,
  ShieldOff,
  Download,
  Upload,
  Loader2,
  ChevronLeft,
  ChevronRight,
  X,
  Check,
  Eye,
  EyeOff,
  Filter,
  UserPlus,
  Mail,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { adminApi, getErrorMessage } from '../../lib/api';

// User type - matches API response from /admin/users
interface User {
  id: string;
  email: string;
  displayName: string;
  username?: string;
  avatarUrl?: string;
  status: string;
  presenceStatus?: string;
  mfaEnabled?: boolean;
  role?: { id: string; name: string };
  department?: { id: string; name: string };
  lastActiveAt?: string;
  createdAt: string;
}

// Helper to get display name safely
function getDisplayName(user: User): string {
  return user.displayName || user.username || user.email || 'Unknown';
}

// Helper to check if user is active
function isUserActive(user: User): boolean {
  return user.status === 'ACTIVE';
}

// User form schema
const userSchema = z.object({
  email: z.string().email('Invalid email address'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
  roleId: z.string().min(1, 'Role is required'),
  departmentId: z.string().optional(),
});

type UserFormData = z.infer<typeof userSchema>;

// User form modal
function UserFormModal({
  user,
  roles,
  departments,
  onClose,
  onSuccess,
}: {
  user?: User;
  roles: any[];
  departments: any[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const isEditing = !!user;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UserFormData>({
    resolver: zodResolver(
      isEditing
        ? userSchema.omit({ password: true })
        : userSchema.extend({ password: z.string().min(8) })
    ),
    defaultValues: {
      email: user?.email || '',
      name: user?.displayName || '',
      roleId: user?.role?.id || '',
      departmentId: user?.department?.id || '',
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: UserFormData) =>
      adminApi.users.create(data as any),
    onSuccess: () => {
      toast.success('User created successfully');
      onSuccess();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: (data: UserFormData) =>
      adminApi.users.update(user!.id, data),
    onSuccess: () => {
      toast.success('User updated successfully');
      onSuccess();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const onSubmit = (data: UserFormData) => {
    if (isEditing) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-neon-border">
          <h2 className="text-lg font-semibold">
            {isEditing ? 'Edit User' : 'Create User'}
          </h2>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium mb-2">Name</label>
            <input
              type="text"
              className={`input ${errors.name ? 'input-error' : ''}`}
              placeholder="John Doe"
              {...register('name')}
            />
            {errors.name && (
              <p className="mt-1 text-sm text-neon-error">{errors.name.message}</p>
            )}
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium mb-2">Email</label>
            <input
              type="email"
              className={`input ${errors.email ? 'input-error' : ''}`}
              placeholder="john@company.com"
              {...register('email')}
            />
            {errors.email && (
              <p className="mt-1 text-sm text-neon-error">{errors.email.message}</p>
            )}
          </div>

          {/* Password (only for new users) */}
          {!isEditing && (
            <div>
              <label className="block text-sm font-medium mb-2">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className={`input pr-10 ${errors.password ? 'input-error' : ''}`}
                  placeholder="••••••••"
                  {...register('password')}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neon-text-muted"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 text-sm text-neon-error">{errors.password.message}</p>
              )}
            </div>
          )}

          {/* Department */}
          <div>
            <label className="block text-sm font-medium mb-2">Department</label>
            <select className="input" {...register('departmentId')}>
              <option value="">No department</option>
              {departments.map((dept: any) => (
                <option key={dept.id} value={dept.id}>
                  {dept.name}
                </option>
              ))}
            </select>
          </div>

          {/* Role */}
          <div>
            <label className="block text-sm font-medium mb-2">Role</label>
            <select className={`input ${errors.roleId ? 'input-error' : ''}`} {...register('roleId')}>
              <option value="">Select a role</option>
              {roles.map((role: any) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
            {errors.roleId && (
              <p className="mt-1 text-sm text-neon-error">{errors.roleId.message}</p>
            )}
          </div>

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
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>{isEditing ? 'Update' : 'Create'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// User actions dropdown
function UserActions({
  user,
  onEdit,
  onDelete,
  onResetPassword,
  onDisableMfa,
}: {
  user: User;
  onEdit: () => void;
  onDelete: () => void;
  onResetPassword: () => void;
  onDisableMfa: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        className="btn btn-icon btn-ghost"
        onClick={() => setOpen(!open)}
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 dropdown-menu">
            <button className="dropdown-item w-full" onClick={() => { onEdit(); setOpen(false); }}>
              <Pencil className="w-4 h-4" />
              <span>Edit</span>
            </button>
            <button className="dropdown-item w-full" onClick={() => { onResetPassword(); setOpen(false); }}>
              <Key className="w-4 h-4" />
              <span>Reset Password</span>
            </button>
            {user.mfaEnabled && (
              <button className="dropdown-item w-full" onClick={() => { onDisableMfa(); setOpen(false); }}>
                <ShieldOff className="w-4 h-4" />
                <span>Disable MFA</span>
              </button>
            )}
            <div className="dropdown-separator" />
            <button className="dropdown-item dropdown-item-danger w-full" onClick={() => { onDelete(); setOpen(false); }}>
              <Trash2 className="w-4 h-4" />
              <span>Delete</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// Delete confirmation modal
function DeleteConfirmModal({
  user,
  onClose,
  onConfirm,
  isDeleting,
}: {
  user: User;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting: boolean;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-neon-error/20 flex items-center justify-center">
            <Trash2 className="w-6 h-6 text-neon-error" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Delete User</h3>
          <p className="text-neon-text-secondary mb-6">
            Are you sure you want to delete <strong>{getDisplayName(user)}</strong>? This action cannot be undone.
          </p>
          <div className="flex gap-3">
            <button className="btn btn-ghost flex-1" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn btn-danger flex-1"
              onClick={onConfirm}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Delete'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Main UserManagement component
export default function UserManagement() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ roleId: '', departmentId: '', status: '' });
  const [showFilters, setShowFilters] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | undefined>();
  const [deletingUser, setDeletingUser] = useState<User | undefined>();

  // Fetch users
  const { data: usersData, isLoading } = useQuery<{ data: User[]; meta?: { pagination?: { total: number; totalPages: number; hasPrev: boolean; hasNext: boolean } } }>({
    queryKey: ['admin', 'users', page, search, filters],
    queryFn: async () => {
      const response = await adminApi.users.list({
        page,
        limit: 20,
        search: search || undefined,
        ...filters,
      });
      return response.data as { data: User[]; meta?: { pagination?: { total: number; totalPages: number; hasPrev: boolean; hasNext: boolean } } };
    },
  });

  // Fetch roles and departments for forms
  const { data: rolesData } = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: async () => {
      const response = await adminApi.roles.list();
      return response.data.data;
    },
  });

  const { data: departmentsData } = useQuery({
    queryKey: ['admin', 'departments'],
    queryFn: async () => {
      const response = await adminApi.departments.list();
      return response.data.data;
    },
  });

  // Mutations
  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.users.delete(id),
    onSuccess: () => {
      toast.success('User deleted');
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setDeletingUser(undefined);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: (id: string) => adminApi.users.resetPassword(id),
    onSuccess: (response) => {
      const tempPassword = (response.data as any).data?.temporaryPassword;
      toast.success(
        tempPassword
          ? `Temporary password: ${tempPassword}`
          : 'Password reset email sent'
      );
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const disableMfaMutation = useMutation({
    mutationFn: (id: string) => adminApi.users.disableMfa(id),
    onSuccess: () => {
      toast.success('MFA disabled');
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const handleExport = async () => {
    try {
      const response = await adminApi.users.exportUsers('csv');
      const url = window.URL.createObjectURL(response.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'users.csv';
      a.click();
      toast.success('Export started');
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">User Management</h2>
        <div className="flex items-center gap-2">
          <button className="btn btn-secondary" onClick={handleExport}>
            <Download className="w-4 h-4" />
            <span>Export</span>
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              setEditingUser(undefined);
              setShowUserModal(true);
            }}
          >
            <UserPlus className="w-4 h-4" />
            <span>Add User</span>
          </button>
        </div>
      </div>

      {/* Search and filters */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neon-text-muted" />
          <input
            type="text"
            placeholder="Search users..."
            className="input pl-10"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <button
          className={`btn ${showFilters ? 'btn-secondary' : 'btn-ghost'}`}
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter className="w-4 h-4" />
          <span>Filters</span>
        </button>
      </div>

      {/* Filter row */}
      {showFilters && (
        <div className="flex items-center gap-4 mb-6 p-4 bg-neon-surface rounded-lg">
          <select
            className="input w-auto"
            value={filters.roleId}
            onChange={(e) => {
              setFilters({ ...filters, roleId: e.target.value });
              setPage(1);
            }}
          >
            <option value="">All roles</option>
            {rolesData?.map((role: any) => (
              <option key={role.id} value={role.id}>{role.name}</option>
            ))}
          </select>

          <select
            className="input w-auto"
            value={filters.departmentId}
            onChange={(e) => {
              setFilters({ ...filters, departmentId: e.target.value });
              setPage(1);
            }}
          >
            <option value="">All departments</option>
            {departmentsData?.map((dept: any) => (
              <option key={dept.id} value={dept.id}>{dept.name}</option>
            ))}
          </select>

          <select
            className="input w-auto"
            value={filters.status}
            onChange={(e) => {
              setFilters({ ...filters, status: e.target.value });
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>

          <button
            className="btn btn-ghost"
            onClick={() => {
              setFilters({ roleId: '', departmentId: '', status: '' });
              setPage(1);
            }}
          >
            Clear
          </button>
        </div>
      )}

      {/* Users table */}
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-neon-surface-hover">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-neon-text-secondary">User</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-neon-text-secondary">Role</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-neon-text-secondary">Department</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-neon-text-secondary">Status</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-neon-text-secondary">Last Login</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-neon-text-secondary">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neon-border">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                </td>
              </tr>
            ) : usersData?.data?.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neon-text-muted">
                  No users found
                </td>
              </tr>
            ) : (
              usersData?.data?.map((user: User) => (
                <tr key={user.id}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="avatar avatar-sm">
                        {user.avatarUrl ? (
                          <img src={user.avatarUrl} alt={getDisplayName(user)} className="w-full h-full object-cover" />
                        ) : (
                          <span>{getDisplayName(user).charAt(0).toUpperCase()}</span>
                        )}
                      </div>
                      <div>
                        <p className="font-medium">{getDisplayName(user)}</p>
                        <p className="text-sm text-neon-text-muted">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="badge">{user.role?.name || '-'}</span>
                  </td>
                  <td className="px-4 py-3 text-neon-text-secondary">
                    {user.department?.name || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${isUserActive(user) ? 'badge-success' : 'badge-error'}`}>
                      {isUserActive(user) ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-neon-text-muted">
                    {user.lastActiveAt
                      ? formatDistanceToNow(new Date(user.lastActiveAt), { addSuffix: true })
                      : 'Never'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <UserActions
                      user={user}
                      onEdit={() => {
                        setEditingUser(user);
                        setShowUserModal(true);
                      }}
                      onDelete={() => setDeletingUser(user)}
                      onResetPassword={() => resetPasswordMutation.mutate(user.id)}
                      onDisableMfa={() => disableMfaMutation.mutate(user.id)}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {usersData?.meta?.pagination && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-neon-text-muted">
            Showing {((page - 1) * 20) + 1} to {Math.min(page * 20, usersData.meta.pagination.total)} of {usersData.meta.pagination.total} users
          </p>
          <div className="flex items-center gap-2">
            <button
              className="btn btn-sm btn-ghost"
              disabled={!usersData.meta.pagination.hasPrev}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm">
              Page {page} of {usersData.meta.pagination.totalPages}
            </span>
            <button
              className="btn btn-sm btn-ghost"
              disabled={!usersData.meta.pagination.hasNext}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* User form modal */}
      {showUserModal && (
        <UserFormModal
          user={editingUser}
          roles={rolesData || []}
          departments={departmentsData || []}
          onClose={() => {
            setShowUserModal(false);
            setEditingUser(undefined);
          }}
          onSuccess={() => {
            setShowUserModal(false);
            setEditingUser(undefined);
            queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
          }}
        />
      )}

      {/* Delete confirmation */}
      {deletingUser && (
        <DeleteConfirmModal
          user={deletingUser}
          onClose={() => setDeletingUser(undefined)}
          onConfirm={() => deleteMutation.mutate(deletingUser.id)}
          isDeleting={deleteMutation.isPending}
        />
      )}
    </div>
  );
}
