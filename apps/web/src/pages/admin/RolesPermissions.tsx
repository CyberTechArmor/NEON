import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import {
  Plus,
  Pencil,
  Trash2,
  Shield,
  Users,
  Building2,
  ChevronRight,
  ChevronDown,
  Loader2,
  X,
  Check,
  Search,
} from 'lucide-react';
import { adminApi, getErrorMessage } from '../../lib/api';

// Types
interface Role {
  id: string;
  name: string;
  description?: string;
  department?: { id: string; name: string };
  _count?: { users: number };
  createdAt: string;
}

interface Department {
  id: string;
  name: string;
  description?: string;
  parentId?: string;
  parent?: { id: string; name: string };
  children?: Department[];
  _count?: { users: number; roles: number };
}

interface Permission {
  permission: string;
  granted: boolean;
}

// All available permissions grouped by category
const PERMISSION_CATEGORIES = {
  'Messages': [
    { key: 'messages:read', label: 'View messages', description: 'Can view messages in conversations' },
    { key: 'messages:create', label: 'Send messages', description: 'Can send new messages' },
    { key: 'messages:edit', label: 'Edit messages', description: 'Can edit own messages' },
    { key: 'messages:delete', label: 'Delete messages', description: 'Can delete own messages' },
    { key: 'messages:delete_any', label: 'Delete any message', description: 'Can delete any message (moderator)' },
  ],
  'Conversations': [
    { key: 'conversations:create', label: 'Create conversations', description: 'Can create new conversations' },
    { key: 'conversations:manage', label: 'Manage conversations', description: 'Can edit conversation settings' },
    { key: 'conversations:delete', label: 'Delete conversations', description: 'Can delete conversations' },
  ],
  'Meetings': [
    { key: 'meetings:create', label: 'Create meetings', description: 'Can schedule new meetings' },
    { key: 'meetings:join', label: 'Join meetings', description: 'Can join meetings' },
    { key: 'meetings:record', label: 'Record meetings', description: 'Can record meetings' },
    { key: 'meetings:manage', label: 'Manage meetings', description: 'Can manage all meetings' },
  ],
  'Calls': [
    { key: 'calls:initiate', label: 'Initiate calls', description: 'Can start calls' },
    { key: 'calls:join', label: 'Join calls', description: 'Can join calls' },
  ],
  'Files': [
    { key: 'files:upload', label: 'Upload files', description: 'Can upload files' },
    { key: 'files:download', label: 'Download files', description: 'Can download files' },
    { key: 'files:delete', label: 'Delete files', description: 'Can delete own files' },
    { key: 'files:delete_any', label: 'Delete any file', description: 'Can delete any file' },
  ],
  'Users': [
    { key: 'users:view', label: 'View users', description: 'Can view user directory' },
    { key: 'users:manage', label: 'Manage users', description: 'Can create/edit/delete users' },
  ],
  'Organization': [
    { key: 'org:view_settings', label: 'View org settings', description: 'Can view organization settings' },
    { key: 'org:manage_settings', label: 'Manage org settings', description: 'Can modify organization settings' },
    { key: 'org:manage_roles', label: 'Manage roles', description: 'Can create/edit roles' },
    { key: 'org:manage_departments', label: 'Manage departments', description: 'Can create/edit departments' },
  ],
  'Audit': [
    { key: 'audit:view', label: 'View audit log', description: 'Can view audit logs' },
    { key: 'audit:export', label: 'Export audit log', description: 'Can export audit logs' },
  ],
};

// Role form schema
const roleSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().optional(),
  departmentId: z.string().optional(),
});

type RoleFormData = z.infer<typeof roleSchema>;

// Department form schema
const departmentSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().optional(),
  parentId: z.string().optional(),
});

type DepartmentFormData = z.infer<typeof departmentSchema>;

