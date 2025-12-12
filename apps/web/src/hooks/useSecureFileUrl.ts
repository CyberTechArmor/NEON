/**
 * Secure File URL Hook
 *
 * Fetches fresh presigned URLs for files to ensure they don't expire.
 * Handles caching and automatic refresh for file access.
 */

import { useState, useEffect, useCallback } from 'react';
import { filesApi } from '../lib/api';

interface SecureUrlState {
  url: string | null;
  loading: boolean;
  error: string | null;
}

// Cache for presigned URLs (5 minute TTL)
const urlCache = new Map<string, { url: string; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get a fresh presigned URL for a file
 * Uses caching to avoid unnecessary API calls
 */
export async function getSecureFileUrl(fileId: string): Promise<string | null> {
  // Check cache first
  const cached = urlCache.get(fileId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  try {
    const response = await filesApi.getDownloadUrl(fileId);
    const { downloadUrl } = response.data.data;

    // Cache the URL
    urlCache.set(fileId, {
      url: downloadUrl,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return downloadUrl;
  } catch (error) {
    console.error(`[SecureFileUrl] Failed to get URL for file ${fileId}:`, error);
    return null;
  }
}

/**
 * Clear cached URL for a file (e.g., after deletion)
 */
export function clearSecureFileUrl(fileId: string): void {
  urlCache.delete(fileId);
}

/**
 * Clear all cached URLs
 */
export function clearAllSecureFileUrls(): void {
  urlCache.clear();
}

/**
 * Hook for getting a secure presigned URL for a file
 *
 * @param fileId - The file ID to get a URL for
 * @param initialUrl - Optional initial URL to use while loading (e.g., from message data)
 * @returns Object with url, loading, and error states
 */
export function useSecureFileUrl(fileId: string | undefined, initialUrl?: string): SecureUrlState {
  const [state, setState] = useState<SecureUrlState>({
    url: initialUrl || null,
    loading: !!fileId && !initialUrl,
    error: null,
  });

  const fetchUrl = useCallback(async () => {
    if (!fileId) {
      setState({ url: initialUrl || null, loading: false, error: null });
      return;
    }

    // Check cache first
    const cached = urlCache.get(fileId);
    if (cached && cached.expiresAt > Date.now()) {
      setState({ url: cached.url, loading: false, error: null });
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const url = await getSecureFileUrl(fileId);
      if (url) {
        setState({ url, loading: false, error: null });
      } else {
        setState({ url: initialUrl || null, loading: false, error: 'Failed to get file URL' });
      }
    } catch (error) {
      setState({
        url: initialUrl || null,
        loading: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, [fileId, initialUrl]);

  useEffect(() => {
    fetchUrl();
  }, [fetchUrl]);

  return state;
}

/**
 * Hook for getting secure URLs for multiple files
 *
 * @param fileIds - Array of file IDs
 * @returns Map of fileId to URL state
 */
export function useSecureFileUrls(fileIds: string[]): Map<string, SecureUrlState> {
  const [urlMap, setUrlMap] = useState<Map<string, SecureUrlState>>(new Map());

  useEffect(() => {
    const fetchUrls = async () => {
      const results = new Map<string, SecureUrlState>();

      await Promise.all(
        fileIds.map(async (fileId) => {
          try {
            const url = await getSecureFileUrl(fileId);
            results.set(fileId, { url, loading: false, error: null });
          } catch (error) {
            results.set(fileId, {
              url: null,
              loading: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        })
      );

      setUrlMap(results);
    };

    if (fileIds.length > 0) {
      fetchUrls();
    }
  }, [fileIds.join(',')]); // Re-run when file IDs change

  return urlMap;
}

export default useSecureFileUrl;
