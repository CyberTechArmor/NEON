/**
 * Meeting & Call Types
 *
 * Types for scheduled meetings, instant calls, and LiveKit integration
 */

// =============================================================================
// Meetings
// =============================================================================

export type MeetingStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'ENDED' | 'CANCELLED';

export type MeetingRecurrence = 'NONE' | 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';

export interface Meeting {
  id: string;
  title: string;
  description: string | null;
  scheduledStart: string;
  scheduledEnd: string;
  timezone: string;
  recurrence: MeetingRecurrence;
  status: MeetingStatus;
  actualStart: string | null;
  actualEnd: string | null;
  creator: MeetingParticipantInfo;
  participants: MeetingParticipant[];
  settings: MeetingSettings;
  joinUrl: string;
  hasRecording: boolean;
  createdAt: string;
}

export interface MeetingParticipant {
  id: string;
  user: MeetingParticipantInfo;
  isHost: boolean;
  canPresent: boolean;
  canUnmute: boolean;
  responseStatus: 'accepted' | 'declined' | 'tentative' | null;
  joinedAt: string | null;
}

export interface MeetingParticipantInfo {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface MeetingSettings {
  waitingRoomEnabled: boolean;
  joinBeforeHost: boolean;
  allowScreenShare: boolean;
  allowRecording: boolean;
  muteOnJoin: boolean;
  videoOffOnJoin: boolean;
}

export interface MeetingReminder {
  minutesBefore: number;
  overrideDnd: boolean;
}

// =============================================================================
// Create/Update DTOs
// =============================================================================

export interface CreateMeetingRequest {
  title: string;
  description?: string;
  scheduledStart: string; // ISO datetime
  scheduledEnd: string;
  timezone?: string;
  recurrence?: MeetingRecurrence;
  participantIds: string[];
  settings?: Partial<MeetingSettings>;
  reminders?: MeetingReminder[];
}

export interface UpdateMeetingRequest {
  title?: string;
  description?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  timezone?: string;
  settings?: Partial<MeetingSettings>;
}

export interface RespondToMeetingRequest {
  response: 'accepted' | 'declined' | 'tentative';
}

// =============================================================================
// Meeting Join
// =============================================================================

export interface JoinMeetingRequest {
  meetingId: string;
}

export interface JoinMeetingResponse {
  meeting: Meeting;
  livekitUrl: string;
  token: string; // LiveKit token
  roomName: string;
}

// =============================================================================
// Instant Calls
// =============================================================================

export interface Call {
  id: string;
  isGroupCall: boolean;
  conversationId: string | null;
  initiator: CallParticipantInfo;
  participants: CallParticipant[];
  status: CallStatus;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  endReason: CallEndReason | null;
}

export type CallStatus = 'ringing' | 'connecting' | 'connected' | 'ended';

export type CallEndReason = 'completed' | 'missed' | 'declined' | 'failed' | 'busy';

export interface CallParticipant {
  id: string;
  user: CallParticipantInfo;
  status: 'invited' | 'joining' | 'connected' | 'left';
  joinedAt: string | null;
  leftAt: string | null;
}

export interface CallParticipantInfo {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

// =============================================================================
// Call Actions
// =============================================================================

export interface InitiateCallRequest {
  participantIds: string[];
  conversationId?: string;
  isVideo?: boolean;
}

export interface InitiateCallResponse {
  call: Call;
  livekitUrl: string;
  token: string;
  roomName: string;
}

export interface AnswerCallRequest {
  callId: string;
}

export interface AnswerCallResponse {
  call: Call;
  livekitUrl: string;
  token: string;
  roomName: string;
}

// =============================================================================
// Recordings
// =============================================================================

export interface Recording {
  id: string;
  meetingId: string;
  meetingTitle: string;
  startedAt: string;
  endedAt: string | null;
  duration: number | null; // Seconds
  fileSize: number | null;
  url: string;
  thumbnailUrl: string | null;
  transcriptionStatus: TranscriptionStatus | null;
  shareLink: string | null;
  isPublic: boolean;
  createdAt: string;
}

export type TranscriptionStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface CreateShareLinkRequest {
  public?: boolean;
  expiresAt?: string;
}

export interface CreateShareLinkResponse {
  shareLink: string;
  expiresAt: string | null;
}

// =============================================================================
// LiveKit Events
// =============================================================================

export interface LiveKitRoomEvent {
  type: 'participant_joined' | 'participant_left' | 'track_published' | 'track_unpublished';
  roomName: string;
  participantId: string;
  participantName: string;
  timestamp: string;
}

export interface LiveKitRecordingEvent {
  type: 'recording_started' | 'recording_stopped' | 'recording_failed';
  roomName: string;
  recordingId: string;
  timestamp: string;
  error?: string;
}
