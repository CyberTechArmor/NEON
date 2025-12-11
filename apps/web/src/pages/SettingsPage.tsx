import { useState, useRef } from 'react';
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
  X,
  Copy,
  Smartphone,
  AlertTriangle,
  Wifi,
  WifiOff,
  Volume2,
  VolumeX,
  BellRing,
} from 'lucide-react';
import { useAuthStore } from '../stores/auth';
import { useSocketStore } from '../stores/socket';
import {
  useNotificationStore,
  playNotificationSound,
  playTestAlertSound,
} from '../stores/notifications';
import { usersApi, authApi, filesApi, getErrorMessage, api } from '../lib/api';
import { AvatarUpload } from '../components/AvatarUpload';

// Toggle switch component for better visibility
function Toggle({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`toggle-switch ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span
        className={`toggle-switch-track ${
          checked ? 'toggle-switch-track-on' : 'toggle-switch-track-off'
        }`}
      />
      <span
        className={`toggle-switch-thumb ${
          checked ? 'toggle-switch-thumb-on' : 'toggle-switch-thumb-off'
        }`}
      />
    </button>
  );
}

// Profile settings
function ProfileSettings() {
  const { user, setUser } = useAuthStore();

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
      name: user?.name || user?.displayName || '',
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { displayName: string }) => {
      const response = await usersApi.updateProfile(data);
      return response.data.data;
    },
    onSuccess: (data: any) => {
      setUser({ ...user!, name: data.displayName || data.name, displayName: data.displayName });
      toast.success('Profile updated');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  const onSubmit = (data: { name: string }) => {
    updateProfileMutation.mutate({ displayName: data.name });
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Profile</h2>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-md">
        {/* Avatar */}
        <div>
          <label className="block text-sm font-medium mb-2">Avatar</label>
          <div className="flex items-center gap-4">
            <AvatarUpload
              currentAvatarUrl={user?.avatarUrl}
              size="lg"
            />
            <div className="text-sm text-neon-text-muted">
              <p>Click to upload a new avatar.</p>
              <p>Max 5MB, JPG/PNG/WebP/GIF supported.</p>
            </div>
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
  const { user, setUser } = useAuthStore();
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showMfaSetup, setShowMfaSetup] = useState(false);
  const [showMfaDisable, setShowMfaDisable] = useState(false);
  const [mfaDisablePassword, setMfaDisablePassword] = useState('');
  const [mfaSecret, setMfaSecret] = useState<string | null>(null);
  const [mfaQrCode, setMfaQrCode] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [mfaEnabled, setMfaEnabled] = useState(false);

  // Check MFA status on mount - always fetch fresh data
  useQuery({
    queryKey: ['user', 'me', 'mfa-status'],
    queryFn: async () => {
      const response = await authApi.me();
      const userData = response.data.data as any;
      setMfaEnabled(userData?.mfaEnabled || false);
      return userData;
    },
    staleTime: 0, // Always consider data stale
    refetchOnMount: 'always', // Always refetch when component mounts
  });

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

  const setupMfaMutation = useMutation({
    mutationFn: async () => {
      const response = await authApi.setupMfa('TOTP');
      return response.data.data;
    },
    onSuccess: (data: any) => {
      setMfaSecret(data.secret);
      setMfaQrCode(data.qrCode);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  const verifyMfaMutation = useMutation({
    mutationFn: async ({ code, secret }: { code: string; secret: string }) => {
      // Send the secret along with the code for verification
      const response = await authApi.verifyMfa(code, 'TOTP');
      // Override with custom request that includes secret
      const customResponse = await api.post('/auth/mfa/verify', { code, secret, method: 'TOTP' });
      return customResponse.data.data;
    },
    onSuccess: (data: any) => {
      setBackupCodes(data.backupCodes);
      setMfaEnabled(true);
      toast.success('Two-factor authentication enabled');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  const disableMfaMutation = useMutation({
    mutationFn: async (password: string) => {
      const response = await api.delete('/auth/mfa', { data: { password } });
      return response.data.data;
    },
    onSuccess: () => {
      setMfaEnabled(false);
      setShowMfaDisable(false);
      setMfaDisablePassword('');
      toast.success('Two-factor authentication has been disabled');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  const handleDisableMfa = () => {
    if (!mfaDisablePassword) {
      toast.error('Please enter your password');
      return;
    }
    disableMfaMutation.mutate(mfaDisablePassword);
  };

  const handleStartMfaSetup = () => {
    setShowMfaSetup(true);
    setupMfaMutation.mutate();
  };

  const handleVerifyMfa = () => {
    if (mfaCode.length !== 6) {
      toast.error('Please enter a 6-digit code');
      return;
    }
    if (!mfaSecret) {
      toast.error('MFA secret not found. Please restart the setup.');
      return;
    }
    verifyMfaMutation.mutate({ code: mfaCode, secret: mfaSecret });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

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

        {mfaEnabled && !showMfaSetup && !backupCodes ? (
          <div className="card p-4 max-w-md">
            <div className="flex items-center gap-2 mb-4 text-neon-success">
              <Check className="w-5 h-5" />
              <span className="font-medium">Two-factor authentication is enabled</span>
            </div>
            <p className="text-sm text-neon-text-muted mb-4">
              Your account is protected with an authenticator app.
            </p>

            {showMfaDisable ? (
              <div className="border-t border-neon-border pt-4 mt-4">
                <p className="text-sm text-neon-text-muted mb-3">
                  Enter your password to disable two-factor authentication:
                </p>
                <div className="space-y-3">
                  <div className="relative">
                    <input
                      type="password"
                      className="input w-full"
                      placeholder="Enter your password"
                      value={mfaDisablePassword}
                      onChange={(e) => setMfaDisablePassword(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="btn btn-error flex-1"
                      onClick={handleDisableMfa}
                      disabled={disableMfaMutation.isPending}
                    >
                      {disableMfaMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        'Disable MFA'
                      )}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        setShowMfaDisable(false);
                        setMfaDisablePassword('');
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                className="btn btn-secondary btn-sm text-neon-error hover:bg-neon-error/20"
                onClick={() => setShowMfaDisable(true)}
              >
                Disable 2FA
              </button>
            )}
          </div>
        ) : !showMfaSetup ? (
          <div className="card p-4 max-w-md">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Authenticator app</p>
                <p className="text-sm text-neon-text-muted">
                  Use an authenticator app for 2FA
                </p>
              </div>
              <button
                className="btn btn-secondary"
                onClick={handleStartMfaSetup}
                disabled={setupMfaMutation.isPending}
              >
                {setupMfaMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Enable'
                )}
              </button>
            </div>
          </div>
        ) : backupCodes ? (
          // Show backup codes after successful setup
          <div className="card p-4 max-w-md">
            <div className="flex items-center gap-2 mb-4 text-neon-success">
              <Check className="w-5 h-5" />
              <span className="font-medium">Two-factor authentication enabled</span>
            </div>
            <p className="text-sm text-neon-text-muted mb-4">
              Save these backup codes in a safe place. You can use them to access your account if you lose your authenticator device.
            </p>
            <div className="grid grid-cols-2 gap-2 p-3 bg-neon-surface-hover rounded-lg mb-4">
              {backupCodes.map((code, index) => (
                <code key={index} className="text-sm font-mono">{code}</code>
              ))}
            </div>
            <button
              className="btn btn-secondary w-full"
              onClick={() => copyToClipboard(backupCodes.join('\n'))}
            >
              <Copy className="w-4 h-4" />
              <span>Copy backup codes</span>
            </button>
          </div>
        ) : (
          // MFA setup flow
          <div className="card p-4 max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-medium">Setup authenticator app</h4>
              <button
                className="btn btn-icon btn-ghost btn-sm"
                onClick={() => {
                  setShowMfaSetup(false);
                  setMfaSecret(null);
                  setMfaQrCode(null);
                  setMfaCode('');
                }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {setupMfaMutation.isPending ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-neon-text-muted" />
              </div>
            ) : mfaSecret && mfaQrCode ? (
              <div className="space-y-4">
                <div>
                  <p className="text-sm mb-2">1. Scan this QR code with your authenticator app:</p>
                  <div className="flex justify-center p-4 bg-white rounded-lg">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(mfaQrCode)}`}
                      alt="QR Code"
                      className="w-48 h-48"
                    />
                  </div>
                </div>

                <div>
                  <p className="text-sm mb-2">Or enter this code manually:</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2 bg-neon-surface-hover rounded text-sm font-mono break-all">
                      {mfaSecret}
                    </code>
                    <button
                      className="btn btn-icon btn-ghost btn-sm"
                      onClick={() => copyToClipboard(mfaSecret)}
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div>
                  <p className="text-sm mb-2">2. Enter the 6-digit code from your authenticator app:</p>
                  <input
                    type="text"
                    className="input text-center text-lg tracking-widest"
                    maxLength={6}
                    placeholder="000000"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                  />
                </div>

                <button
                  className="btn btn-primary w-full"
                  onClick={handleVerifyMfa}
                  disabled={mfaCode.length !== 6 || verifyMfaMutation.isPending}
                >
                  {verifyMfaMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Verifying...</span>
                    </>
                  ) : (
                    <span>Verify and enable</span>
                  )}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

