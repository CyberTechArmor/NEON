import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { MeetProvider } from './components/meet';
import './styles/globals.css';

// Don't render React app for /api routes - let the server handle them
// This check must happen BEFORE React renders to prevent Router from intercepting
if (window.location.pathname.startsWith('/api')) {
  // Clear the root element and stop - browser will show server response
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = '';
    root.style.display = 'none';
  }
  // Don't continue with React rendering
} else {

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <MeetProvider>
          <App />
        </MeetProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            className: 'toast',
            duration: 4000,
            style: {
              background: '#161616',
              color: '#ffffff',
              border: '1px solid #2a2a2a',
            },
          }}
        />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.log('Service worker registration failed:', error);
    });
  });
}

} // End of else block for non-/api routes
