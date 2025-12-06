import { ReactNode } from 'react';

interface AuthLayoutProps {
  children: ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-neon-bg flex flex-col">
      {/* Header */}
      <header className="p-6">
        <div className="text-2xl font-bold tracking-tight">NEON</div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="p-6 text-center text-sm text-neon-text-muted">
        <p>&copy; {new Date().getFullYear()} Fractionate. All rights reserved.</p>
      </footer>
    </div>
  );
}
