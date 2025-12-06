import { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';
import { useSocketStore } from '../stores/socket';
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
} from 'lucide-react';

export default function AppLayout() {
  const { user, logout, hasPermission } = useAuthStore();
  const { connect, disconnect, isConnected, updatePresence } = useSocketStore();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // Connect to socket on mount
  useEffect(() => {
    connect();
    updatePresence('online');

    return () => {
      disconnect();
    };
  }, [connect, disconnect, updatePresence]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = [
    { to: '/chat', icon: MessageSquare, label: 'Messages' },
    { to: '/meetings', icon: Calendar, label: 'Meetings' },
    { to: '/settings', icon: Settings, label: 'Settings' },
  ];

  if (hasPermission('audit:view') || hasPermission('org:view_settings')) {
    navItems.push({ to: '/admin', icon: Shield, label: 'Admin' });
  }

  return (
    <div className="min-h-screen bg-neon-bg flex">
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
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-neon-success' : 'bg-neon-error'}`} />
              <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top header (mobile) */}
        <header className="lg:hidden flex items-center justify-between h-16 px-4 border-b border-neon-border bg-neon-surface">
          <button
            className="p-2 hover:bg-neon-surface-hover rounded"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-xl font-bold tracking-tight">NEON</span>
          <button className="p-2 hover:bg-neon-surface-hover rounded relative">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-neon-error rounded-full" />
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