// Notification settings
function NotificationSettings() {
  const { isConnected, lastActivityAt, sendTestAlert } = useSocketStore();
  const {
    soundEnabled,
    testAlertSoundEnabled,
    soundVolume,
    browserNotificationsEnabled,
    browserPermission,
    setSoundEnabled,
    setTestAlertSoundEnabled,
    setSoundVolume,
    setBrowserNotificationsEnabled,
    requestBrowserPermission,
  } = useNotificationStore();

  const [isSendingAlert, setIsSendingAlert] = useState(false);
  const [emailSettings, setEmailSettings] = useState({
    emailMessages: true,
    emailMentions: true,
  });

  const toggleEmailSetting = (key: keyof typeof emailSettings) => {
    setEmailSettings({ ...emailSettings, [key]: !emailSettings[key] });
    toast.success('Settings updated');
  };

  const handleSendTestAlert = () => {
    setIsSendingAlert(true);
    sendTestAlert();
    toast.success('Test alert sent to all your devices');
    setTimeout(() => setIsSendingAlert(false), 1000);
  };

  const handleTestMessageSound = () => {
    playNotificationSound(soundVolume);
  };

  const handleTestAlertSound = () => {
    playTestAlertSound(soundVolume);
  };

  const handleRequestBrowserPermission = async () => {
    const permission = await requestBrowserPermission();
    if (permission === 'granted') {
      toast.success('Browser notifications enabled');
    } else if (permission === 'denied') {
      toast.error('Browser notifications were denied. Please enable them in your browser settings.');
    }
  };

  // Calculate connection status
  const getConnectionStatus = () => {
    if (!isConnected) {
      return { status: 'Disconnected', color: 'text-neon-error', icon: WifiOff };
    }
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    if (lastActivityAt && lastActivityAt < fiveMinutesAgo) {
      return { status: 'Inactive', color: 'text-neon-warning', icon: Wifi };
    }
    return { status: 'Active', color: 'text-neon-success', icon: Wifi };
  };

  const connectionStatus = getConnectionStatus();
  const ConnectionIcon = connectionStatus.icon;

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Notifications</h2>

      <div className="space-y-6 max-w-md">
        {/* Connection Status */}
        <div>
          <h3 className="text-lg font-medium mb-4">Connection Status</h3>
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <ConnectionIcon className={`w-6 h-6 ${connectionStatus.color}`} />
              <div>
                <p className={`font-medium ${connectionStatus.color}`}>
                  {connectionStatus.status}
                </p>
                <p className="text-sm text-neon-text-muted">
                  {isConnected
                    ? lastActivityAt
                      ? `Last activity: ${new Date(lastActivityAt).toLocaleTimeString()}`
                      : 'Connected to real-time server'
                    : 'Not connected to real-time server'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Browser Notifications */}
        <div>
          <h3 className="text-lg font-medium mb-4">Browser Notifications</h3>
          <div className="card p-4">
            <div className="flex items-start gap-4">
              <BellRing className="w-6 h-6 text-neon-info flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium mb-1">Desktop Notifications</p>
                <p className="text-sm text-neon-text-muted mb-3">
                  Receive notifications even when the app is minimized or in the background.
                  {browserPermission === 'denied' && (
                    <span className="text-neon-warning block mt-1">
                      Notifications are blocked in your browser. Please enable them in your browser settings.
                    </span>
                  )}
                </p>

                {browserPermission === 'default' ? (
                  <button
                    className="btn btn-secondary"
                    onClick={handleRequestBrowserPermission}
                  >
                    <Bell className="w-4 h-4" />
                    <span>Enable Browser Notifications</span>
                  </button>
                ) : browserPermission === 'granted' ? (
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Browser notifications enabled</span>
                    <Toggle
                      checked={browserNotificationsEnabled}
                      onChange={setBrowserNotificationsEnabled}
                    />
                  </div>
                ) : (
                  <p className="text-sm text-neon-text-muted">
                    To enable notifications, click the lock icon in your browser's address bar and allow notifications.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Sound Settings */}
        <div>
          <h3 className="text-lg font-medium mb-4">Sound Notifications</h3>
          <div className="space-y-3">
            {/* Message sound toggle */}
            <div className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  {soundEnabled ? (
                    <Volume2 className="w-5 h-5 text-neon-success" />
                  ) : (
                    <VolumeX className="w-5 h-5 text-neon-text-muted" />
                  )}
                  <div>
                    <p className="font-medium">Message sounds</p>
                    <p className="text-sm text-neon-text-muted">
                      Play a sound for new messages
                    </p>
                  </div>
                </div>
                <Toggle
                  checked={soundEnabled}
                  onChange={setSoundEnabled}
                />
              </div>
              {soundEnabled && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={handleTestMessageSound}
                >
                  Test Sound
                </button>
              )}
            </div>

            {/* Test alert sound toggle */}
            <div className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <AlertTriangle className={`w-5 h-5 ${testAlertSoundEnabled ? 'text-neon-warning' : 'text-neon-text-muted'}`} />
                  <div>
                    <p className="font-medium">Test alert sounds</p>
                    <p className="text-sm text-neon-text-muted">
                      Play a sound for test alerts (on by default)
                    </p>
                  </div>
                </div>
                <Toggle
                  checked={testAlertSoundEnabled}
                  onChange={setTestAlertSoundEnabled}
                />
              </div>
              {testAlertSoundEnabled && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={handleTestAlertSound}
                >
                  Test Alert Sound
                </button>
              )}
            </div>

            {/* Volume slider */}
            <div className="card p-4">
              <div className="flex items-center gap-3 mb-3">
                <Volume2 className="w-5 h-5 text-neon-text-muted" />
                <div className="flex-1">
                  <p className="font-medium">Volume</p>
                  <p className="text-sm text-neon-text-muted">
                    Adjust notification volume
                  </p>
                </div>
                <span className="text-sm text-neon-text-muted w-12 text-right">
                  {Math.round(soundVolume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={soundVolume}
                onChange={(e) => setSoundVolume(parseFloat(e.target.value))}
                className="w-full h-2 bg-neon-surface-hover rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Test Alerts */}
        <div>
          <h3 className="text-lg font-medium mb-4">Test Alerts</h3>
          <div className="card p-4">
            <div className="flex items-start gap-4">
              <AlertTriangle className="w-6 h-6 text-neon-warning flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium mb-1">Send Test Alert</p>
                <p className="text-sm text-neon-text-muted mb-4">
                  Send a test alert to all your logged-in devices. The alert will appear on all devices until acknowledged from any one of them.
                </p>
                <button
                  className="btn btn-secondary"
                  onClick={handleSendTestAlert}
                  disabled={isSendingAlert || !isConnected}
                >
                  {isSendingAlert ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Sending...</span>
                    </>
                  ) : (
                    <span>Send Test Alert</span>
                  )}
                </button>
                {!isConnected && (
                  <p className="text-xs text-neon-error mt-2">
                    Connect to the server to send test alerts
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Email notifications */}
        <div>
          <h3 className="text-lg font-medium mb-4">Email notifications</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 card">
              <div>
                <p className="font-medium">Direct messages</p>
                <p className="text-sm text-neon-text-muted">
                  Get email for new direct messages
                </p>
              </div>
              <Toggle
                checked={emailSettings.emailMessages}
                onChange={() => toggleEmailSetting('emailMessages')}
              />
            </div>

            <div className="flex items-center justify-between p-3 card">
              <div>
                <p className="font-medium">Mentions</p>
                <p className="text-sm text-neon-text-muted">
                  Get email when you're mentioned
                </p>
              </div>
              <Toggle
                checked={emailSettings.emailMentions}
                onChange={() => toggleEmailSetting('emailMentions')}
              />
            </div>
          </div>
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
    <div className="h-full flex flex-col lg:flex-row">
      {/* Settings sidebar - horizontal scroll on mobile, vertical on desktop */}
      <div className="flex-shrink-0 border-b lg:border-b-0 lg:border-r border-neon-border p-4 lg:w-64">
        <h1 className="text-xl font-semibold mb-4 lg:mb-6 hidden lg:block">Settings</h1>
        <nav className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-x-visible scrollbar-hide">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `sidebar-item whitespace-nowrap ${isActive ? 'sidebar-item-active' : ''}`
              }
            >
              <item.icon className="w-5 h-5" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Settings content */}
      <div className="flex-1 overflow-y-auto p-4 lg:p-8">
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
