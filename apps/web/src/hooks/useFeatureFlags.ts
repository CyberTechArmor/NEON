/**
 * Feature Flags Hook
 *
 * Provides reactive access to feature flags with real-time updates via WebSocket.
 */

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { featuresApi } from '../lib/api';
import { useSocketStore } from '../stores/socket';

// Default flags (matches server defaults)
const DEFAULT_FLAGS: Record<string, boolean> = {
  voice_calls: true,
  video_calls: true,
  meetings: true,
  screen_share: true,
  file_uploads: true,
  rich_attachments: true,
};

interface UseFeatureFlagsReturn {
  flags: Record<string, boolean>;
  isLoading: boolean;
  isFeatureEnabled: (key: string) => boolean;
  refetch: () => void;
}

/**
 * Hook to access all feature flags with real-time updates
 */
export function useFeatureFlags(): UseFeatureFlagsReturn {
  const queryClient = useQueryClient();
  const socket = useSocketStore((state) => state.socket);

  // Fetch feature flags
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['features'],
    queryFn: async () => {
      const response = await featuresApi.get();
      return response.data.data.flags;
    },
    staleTime: 60000, // 1 minute
    retry: 2,
  });

  // Listen for WebSocket updates
  useEffect(() => {
    if (!socket) return;

    const handleFlagsUpdate = (eventData: { flags: Record<string, boolean> }) => {
      console.log('[FeatureFlags] Received update via WebSocket:', eventData);
      // Update the query cache with new flags
      queryClient.setQueryData(['features'], eventData.flags);
    };

    socket.on('feature_flags:updated' as any, handleFlagsUpdate);

    return () => {
      socket.off('feature_flags:updated' as any, handleFlagsUpdate);
    };
  }, [socket, queryClient]);

  const flags = data || DEFAULT_FLAGS;

  const isFeatureEnabled = useCallback(
    (key: string): boolean => {
      return flags[key] ?? DEFAULT_FLAGS[key] ?? false;
    },
    [flags]
  );

  return {
    flags,
    isLoading,
    isFeatureEnabled,
    refetch,
  };
}

/**
 * Hook to check a specific feature flag
 */
export function useFeatureFlag(key: string): { enabled: boolean; loading: boolean } {
  const { flags, isLoading } = useFeatureFlags();

  return {
    enabled: flags[key] ?? DEFAULT_FLAGS[key] ?? false,
    loading: isLoading,
  };
}

export default useFeatureFlags;
