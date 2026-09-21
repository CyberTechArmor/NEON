/**
 * MEET Service
 *
 * NEON does not run its own SFU. Calls and meetings are hosted by a MEET
 * deployment (github.com/CyberTechArmor/MEET) which the NEON client embeds,
 * so this module has only three jobs: mint a room code, build the join URL
 * the iframe points at, and end a meeting for everyone.
 *
 * Deliberately absent: access tokens. MEET's own `POST /api/token` issues the
 * LiveKit JWT to the browser when the embed joins, and derives the participant
 * identity from a per-device-and-window id rather than the display name — so
 * one person can join from a laptop and a phone, and two people sharing a name
 * never evict each other. Minting tokens here would undo that.
 */

import { getConfig } from '@neon/config';

const config = getConfig();

/** Characters MEET uses for room codes: no I, O, L, 0 or 1 — they misread aloud. */
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * The origin the embed runs on. Used as the postMessage target origin in the
 * client and in the CSP frame-src, so it must be an origin, not a URL.
 */
export function getMeetOrigin(): string {
  return new URL(config.meet.baseUrl).origin;
}

function localRoomCode(length = 6): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Ask MEET for a room code, falling back to a locally generated one.
 *
 * The fallback matters: a room code is just a string both sides agree on, so
 * a MEET that is briefly unreachable should not stop someone starting a call.
 * The code is only meaningful once a participant actually joins.
 */
export async function generateRoomCode(): Promise<string> {
  try {
    const response = await fetch(`${config.meet.apiUrl}/room-code`, {
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      const body = (await response.json()) as { roomCode?: string };
      if (body.roomCode) return body.roomCode;
    }

    console.warn(`[MEET] room-code returned ${response.status}; using a local code`);
  } catch (error) {
    console.warn(`[MEET] room-code unreachable (${(error as Error).message}); using a local code`);
  }

  return localRoomCode();
}

export interface JoinUrlOptions {
  /** Display name to pre-fill. Omit and MEET falls back to the browser's last name or a guest name. */
  name?: string;
  /** Hide MEET's own leave buttons, so NEON's chrome owns hanging up. Default true. */
  hideEndCall?: boolean;
}

/**
 * Build the URL the NEON client frames.
 *
 * `embed=1` is what keeps MEET's "create or join a room" screen from ever
 * appearing — the room has already been decided here. Note that invite links
 * shared with other people must carry only the room (MEET's identities are
 * per device and window now), which is why `name` is applied per viewer at
 * embed time rather than baked into anything shareable.
 */
export function buildJoinUrl(roomCode: string, options: JoinUrlOptions = {}): string {
  const { name, hideEndCall = true } = options;

  const url = new URL(config.meet.baseUrl);
  url.searchParams.set('room', roomCode);
  url.searchParams.set('embed', '1');
  if (name) url.searchParams.set('name', name);
  if (hideEndCall) url.searchParams.set('hideEndCall', '1');

  return url.toString();
}

/** Everything the client needs to embed one room. */
export interface MeetSession {
  url: string;
  room: string;
  origin: string;
}

export function buildMeetSession(roomCode: string, options: JoinUrlOptions = {}): MeetSession {
  return {
    url: buildJoinUrl(roomCode, options),
    room: roomCode,
    origin: getMeetOrigin(),
  };
}

/**
 * End the meeting for everyone. Best-effort: NEON's own record is the source
 * of truth for whether a call is over, so a MEET that refuses this should not
 * fail the request that closed the call.
 */
export async function endMeeting(roomCode: string, participantIdentity: string): Promise<boolean> {
  try {
    const response = await fetch(`${config.meet.apiUrl}/end-meeting`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomName: roomCode, participantIdentity }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      console.warn(`[MEET] end-meeting for ${roomCode} returned ${response.status}`);
      return false;
    }
    return true;
  } catch (error) {
    console.warn(`[MEET] end-meeting for ${roomCode} failed: ${(error as Error).message}`);
    return false;
  }
}

/** Liveness probe for the admin health panel. */
export async function checkMeetHealth(): Promise<{ healthy: boolean; message: string }> {
  try {
    const response = await fetch(`${config.meet.apiUrl}/health`, {
      signal: AbortSignal.timeout(5000),
    });

    return response.ok
      ? { healthy: true, message: `MEET reachable at ${config.meet.apiUrl}` }
      : { healthy: false, message: `MEET returned ${response.status}` };
  } catch (error) {
    return { healthy: false, message: `MEET not reachable: ${(error as Error).message}` };
  }
}
