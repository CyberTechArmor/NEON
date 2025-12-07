import { useState } from 'react';
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  User,
  Bell,
  Shield,
  Palette,
  Key,
  Loader2,
  Camera,
  Eye,
  EyeOff,
  Check,
} from 'lucide-react';
import { useAuthStore } from '../stores/auth';
import { usersApi, authApi, getErrorMessage } from '../lib/api';

// Profile settings
function ProfileSettings() {
  const { user, setUser } = useAuthStore();
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const profileSchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user?.name || '',
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { name: string }) => {
      const response = await usersApi.updateProfile(data);
      return response.data.data;
    },
    onSuccess: (data: any) => {
      setUser({ ...user!, name: data.name });
      toast.success('Profile updated');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  const onSubmit = (data: { name: string }) => {
    updateProfileMutation.mutate(data);
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Profile</h2>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-md">
        {/* Avatar */}
        <div>
          <label className="block text-sm font-medium mb-2">Avatar</label>
          <div className="flex items-center gap-4">
            <div className="avatar avatar-xl">
              {avatarPreview || user?.avatarUrl ? (
                <img
                  src={avatarPreview || user?.avatarUrl}
                  alt={user?.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span>{user?.name?.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <button type="button" className="btn btn-secondary">
              <Camera className="w-4 h-4" />
              <span>Change</span>
            </button>
          </div>
        </div>

        {/* Name */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium mb-2">
            Display name
          </label>
          <input
            id="name"
            type="text"
            className={`input ${errors.name ? 'input-error' : ''}`}
            {...register('name')}
          />
          {errors.name && (
            <p className="mt-1 text-sm text-neon-error">{errors.name.message}</p>
          )}
        </div>

        {/* Email (read-only) */}
        <div>
          <label className="block text-sm font-medium mb-2">Email</label>
          <input
            type="email"
            value={user?.email || ''}
            disabled
            className="input bg-neon-surface-hover cursor-not-allowed"
          />
          <p className="mt-1 text-xs text-neon-text-muted">
            Contact your administrator to change your email
          </p>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={!isDirty || updateProfileMutation.isPending}
          className="btn btn-primary"
        >
          {updateProfileMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Saving...</span>
            </>
          ) : (
            <span>Save changes</span>
          )}
        </button>
      </form>
    </div>
  );
}

// Security settings
function SecuritySettings() {
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  const passwordSchema = z
    .object({
      currentPassword: z.string().min(1, 'Current password is required'),
      newPassword: z.string().min(8, 'Password must be at least 8 characters'),
      confirmPassword: z.string(),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: "Passwords don't match",
      path: ['confirmPassword'],
    });

  type PasswordFormData = z.infer<typeof passwordSchema>;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      await authApi.changePassword(data.currentPassword, data.newPassword);
    },
    onSuccess: () => {
      toast.success('Password changed');
      reset();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  const onSubmit = (data: PasswordFormData) => {
    changePasswordMutation.mutate({ currentPassword: data.currentPassword, newPassword: data.newPassword });
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Security</h2>

      {/* Password change */}
      <div className="mb-8">
        <h3 className="text-lg font-medium mb-4">Change password</h3>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-md">
          <div>
            <label className="block text-sm font-medium mb-2">
              Current password
            </label>
            <div className="relative">
              <input
                type={showCurrentPassword ? 'text' : 'password'}
                className={`input pr-10 ${errors.currentPassword ? 'input-error' : ''}`}
                {...register('currentPassword')}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neon-text-muted"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
              >
                {showCurrentPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
            {errors.currentPassword && (
              <p className="mt-1 text-sm text-neon-error">
                {errors.currentPassword.message}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">New password</label>
            <div className="relative">
              <input
                type={showNewPassword ? 'text' : 'password'}
                className={`input pr-10 ${errors.newPassword ? 'input-error' : ''}`}
                {...register('newPassword')}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neon-text-muted"
                onClick={() => setShowNewPassword(!showNewPassword)}
              >
                {showNewPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
            {errors.newPassword && (
              <p className="mt-1 text-sm text-neon-error">
                {errors.newPassword.message}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Confirm new password
            </label>
            <input
              type="password"
              className={`input ${errors.confirmPassword ? 'input-error' : ''}`}
              {...register('confirmPassword')}
            />
            {errors.confirmPassword && (
              <p className="mt-1 text-sm text-neon-error">
                {errors.confirmPassword.message}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={changePasswordMutation.isPending}
            className="btn btn-primary"
          >
            {changePasswordMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Changing...</span>
              </>
            ) : (
              <span>Change password</span>
            )}
          </button>
        </form>
      </div>

      {/* MFA */}
      <div>
        <h3 className="text-lg font-medium mb-4">Two-factor authentication</h3>
        <div className="card p-4 max-w-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Authenticator app</p>
              <p className="text-sm text-neon-text-muted">
                Use an authenticator app for 2FA
              </p>
            </div>
            <button className="btn btn-secondary">Enable</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Notification settings
function NotificationSettings() {
  const [settings, setSettings] = useState({
    emailMessages: true,
    emailMentions: true,
    pushMessages: false,
    pushCalls: true,
    soundEnabled: true,
  });

  const toggleSetting = (key: keyof typeof settings) => {
    setSettings({ ...settings, [key]: !settings[key] });
    toast.success('Settings updated');
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Notifications</h2>

      <div className="space-y-6 max-w-md">
        {/* Email notifications */}
        <div>
          <h3 className="text-lg font-medium mb-4">Email notifications</h3>
          <div className="space-y-3">
            <label className="flex items-center justify-between p-3 card cursor-pointer">
              <div>
                <p className="font-medium">Direct messages</p>
                <p className="text-sm text-neon-text-muted">
                  Get email for new direct messages
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.emailMessages}
                onChange={() => toggleSetting('emailMessages')}
                className="w-5 h-5 rounded border-neon-border bg-neon-surface"
              />
            </label>

            <label className="flex items-center justify-between p-3 card cursor-pointer">
              <div>
                <p className="font-medium">Mentions</p>
                <p className="text-sm text-neon-text-muted">
                  Get email when you're mentioned
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.emailMentions}
                onChange={() => toggleSetting('emailMentions')}
                className="w-5 h-5 rounded border-neon-border bg-neon-surface"
              />
            </label>
          </div>
        </div>

        {/* Push notifications */}
        <div>
          <h3 className="text-lg font-medium mb-4">Push notifications</h3>
          <div className="space-y-3">
            <label className="flex items-center justify-between p-3 card cursor-pointer">
              <div>
                <p className="font-medium">Messages</p>
                <p className="text-sm text-neon-text-muted">
                  Push notifications for new messages
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.pushMessages}
                onChange={() => toggleSetting('pushMessages')}
                className="w-5 h-5 rounded border-neon-border bg-neon-surface"
              />
            </label>

            <label className="flex items-center justify-between p-3 card cursor-pointer">
              <div>
                <p className="font-medium">Calls</p>
                <p className="text-sm text-neon-text-muted">
                  Push notifications for incoming calls
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.pushCalls}
                onChange={() => toggleSetting('pushCalls')}
                className="w-5 h-5 rounded border-neon-border bg-neon-surface"
              />
            </label>
          </div>
        </div>

        {/* Sound */}
        <div>
          <h3 className="text-lg font-medium mb-4">Sound</h3>
          <label className="flex items-center justify-between p-3 card cursor-pointer">
            <div>
              <p className="font-medium">Notification sounds</p>
              <p className="text-sm text-neon-text-muted">
                Play sounds for notifications
              </p>
            </div>
            <input
              type="checkbox"
              checked={settings.soundEnabled}
              onChange={() => toggleSetting('soundEnabled')}
              className="w-5 h-5 rounded border-neon-border bg-neon-surface"
            />
          </label>
        </div>
      </div>
    </div>
  );
}

// Main settings page
export default function SettingsPage() {
  const navItems = [
    { to: '/settings/profile', icon: User, label: 'Profile' },
    { to: '/settings/security', icon: Shield, label: 'Security' },
    { to: '/settings/notifications', icon: Bell, label: 'Notifications' },
  ];

  return (
    <div className="h-full flex">
      {/* Settings sidebar */}
      <div className="w-64 flex-shrink-0 border-r border-neon-border p-4">
        <h1 className="text-xl font-semibold mb-6">Settings</h1>
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

      {/* Settings content */}
      <div className="flex-1 overflow-y-auto p-8">
        <Routes>
          <Route index element={<ProfileSettings />} />
          <Route path="profile" element={<ProfileSettings />} />
          <Route path="security" element={<SecuritySettings />} />
          <Route path="notifications" element={<NotificationSettings />} />
        </Routes>
      </div>
    </div>
  );
}
