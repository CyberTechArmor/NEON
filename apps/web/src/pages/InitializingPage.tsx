/**
 * Initialization Page
 *
 * Shown when the system is not yet initialized (no users/organization created)
 */

import { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/auth';

export default function InitializingPage() {
  const { initStatus, checkInitialization } = useAuthStore();
  const [dots, setDots] = useState('');

  // Animate loading dots
  useEffect(() => {
    const interval = setInterval(() => {
      setDots((d) => (d.length >= 3 ? '' : d + '.'));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // Poll for initialization status every 3 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      checkInitialization();
    }, 3000);
    return () => clearInterval(interval);
  }, [checkInitialization]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
      <div className="max-w-md w-full mx-4">
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl p-8 border border-gray-700">
          {/* Logo */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
              NEON
            </h1>
            <p className="text-gray-400 mt-2">Secure Communications Platform</p>
          </div>

          {/* Status */}
          <div className="space-y-6">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-cyan-500/10 mb-4">
                <svg
                  className="w-8 h-8 text-cyan-400 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">
                Initializing System{dots}
              </h2>
              <p className="text-gray-400 text-sm">
                Please wait while the database is being set up
              </p>
            </div>

            {/* Status Details */}
            <div className="space-y-3 pt-4 border-t border-gray-700">
              <StatusItem
                label="Database Connection"
                status={initStatus?.error ? 'pending' : 'complete'}
              />
              <StatusItem
                label="Organization Setup"
                status={initStatus?.hasOrganization ? 'complete' : 'pending'}
              />
              <StatusItem
                label="Admin User Creation"
                status={initStatus?.hasUsers ? 'complete' : 'pending'}
              />
            </div>

            {/* Error Message */}
            {initStatus?.error && (
              <div className="mt-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                <p className="text-yellow-400 text-sm text-center">
                  {initStatus.error === 'API not available'
                    ? 'Waiting for API server to start...'
                    : initStatus.error}
                </p>
              </div>
            )}

            {/* Help Text */}
            <div className="mt-6 p-4 rounded-lg bg-gray-700/30">
              <p className="text-gray-300 text-sm">
                <strong className="text-cyan-400">First time setup?</strong>
                <br />
                The system will automatically create the database schema and an
                admin user. This may take a few moments.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-gray-500 text-xs mt-6">
          NEON v0.1.0 - Enterprise Communication Platform
        </p>
      </div>
    </div>
  );
}

function StatusItem({
  label,
  status,
}: {
  label: string;
  status: 'pending' | 'complete' | 'error';
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-300 text-sm">{label}</span>
      <span
        className={`text-xs font-medium px-2 py-1 rounded-full ${
          status === 'complete'
            ? 'bg-green-500/20 text-green-400'
            : status === 'error'
              ? 'bg-red-500/20 text-red-400'
              : 'bg-gray-500/20 text-gray-400'
        }`}
      >
        {status === 'complete' ? 'Complete' : status === 'error' ? 'Error' : 'Pending'}
      </span>
    </div>
  );
}
