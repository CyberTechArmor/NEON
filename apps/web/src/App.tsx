import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/auth';

// Layouts
import AuthLayout from './layouts/AuthLayout';
import AppLayout from './layouts/AppLayout';

// Auth Pages
import LoginPage from './pages/auth/LoginPage';
import MFAPage from './pages/auth/MFAPage';

// App Pages
import ChatPage from './pages/ChatPage';
import CallPage from './pages/CallPage';
import MeetingPage from './pages/MeetingPage';
import MeetingsPage from './pages/MeetingsPage';
import SettingsPage from './pages/SettingsPage';
import AdminPage from './pages/AdminPage';

// System Pages
import InitializingPage from './pages/InitializingPage';

// Component to let API routes pass through to the server
function ApiPassthrough() {
  // Don't render anything - the browser is expecting a server response
  // This prevents React Router from redirecting /api/* to /chat
  return null;
}

// Protected Route Wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neon-bg flex items-center justify-center">
        <div className="animate-pulse">
          <div className="text-2xl font-bold tracking-tight">NEON</div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

// Public Route Wrapper (redirects to app if authenticated)
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neon-bg flex items-center justify-center">
        <div className="animate-pulse">
          <div className="text-2xl font-bold tracking-tight">NEON</div>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  const { initStatus, isCheckingInit } = useAuthStore();

  // Show loading while checking initialization
  if (isCheckingInit) {
    return (
      <div className="min-h-screen bg-neon-bg flex items-center justify-center">
        <div className="animate-pulse">
          <div className="text-2xl font-bold tracking-tight">NEON</div>
        </div>
      </div>
    );
  }

  // Show initialization page if system is not initialized
  if (initStatus && !initStatus.initialized) {
    return <InitializingPage />;
  }

  return (
    <Routes>
      {/* Auth Routes */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <AuthLayout>
              <LoginPage />
            </AuthLayout>
          </PublicRoute>
        }
      />
      <Route
        path="/mfa"
        element={
          <AuthLayout>
            <MFAPage />
          </AuthLayout>
        }
      />

      {/* App Routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/chat" replace />} />
        <Route path="chat" element={<ChatPage />} />
        <Route path="chat/:conversationId" element={<ChatPage />} />
        <Route path="meetings" element={<MeetingsPage />} />
        <Route path="call/:callId" element={<CallPage />} />
        <Route path="meeting/:meetingId" element={<MeetingPage />} />
        <Route path="settings/*" element={<SettingsPage />} />
        <Route path="admin/*" element={<AdminPage />} />
      </Route>

      {/* API routes - let them pass through to server (don't redirect) */}
      <Route path="/api" element={<ApiPassthrough />} />
      <Route path="/api/*" element={<ApiPassthrough />} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