// Role Form Modal
function RoleFormModal({
  role,
  departments,
  onClose,
  onSuccess,
}: {
  role?: Role;
  departments: Department[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEditing = !!role;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RoleFormData>({
    resolver: zodResolver(roleSchema),
    defaultValues: {
      name: role?.name || '',
      description: role?.description || '',
      departmentId: role?.department?.id || '',
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: RoleFormData) => adminApi.roles.create(data as any),
    onSuccess: () => {
      toast.success('Role created');
      onSuccess();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: (data: RoleFormData) => adminApi.roles.update(role!.id, data),
    onSuccess: () => {
      toast.success('Role updated');
      onSuccess();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const onSubmit = (data: RoleFormData) => {
    if (isEditing) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-neon-border">
          <h2 className="text-lg font-semibold">{isEditing ? 'Edit Role' : 'Create Role'}</h2>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Name</label>
            <input
              type="text"
              className={`input ${errors.name ? 'input-error' : ''}`}
              placeholder="e.g. Manager"
              {...register('name')}
            />
            {errors.name && <p className="mt-1 text-sm text-neon-error">{errors.name.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Description</label>
            <textarea
              className="input resize-none"
              rows={3}
              placeholder="Role description..."
              {...register('description')}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Department (optional)</label>
            <select className="input" {...register('departmentId')}>
              <option value="">Organization-wide role</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>{dept.name}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-neon-text-muted">
              If set, this role will only be available within the selected department
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
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

// Permission Editor
function PermissionEditor({
  entityType,
  entityId,
  entityName,
  onClose,
}: {
  entityType: 'role' | 'department';
  entityId: string;
  entityName: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<string[]>(Object.keys(PERMISSION_CATEGORIES));

  // Get all permission keys for select all functionality
  const allPermissionKeys = Object.values(PERMISSION_CATEGORIES).flat().map(p => p.key);

  // Fetch current permissions
  const { data: permissions, isLoading } = useQuery({
    queryKey: ['admin', entityType, entityId, 'permissions'],
    queryFn: async () => {
      const response = entityType === 'role'
        ? await adminApi.roles.getPermissions(entityId)
        : await adminApi.departments.getPermissions(entityId);
      return response.data.data as Permission[];
    },
  });

  // Save permissions mutation
  const saveMutation = useMutation({
    mutationFn: (perms: Permission[]) =>
      entityType === 'role'
        ? adminApi.roles.setPermissions(entityId, perms)
        : adminApi.departments.setPermissions(entityId, perms),
    onSuccess: () => {
      toast.success('Permissions saved');
      queryClient.invalidateQueries({ queryKey: ['admin', entityType, entityId, 'permissions'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const [localPermissions, setLocalPermissions] = useState<Record<string, boolean>>({});

  // Initialize local permissions from fetched data
  useState(() => {
    if (permissions) {
      const perms: Record<string, boolean> = {};
      permissions.forEach((p) => {
        perms[p.permission] = p.granted;
      });
      setLocalPermissions(perms);
    }
  });

  const togglePermission = (key: string) => {
    setLocalPermissions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  };

  // Select all permissions
  const selectAll = () => {
    const newPerms: Record<string, boolean> = {};
    allPermissionKeys.forEach((key) => {
      newPerms[key] = true;
    });
    setLocalPermissions(newPerms);
  };

  // Deselect all permissions
  const deselectAll = () => {
    const newPerms: Record<string, boolean> = {};
    allPermissionKeys.forEach((key) => {
      newPerms[key] = false;
    });
    setLocalPermissions(newPerms);
  };

  // Select all permissions in a category
  const selectCategory = (category: string) => {
    const categoryPerms = PERMISSION_CATEGORIES[category as keyof typeof PERMISSION_CATEGORIES] || [];
    setLocalPermissions((prev) => {
      const newPerms = { ...prev };
      categoryPerms.forEach((p) => {
        newPerms[p.key] = true;
      });
      return newPerms;
    });
  };

  // Deselect all permissions in a category
  const deselectCategory = (category: string) => {
    const categoryPerms = PERMISSION_CATEGORIES[category as keyof typeof PERMISSION_CATEGORIES] || [];
    setLocalPermissions((prev) => {
      const newPerms = { ...prev };
      categoryPerms.forEach((p) => {
        newPerms[p.key] = false;
      });
      return newPerms;
    });
  };

  // Check if all permissions in a category are selected
  const isCategoryFullySelected = (category: string): boolean => {
    const categoryPerms = PERMISSION_CATEGORIES[category as keyof typeof PERMISSION_CATEGORIES] || [];
    return categoryPerms.every((p) => localPermissions[p.key]);
  };

  // Check if some permissions in a category are selected
  const isCategoryPartiallySelected = (category: string): boolean => {
    const categoryPerms = PERMISSION_CATEGORIES[category as keyof typeof PERMISSION_CATEGORIES] || [];
    const selectedCount = categoryPerms.filter((p) => localPermissions[p.key]).length;
    return selectedCount > 0 && selectedCount < categoryPerms.length;
  };

  const handleSave = () => {
    const perms = Object.entries(localPermissions).map(([permission, granted]) => ({
      permission,
      granted,
    }));
    saveMutation.mutate(perms);
  };

  // Filter permissions by search
  const filteredCategories = Object.entries(PERMISSION_CATEGORIES).filter(([category, perms]) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      category.toLowerCase().includes(q) ||
      perms.some((p) => p.label.toLowerCase().includes(q) || p.key.toLowerCase().includes(q))
    );
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-2xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-neon-border">
          <div>
            <h2 className="text-lg font-semibold">Edit Permissions</h2>
            <p className="text-sm text-neon-text-muted">{entityName}</p>
          </div>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 border-b border-neon-border space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neon-text-muted" />
            <input
              type="text"
              className="input pl-10"
              placeholder="Search permissions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={selectAll}
            >
              <Check className="w-3 h-3" />
              Select All
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={deselectAll}
            >
              <X className="w-3 h-3" />
              Deselect All
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : (
            <div className="space-y-4">
              {filteredCategories.map(([category, perms]) => (
                <div key={category} className="card">
                  <div className="flex items-center justify-between p-3 hover:bg-neon-surface-hover">
                    <button
                      className="flex items-center gap-2 text-left flex-1"
                      onClick={() => toggleCategory(category)}
                    >
                      {expandedCategories.includes(category) ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                      <span className="font-medium">{category}</span>
                      <span className="text-xs text-neon-text-muted">
                        ({perms.filter(p => localPermissions[p.key]).length}/{perms.length})
                      </span>
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="btn btn-xs btn-ghost text-neon-accent"
                        onClick={(e) => {
                          e.stopPropagation();
                          selectCategory(category);
                        }}
                        title="Select all in category"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        className="btn btn-xs btn-ghost text-neon-text-muted"
                        onClick={(e) => {
                          e.stopPropagation();
                          deselectCategory(category);
                        }}
                        title="Deselect all in category"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {expandedCategories.includes(category) && (
                    <div className="border-t border-neon-border">
                      {perms.map((perm) => (
                        <label
                          key={perm.key}
                          className="flex items-center justify-between p-3 hover:bg-neon-surface-hover cursor-pointer"
                        >
                          <div>
                            <p className="font-medium">{perm.label}</p>
                            <p className="text-sm text-neon-text-muted">{perm.description}</p>
                          </div>
                          <input
                            type="checkbox"
                            checked={localPermissions[perm.key] || false}
                            onChange={() => togglePermission(perm.key)}
                            className="w-5 h-5 rounded border-neon-border bg-neon-surface"
                          />
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 p-4 border-t border-neon-border">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Permissions'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Department Form Modal
function DepartmentFormModal({
  department,
  departments,
  onClose,
  onSuccess,
}: {
  department?: Department;
  departments: Department[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEditing = !!department;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DepartmentFormData>({
    resolver: zodResolver(departmentSchema),
    defaultValues: {
      name: department?.name || '',
      description: department?.description || '',
      parentId: department?.parentId || '',
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: DepartmentFormData) => adminApi.departments.create(data as any),
    onSuccess: () => {
      toast.success('Department created');
      onSuccess();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: (data: DepartmentFormData) => adminApi.departments.update(department!.id, data),
    onSuccess: () => {
      toast.success('Department updated');
      onSuccess();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const onSubmit = (data: DepartmentFormData) => {
    if (isEditing) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  // Filter out current department and its children from parent options
  const availableParents = departments.filter((d) => d.id !== department?.id);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-neon-border">
          <h2 className="text-lg font-semibold">{isEditing ? 'Edit Department' : 'Create Department'}</h2>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Name</label>
            <input
              type="text"
              className={`input ${errors.name ? 'input-error' : ''}`}
              placeholder="e.g. Engineering"
              {...register('name')}
            />
            {errors.name && <p className="mt-1 text-sm text-neon-error">{errors.name.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Description</label>
            <textarea
              className="input resize-none"
              rows={3}
              placeholder="Department description..."
              {...register('description')}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Parent Department (optional)</label>
            <select className="input" {...register('parentId')}>
              <option value="">No parent (top-level)</option>
              {availableParents.map((dept) => (
                <option key={dept.id} value={dept.id}>{dept.name}</option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
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

// Main component
export default function RolesPermissions() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'roles' | 'departments'>('roles');
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showDepartmentModal, setShowDepartmentModal] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | undefined>();
  const [editingDepartment, setEditingDepartment] = useState<Department | undefined>();
  const [permissionEditor, setPermissionEditor] = useState<{
    type: 'role' | 'department';
    id: string;
    name: string;
  } | null>(null);

  // Fetch roles
  const { data: rolesData, isLoading: isLoadingRoles } = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: async () => {
      const response = await adminApi.roles.list();
      return response.data.data as Role[];
    },
  });

  // Fetch departments
  const { data: departmentsData, isLoading: isLoadingDepartments } = useQuery({
    queryKey: ['admin', 'departments'],
    queryFn: async () => {
      const response = await adminApi.departments.list();
      return response.data.data as Department[];
    },
  });

  // Delete mutations
  const deleteRoleMutation = useMutation({
    mutationFn: (id: string) => adminApi.roles.delete(id),
    onSuccess: () => {
      toast.success('Role deleted');
      queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const deleteDepartmentMutation = useMutation({
    mutationFn: (id: string) => adminApi.departments.delete(id),
    onSuccess: () => {
      toast.success('Department deleted');
      queryClient.invalidateQueries({ queryKey: ['admin', 'departments'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Roles & Permissions</h2>

      {/* Tabs */}
      <div className="flex items-center gap-4 mb-6 border-b border-neon-border">
        <button
          className={`pb-3 px-1 border-b-2 font-medium transition-colors ${
            activeTab === 'roles'
              ? 'border-white text-white'
              : 'border-transparent text-neon-text-muted hover:text-white'
          }`}
          onClick={() => setActiveTab('roles')}
        >
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            <span>Roles</span>
          </div>
        </button>
        <button
          className={`pb-3 px-1 border-b-2 font-medium transition-colors ${
            activeTab === 'departments'
              ? 'border-white text-white'
              : 'border-transparent text-neon-text-muted hover:text-white'
          }`}
          onClick={() => setActiveTab('departments')}
        >
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            <span>Departments</span>
          </div>
        </button>
      </div>

      {/* Roles tab */}
      {activeTab === 'roles' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-neon-text-muted">
              Roles define permissions that can be assigned to users
            </p>
            <button
              className="btn btn-primary"
              onClick={() => {
                setEditingRole(undefined);
                setShowRoleModal(true);
              }}
            >
              <Plus className="w-4 h-4" />
              <span>Add Role</span>
            </button>
          </div>

          <div className="card overflow-hidden">
            <table className="w-full">
              <thead className="bg-neon-surface-hover">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-neon-text-secondary">Role</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-neon-text-secondary">Department</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-neon-text-secondary">Users</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-neon-text-secondary">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neon-border">
                {isLoadingRoles ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                    </td>
                  </tr>
                ) : rolesData?.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-neon-text-muted">
                      No roles found
                    </td>
                  </tr>
                ) : (
                  rolesData?.map((role) => (
                    <tr key={role.id}>
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium">{role.name}</p>
                          {role.description && (
                            <p className="text-sm text-neon-text-muted">{role.description}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-neon-text-secondary">
                        {role.department?.name || 'Organization-wide'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="badge">{role._count?.users || 0} users</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            className="btn btn-sm btn-ghost"
                            onClick={() => setPermissionEditor({ type: 'role', id: role.id, name: role.name })}
                            title="Edit permissions"
                          >
                            <Shield className="w-4 h-4" />
                          </button>
                          <button
                            className="btn btn-sm btn-ghost"
                            onClick={() => {
                              setEditingRole(role);
                              setShowRoleModal(true);
                            }}
                            title="Edit role"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            className="btn btn-sm btn-ghost text-neon-error"
                            onClick={() => {
                              if (confirm(`Delete role "${role.name}"?`)) {
                                deleteRoleMutation.mutate(role.id);
                              }
                            }}
                            title="Delete role"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Departments tab */}
      {activeTab === 'departments' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-neon-text-muted">
              Departments organize users and can have their own permission sets
            </p>
            <button
              className="btn btn-primary"
              onClick={() => {
                setEditingDepartment(undefined);
                setShowDepartmentModal(true);
              }}
            >
              <Plus className="w-4 h-4" />
              <span>Add Department</span>
            </button>
          </div>

          <div className="card overflow-hidden">
            <table className="w-full">
              <thead className="bg-neon-surface-hover">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-neon-text-secondary">Department</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-neon-text-secondary">Parent</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-neon-text-secondary">Users</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-neon-text-secondary">Roles</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-neon-text-secondary">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neon-border">
                {isLoadingDepartments ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                    </td>
                  </tr>
                ) : departmentsData?.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-neon-text-muted">
                      No departments found
                    </td>
                  </tr>
                ) : (
                  departmentsData?.map((dept) => (
                    <tr key={dept.id}>
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium">{dept.name}</p>
                          {dept.description && (
                            <p className="text-sm text-neon-text-muted">{dept.description}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-neon-text-secondary">
                        {dept.parent?.name || '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="badge">{dept._count?.users || 0}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="badge">{dept._count?.roles || 0}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            className="btn btn-sm btn-ghost"
                            onClick={() => setPermissionEditor({ type: 'department', id: dept.id, name: dept.name })}
                            title="Edit permissions"
                          >
                            <Shield className="w-4 h-4" />
                          </button>
                          <button
                            className="btn btn-sm btn-ghost"
                            onClick={() => {
                              setEditingDepartment(dept);
                              setShowDepartmentModal(true);
                            }}
                            title="Edit department"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            className="btn btn-sm btn-ghost text-neon-error"
                            onClick={() => {
                              if (confirm(`Delete department "${dept.name}"?`)) {
                                deleteDepartmentMutation.mutate(dept.id);
                              }
                            }}
                            title="Delete department"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Role form modal */}
      {showRoleModal && (
        <RoleFormModal
          role={editingRole}
          departments={departmentsData || []}
          onClose={() => {
            setShowRoleModal(false);
            setEditingRole(undefined);
          }}
          onSuccess={() => {
            setShowRoleModal(false);
            setEditingRole(undefined);
            queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });
          }}
        />
      )}

      {/* Department form modal */}
      {showDepartmentModal && (
        <DepartmentFormModal
          department={editingDepartment}
          departments={departmentsData || []}
          onClose={() => {
            setShowDepartmentModal(false);
            setEditingDepartment(undefined);
          }}
          onSuccess={() => {
            setShowDepartmentModal(false);
            setEditingDepartment(undefined);
            queryClient.invalidateQueries({ queryKey: ['admin', 'departments'] });
          }}
        />
      )}

      {/* Permission editor modal */}
      {permissionEditor && (
        <PermissionEditor
          entityType={permissionEditor.type}
          entityId={permissionEditor.id}
          entityName={permissionEditor.name}
          onClose={() => setPermissionEditor(null)}
        />
      )}
    </div>
  );
}
