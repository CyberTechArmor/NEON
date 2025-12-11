import { useEffect, useState, useMemo } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { useAuthStore } from '../stores/auth';
import { useSocketStore } from '../stores/socket';
import { useChatStore } from '../stores/chat';
import { notificationsApi } from '../lib/api';
import { useFeatureFlags } from '../hooks/useFeatureFlags';
import {
  MessageSquare,
  Video,
  Calendar,
  Settings,
  Shield,
  LogOut,
  Menu,
  X,
  Bell,
  Search,
  ChevronDown,
  Check,
  Loader2,
  AlertTriangle,
  Wifi,
  WifiOff,
  Home,
} from 'lucide-react';

interface Notification {
  id: string;
  type: string;
  title: string;
  body?: string;
  read: boolean;
  createdAt: string;
  data?: Record<string, unknown>;
}

export default function AppLayout() {
  const { user, logout, hasPermission } = useAuthStore();
  const { isFeatureEnabled } = useFeatureFlags();
  const {
    connect,
    disconnect,
    isConnected,
    updatePresence,
    notifications: socketNotifications,
    unreadNotificationCount,
    setNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    activeTestAlert,
    acknowledgeTestAlert,
    lastActivityAt,
  } = useSocketStore();
  const { conversations } = useChatStore();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  // Calculate total unread message count from all conversations
  const totalUnreadMessages = useMemo(() => {
    return conversations.reduce((total, conv) => total + (conv.unreadCount || 0), 0);
  }, [conversations]);

  // Initial fetch of notifications (then use WebSocket for real-time updates)
  const { data: notificationsData, isLoading: notificationsLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const response = await notificationsApi.list({ limit: 20 });
      const data = response.data.data as Notification[];
      // Set initial notifications in socket store
      setNotifications(data);
      return data;
    },
    staleTime: Infinity, // Don't refetch automatically, use WebSocket instead
  });

  // Use socket notifications if available, otherwise fall back to query data
  const displayNotifications = socketNotifications.length > 0 ? socketNotifications : (notificationsData || []);
  const unreadCount = unreadNotificationCount || displayNotifications.filter((n) => !n.read).length;

  // Mark notification as read
  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await notificationsApi.markRead(id);
      markNotificationRead(id);
    },
  });

  // Mark all as read
  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await notificationsApi.markAllRead();
      markAllNotificationsRead();
    },
  });

  // Connect to socket on mount
  useEffect(() => {
    connect();
    updatePresence('online');

    return () => {
      disconnect();
    };
  }, [connect, disconnect, updatePresence]);

  // Listen for service worker messages (notification clicks)
  useEffect(() => {
    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'NOTIFICATION_CLICK') {
        console.log('[AppLayout] Notification click received:', event.data);
        // Navigate to the URL from the notification
        if (event.data.url) {
          navigate(event.data.url);
        }
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
    }

    return () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
      }
    };
  }, [navigate]);

  // Calculate connection status for display
  const getConnectionStatus = () => {
    if (!isConnected) return 'disconnected';
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    if (lastActivityAt && lastActivityAt < fiveMinutesAgo) return 'inactive';
    return 'active';
  };

  const connectionStatus = getConnectionStatus();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = [
    { to: '/chat', icon: MessageSquare, label: 'Messages' },
    ...(isFeatureEnabled('meetings')
      ? [{ to: '/meetings', icon: Calendar, label: 'Meetings' }]
      : []),
    { to: '/settings', icon: Settings, label: 'Settings' },
  ];

  if (hasPermission('audit:view') || hasPermission('org:view_settings')) {
    navItems.push({ to: '/admin', icon: Shield, label: 'Admin' });
  }

  const meetingsEnabled = isFeatureEnabled('meetings');

  return (
    <div className="h-screen bg-neon-bg flex overflow-hidden">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-neon-surface border-r border-neon-border
          transform transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between h-16 px-4 border-b border-neon-border">
            <span className="text-xl font-bold tracking-tight">NEON</span>
            <button
              className="lg:hidden p-2 hover:bg-neon-surface-hover rounded"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Search */}
          <div className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neon-text-muted" />
              <input
                type="text"
                placeholder="Search..."
                className="input pl-10 py-2 text-sm"
              />
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `sidebar-item ${isActive ? 'sidebar-item-active' : ''}`
                }
                onClick={() => setSidebarOpen(false)}
              >
                <item.icon className="w-5 h-5" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>

          {/* User section */}
          <div className="p-4 border-t border-neon-border">
            <div className="relative">
              <button
                className="flex items-center gap-3 w-full p-2 rounded hover:bg-neon-surface-hover"
                onClick={() => setUserMenuOpen(!userMenuOpen)}
              >
                <div className="avatar avatar-sm">
                  {user?.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
                  ) : (
                    <span>{user?.name?.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div className="flex-1 text-left min-w-0">
                  <div className="text-sm font-medium truncate">{user?.name}</div>
                  <div className="text-xs text-neon-text-muted truncate">{user?.role?.name}</div>
                </div>
                <ChevronDown className={`w-4 h-4 text-neon-text-muted transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* User dropdown menu */}
              {userMenuOpen && (
                <div className="absolute bottom-full left-0 right-0 mb-2 dropdown-menu">
                  <button
                    className="dropdown-item w-full"
                    onClick={() => {
                      setUserMenuOpen(false);
                      navigate('/settings/profile');
                    }}
                  >
                    <Settings className="w-4 h-4" />
                    <span>Settings</span>
                  </button>
                  <div className="dropdown-separator" />
                  <button
                    className="dropdown-item dropdown-item-danger w-full"
                    onClick={() => {
                      setUserMenuOpen(false);
                      handleLogout();
                    }}
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign out</span>
                  </button>
                </div>
              )}
            </div>

            {/* Connection status */}
            <div className="mt-3 flex items-center gap-2 text-xs text-neon-text-muted">
              <span className={`w-2 h-2 rounded-full ${
                connectionStatus === 'active' ? 'bg-neon-success' :
                connectionStatus === 'inactive' ? 'bg-neon-warning' :
                'bg-neon-error'
              }`} />
              <span>{
                connectionStatus === 'active' ? 'Active' :
                connectionStatus === 'inactive' ? 'Inactive' :
                'Disconnected'
              }</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top header (mobile) */}
        <header className="lg:hidden flex items-center justify-between h-16 px-4 border-b border-neon-border bg-neon-surface">
          <button
            className="p-2 hover:bg-neon-surface-hover rounded"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-xl font-bold tracking-tight">NEON</span>
          <div className="relative">
            <button
              className="p-2 hover:bg-neon-surface-hover rounded relative"
              onClick={() => setNotificationsOpen(!notificationsOpen)}
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-neon-error rounded-full" />
              )}
            </button>

            {/* Notifications dropdown */}
            {notificationsOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setNotificationsOpen(false)}
                />
                <div className="absolute right-0 top-full mt-2 z-50 w-80 max-h-96 overflow-y-auto bg-neon-surface border border-neon-border rounded-lg shadow-xl">
                  <div className="flex items-center justify-between p-3 border-b border-neon-border">
                    <h3 className="font-medium">Notifications</h3>
                    {unreadCount > 0 && (
                      <button
                        className="text-xs text-neon-accent hover:underline"
                        onClick={() => markAllReadMutation.mutate()}
                      >
                        Mark all read
                      </button>
                    )}
                  </div>

                  {notificationsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-neon-text-muted" />
                    </div>
                  ) : !displayNotifications?.length ? (
                    <div className="py-8 text-center text-neon-text-muted">
                      <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No notifications</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-neon-border">
                      {displayNotifications.map((notification) => (
                        <div
                          key={notification.id}
                          className={`p-3 hover:bg-neon-surface-hover cursor-pointer ${
                            !notification.read ? 'bg-neon-accent/5' : ''
                          }`}
                          onClick={() => {
                            if (!notification.read) {
                              markReadMutation.mutate(notification.id);
                            }
                            // Navigate based on notification type
                            if (notification.data?.conversationId) {
                              navigate(`/chat/${notification.data.conversationId}`);
                              setNotificationsOpen(false);
                            } else if (notification.data?.meetingId) {
                              navigate(`/meetings`);
                              setNotificationsOpen(false);
                            }
                          }}
                        >
                          <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {notification.title}
                              </p>
                              {notification.body && (
                                <p className="text-xs text-neon-text-muted line-clamp-2">
                                  {notification.body}
                                </p>
                              )}
                              <p className="text-xs text-neon-text-muted mt-1">
                                {formatDistanceToNow(new Date(notification.createdAt), {
                                  addSuffix: true,
                                })}
                              </p>
                            </div>
                            {!notification.read && (
                              <span className="w-2 h-2 bg-neon-accent rounded-full flex-shrink-0 mt-1.5" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </header>

        {/* Page content - add padding bottom on mobile for the nav bar */}
        <main className="flex-1 overflow-hidden pb-16 lg:pb-0">
          <Outlet />
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-neon-surface border-t border-neon-border safe-area-inset-bottom">
        <div className="flex items-center justify-around h-16">
          {/* Messages */}
          <NavLink
            to="/chat"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center flex-1 h-full relative ${
                isActive ? 'text-neon-accent' : 'text-neon-text-muted'
              }`
            }
          >
            <div className="relative">
              <MessageSquare className="w-5 h-5" />
              {totalUnreadMessages > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold bg-neon-error text-white rounded-full px-1">
                  {totalUnreadMessages > 99 ? '99+' : totalUnreadMessages}
                </span>
              )}
            </div>
            <span className="text-[10px] mt-0.5">Messages</span>
          </NavLink>

          {/* Meetings */}
          {meetingsEnabled ? (
            <NavLink
              to="/meetings"
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 h-full ${
                  isActive ? 'text-neon-accent' : 'text-neon-text-muted'
                }`
              }
            >
              <Calendar className="w-5 h-5" />
              <span className="text-[10px] mt-0.5">Meetings</span>
            </NavLink>
          ) : (
            <div
              className="flex flex-col items-center justify-center flex-1 h-full text-neon-text-muted opacity-50 cursor-not-allowed"
              title="Meetings coming soon"
            >
              <Calendar className="w-5 h-5" />
              <span className="text-[10px] mt-0.5">Meetings</span>
            </div>
          )}

          {/* Notifications */}
          <button
            className={`flex flex-col items-center justify-center flex-1 h-full ${
              notificationsOpen ? 'text-neon-accent' : 'text-neon-text-muted'
            }`}
            onClick={() => setNotificationsOpen(!notificationsOpen)}
          >
            <div className="relative">
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold bg-neon-error text-white rounded-full px-1">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </div>
            <span className="text-[10px] mt-0.5">Alerts</span>
          </button>

          {/* Settings */}
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center flex-1 h-full ${
                isActive ? 'text-neon-accent' : 'text-neon-text-muted'
              }`
            }
          >
            <Settings className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Settings</span>
          </NavLink>

          {/* Admin (conditional) */}
          {(hasPermission('audit:view') || hasPermission('org:view_settings')) && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 h-full ${
                  isActive ? 'text-neon-accent' : 'text-neon-text-muted'
                }`
              }
            >
              <Shield className="w-5 h-5" />
              <span className="text-[10px] mt-0.5">Admin</span>
            </NavLink>
          )}
        </div>
      </nav>

      {/* Mobile Notifications Panel (slides up from bottom nav) */}
      {notificationsOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 z-40 bg-black/50"
            onClick={() => setNotificationsOpen(false)}
          />
          <div className="lg:hidden fixed bottom-16 left-0 right-0 z-50 bg-neon-surface border-t border-neon-border rounded-t-2xl max-h-[60vh] overflow-hidden animate-slide-up">
            <div className="flex items-center justify-between p-4 border-b border-neon-border">
              <h3 className="font-medium">Notifications</h3>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    className="text-xs text-neon-accent hover:underline"
                    onClick={() => markAllReadMutation.mutate()}
                  >
                    Mark all read
                  </button>
                )}
                <button
                  className="p-1 hover:bg-neon-surface-hover rounded"
                  onClick={() => setNotificationsOpen(false)}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto max-h-[calc(60vh-60px)]">
              {notificationsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-neon-text-muted" />
                </div>
              ) : !displayNotifications?.length ? (
                <div className="py-8 text-center text-neon-text-muted">
                  <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No notifications</p>
                </div>
              ) : (
                <div className="divide-y divide-neon-border">
                  {displayNotifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`p-4 hover:bg-neon-surface-hover active:bg-neon-surface-hover cursor-pointer ${
                        !notification.read ? 'bg-neon-accent/5' : ''
                      }`}
                      onClick={() => {
                        if (!notification.read) {
                          markReadMutation.mutate(notification.id);
                        }
                        // Navigate based on notification type
                        if (notification.data?.conversationId) {
                          navigate(`/chat/${notification.data.conversationId}`);
                          setNotificationsOpen(false);
                        } else if (notification.data?.meetingId) {
                          navigate(`/meetings`);
                          setNotificationsOpen(false);
                        }
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                          notification.type === 'message' ? 'bg-neon-accent/20' :
                          notification.type === 'meeting' ? 'bg-neon-warning/20' :
                          'bg-neon-surface-hover'
                        }`}>
                          {notification.type === 'message' ? (
                            <MessageSquare className="w-5 h-5 text-neon-accent" />
                          ) : notification.type === 'meeting' ? (
                            <Calendar className="w-5 h-5 text-neon-warning" />
                          ) : (
                            <Bell className="w-5 h-5 text-neon-text-muted" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{notification.title}</p>
                          {notification.body && (
                            <p className="text-xs text-neon-text-muted line-clamp-2 mt-0.5">
                              {notification.body}
                            </p>
                          )}
                          <p className="text-xs text-neon-text-muted mt-1">
                            {formatDistanceToNow(new Date(notification.createdAt), {
                              addSuffix: true,
                            })}
                          </p>
                        </div>
                        {!notification.read && (
                          <span className="w-2 h-2 bg-neon-accent rounded-full flex-shrink-0 mt-2" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Test Alert Modal */}
      {activeTestAlert && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative bg-neon-surface border-2 border-neon-warning rounded-lg shadow-xl w-full max-w-md animate-scale-in">
            {/* Header with warning icon */}
            <div className="flex items-center gap-4 p-6 border-b border-neon-border">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-neon-warning/20 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-neon-warning" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">{activeTestAlert.title}</h2>
                <p className="text-sm text-neon-text-muted">Test Alert</p>
              </div>
            </div>

            {/* Body */}
            <div className="p-6">
              <p className="text-neon-text-secondary">{activeTestAlert.body}</p>
              <p className="mt-4 text-xs text-neon-text-muted">
                Received at {new Date(activeTestAlert.createdAt).toLocaleTimeString()}
              </p>
            </div>

            {/* Footer */}
            <div className="flex justify-end p-4 border-t border-neon-border">
              <button
                className="btn btn-primary"
                onClick={acknowledgeTestAlert}
              >
                <Check className="w-4 h-4" />
                <span>Acknowledge</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
