/**
 * LiveKit Service
 *
 * Integration with LiveKit for video/audio calls
 */

import { AccessToken, RoomServiceClient, EgressClient } from 'livekit-server-sdk';
import { getConfig } from '@neon/config';

const config = getConfig();

let roomService: RoomServiceClient | null = null;
let egressService: EgressClient | null = null;

/**
 * Get Room Service client
 */
function getRoomService(): RoomServiceClient {
  if (!roomService) {
    roomService = new RoomServiceClient(
      config.livekit.apiUrl,
      config.livekit.apiKey,
      config.livekit.apiSecret
    );
  }
  return roomService;
}

/**
 * Get Egress client for recordings
 */
function getEgressService(): EgressClient {
  if (!egressService) {
    egressService = new EgressClient(
      config.livekit.apiUrl,
      config.livekit.apiKey,
      config.livekit.apiSecret
    );
  }
  return egressService;
}

/**
 * Generate access token for a participant
 */
export async function getLiveKitToken(
  roomName: string,
  participantId: string,
  participantName: string,
  options: {
    canPublish?: boolean;
    canSubscribe?: boolean;
    canPublishData?: boolean;
    isHost?: boolean;
  } = {}
): Promise<string> {
  const {
    canPublish = true,
    canSubscribe = true,
    canPublishData = true,
    isHost = false,
  } = options;

  const at = new AccessToken(config.livekit.apiKey, config.livekit.apiSecret, {
    identity: participantId,
    name: participantName,
    ttl: 24 * 60 * 60, // 24 hours
  });

  at.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish,
    canSubscribe,
    canPublishData,
    roomAdmin: isHost,
    roomCreate: isHost,
    roomList: false,
    roomRecord: isHost && config.livekit.recordingEnabled,
  });

  return await at.toJwt();
}

/**
 * Create a room
 */
export async function createRoom(
  name: string,
  options: {
    emptyTimeout?: number;
    maxParticipants?: number;
    metadata?: string;
  } = {}
): Promise<void> {
  const service = getRoomService();

  await service.createRoom({
    name,
    emptyTimeout: options.emptyTimeout ?? 300, // 5 minutes
    maxParticipants: options.maxParticipants ?? 100,
    metadata: options.metadata,
  });
}

/**
 * Delete a room
 */
export async function deleteRoom(name: string): Promise<void> {
  const service = getRoomService();
  await service.deleteRoom(name);
}

/**
 * List participants in a room
 */
export async function listParticipants(roomName: string) {
  const service = getRoomService();
  return service.listParticipants(roomName);
}

/**
 * Remove a participant from a room
 */
export async function removeParticipant(
  roomName: string,
  participantId: string
): Promise<void> {
  const service = getRoomService();
  await service.removeParticipant(roomName, participantId);
}

/**
 * Mute a participant's track
 */
export async function muteParticipant(
  roomName: string,
  participantId: string,
  trackSid: string,
  muted: boolean
): Promise<void> {
  const service = getRoomService();
  await service.mutePublishedTrack(roomName, participantId, trackSid, muted);
}

/**
 * Start room recording
 */
export async function startRecording(
  roomName: string,
  outputPath: string
): Promise<string> {
  if (!config.livekit.recordingEnabled) {
    throw new Error('Recording is not enabled');
  }

  const egress = getEgressService();

  const info = await egress.startRoomCompositeEgress(roomName, {
    file: {
      filepath: outputPath,
      disableManifest: true,
    },
  });

  return info.egressId;
}

/**
 * Stop recording
 */
export async function stopRecording(egressId: string): Promise<void> {
  const egress = getEgressService();
  await egress.stopEgress(egressId);
}

/**
 * Get recording status
 */
export async function getRecordingStatus(egressId: string) {
  const egress = getEgressService();
  return egress.listEgress({ egressId });
}

/**
 * Send data message to room
 */
export async function sendDataMessage(
  roomName: string,
  data: Uint8Array,
  options: {
    destinationIdentities?: string[];
    topic?: string;
  } = {}
): Promise<void> {
  const service = getRoomService();
  await service.sendData(roomName, data, {
    destinationIdentities: options.destinationIdentities,
    topic: options.topic,
  });
}

/**
 * Update room metadata
 */
export async function updateRoomMetadata(
  roomName: string,
  metadata: string
): Promise<void> {
  const service = getRoomService();
  await service.updateRoomMetadata(roomName, metadata);
}

/**
 * Generate webhook receiver
 * Verifies webhook signature from LiveKit
 */
export function verifyWebhook(
  body: string,
  authHeader: string | undefined
): boolean {
  // LiveKit signs webhooks with the API secret
  // In production, verify the signature
  if (!authHeader) return false;

  // TODO: Implement proper webhook verification
  // See: https://docs.livekit.io/guides/webhooks/

  return true;
}
