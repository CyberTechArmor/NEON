/**
 * Feature Toggles Types
 *
 * Organization-wide feature configuration
 */

/**
 * Available features that can be toggled
 */
export type FeatureKey =
  | 'voice_calls'
  | 'video_calls'
  | 'meetings'
  | 'file_sharing'
  | 'screen_sharing'
  | 'message_reactions'
  | 'message_editing'
  | 'message_deletion'
  | 'read_receipts'
  | 'typing_indicators';

/**
 * Feature toggle state
 */
export type FeatureState = 'enabled' | 'disabled' | 'coming_soon';

/**
 * Feature toggle definition
 */
export interface FeatureToggle {
  key: FeatureKey;
  state: FeatureState;
  label: string;
  description: string;
  category: 'communication' | 'messaging' | 'collaboration';
  disabledMessage?: string;
}

/**
 * Organization feature settings stored in organization.settings.features
 */
export interface OrganizationFeatures {
  voice_calls: FeatureState;
  video_calls: FeatureState;
  meetings: FeatureState;
  file_sharing: FeatureState;
  screen_sharing: FeatureState;
  message_reactions: FeatureState;
  message_editing: FeatureState;
  message_deletion: FeatureState;
  read_receipts: FeatureState;
  typing_indicators: FeatureState;
}

/**
 * Default feature states (all enabled)
 */
export const DEFAULT_FEATURES: OrganizationFeatures = {
  voice_calls: 'enabled',
  video_calls: 'enabled',
  meetings: 'enabled',
  file_sharing: 'enabled',
  screen_sharing: 'enabled',
  message_reactions: 'enabled',
  message_editing: 'enabled',
  message_deletion: 'enabled',
  read_receipts: 'enabled',
  typing_indicators: 'enabled',
};

/**
 * Feature metadata for UI display
 */
export const FEATURE_METADATA: Record<FeatureKey, Omit<FeatureToggle, 'state'>> = {
  voice_calls: {
    key: 'voice_calls',
    label: 'Voice Calls',
    description: 'Allow users to make voice calls within the chat',
    category: 'communication',
    disabledMessage: 'Voice calls are disabled by your organization',
  },
  video_calls: {
    key: 'video_calls',
    label: 'Video Calls',
    description: 'Allow users to make video calls within the chat',
    category: 'communication',
    disabledMessage: 'Video calls are disabled by your organization',
  },
  meetings: {
    key: 'meetings',
    label: 'Meetings',
    description: 'Allow users to schedule and join meetings',
    category: 'collaboration',
    disabledMessage: 'Meetings are disabled by your organization',
  },
  file_sharing: {
    key: 'file_sharing',
    label: 'File Sharing',
    description: 'Allow users to share files in chat',
    category: 'messaging',
    disabledMessage: 'File sharing is disabled by your organization',
  },
  screen_sharing: {
    key: 'screen_sharing',
    label: 'Screen Sharing',
    description: 'Allow users to share their screen during calls and meetings',
    category: 'collaboration',
    disabledMessage: 'Screen sharing is disabled by your organization',
  },
  message_reactions: {
    key: 'message_reactions',
    label: 'Message Reactions',
    description: 'Allow users to react to messages with emoji',
    category: 'messaging',
    disabledMessage: 'Message reactions are disabled by your organization',
  },
  message_editing: {
    key: 'message_editing',
    label: 'Message Editing',
    description: 'Allow users to edit their sent messages',
    category: 'messaging',
    disabledMessage: 'Message editing is disabled by your organization',
  },
  message_deletion: {
    key: 'message_deletion',
    label: 'Message Deletion',
    description: 'Allow users to delete their sent messages',
    category: 'messaging',
    disabledMessage: 'Message deletion is disabled by your organization',
  },
  read_receipts: {
    key: 'read_receipts',
    label: 'Read Receipts',
    description: 'Show when messages have been read by recipients',
    category: 'messaging',
    disabledMessage: 'Read receipts are disabled by your organization',
  },
  typing_indicators: {
    key: 'typing_indicators',
    label: 'Typing Indicators',
    description: 'Show when users are typing a message',
    category: 'messaging',
    disabledMessage: 'Typing indicators are disabled by your organization',
  },
};

/**
 * Feature toggle update event payload (for WebSocket)
 */
export interface FeatureToggleEvent {
  feature: FeatureKey;
  state: FeatureState;
  orgId: string;
  updatedBy: string;
  updatedAt: string;
}

/**
 * Helper to check if a feature is enabled
 */
export function isFeatureEnabled(
  features: Partial<OrganizationFeatures> | undefined,
  featureKey: FeatureKey
): boolean {
  if (!features) return true; // Default to enabled if no settings
  const state = features[featureKey];
  return state === undefined || state === 'enabled';
}

/**
 * Helper to get the message for a disabled/coming soon feature
 */
export function getFeatureDisabledMessage(
  features: Partial<OrganizationFeatures> | undefined,
  featureKey: FeatureKey
): string | null {
  if (!features) return null;
  const state = features[featureKey];
  if (state === 'disabled') {
    return FEATURE_METADATA[featureKey].disabledMessage || 'This feature is disabled by your organization';
  }
  if (state === 'coming_soon') {
    return 'Coming soon!';
  }
  return null;
}
