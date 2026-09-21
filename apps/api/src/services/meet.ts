/**
 * MEET Service
 *
 * NEON does not run its own SFU. Calls and meetings are hosted by a MEET
 * deployment (github.com/CyberTechArmor/MEET) which the NEON client embeds,
 * so this module has only three jobs: mint a room code, build the join URL
 * the iframe points at, and end a meeting for everyone.
 *
 * Where MEET lives is NOT configuration of this server. Each organisation
 * points at its own MEET through Admin → Integrations, which writes the
 * `MeetIntegration` row (base URL + API key), and that row is the single
 * source of truth: the admin routes, the calls and meetings routes, the
 * health panel and the embed all read it through here. There is no
 * MEET_BASE_URL / MEET_API_URL — an env path would be a second place for the
 * same fact to drift.
 *
 * Deliberately absent: access tokens. MEET's own `POST /api/token` issues the
 * LiveKit JWT to the browser when the embed joins, and derives the participant
 * identity from a per-device-and-window id rather than the display name — so
 * one person can join from a laptop and a phone, and two people sharing a name
 * never evict each other. Minting tokens here would undo that.
 */

import { prisma } from '@neon/database';
import { AppError, ErrorCodes } from '@neon/shared';

/** The part of the `MeetIntegration` row this service reads. */
export interface MeetIntegration {
  /** Public origin of the MEET SPA, no trailing slash (as the admin route stores it). */
  baseUrl: string;
  /** Sent as `X-API-Key` on MEET's REST API. */
  apiKey: string;
  enabled: boolean;
  autoJoin: boolean;
  /** auto | high | max | balanced | low */
  defaultQuality: string;
}

/** Characters MEET uses for room codes: no I, O, L, 0 or 1 — they misread aloud. */
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const FETCH_TIMEOUT_MS = 5000;

/**
 * The organisation's MEET integration, or null when none is configured.
 * A disabled integration is returned too — callers that need a usable one
 * go through `requireMeetIntegration`.
 */
export async function getMeetIntegration(orgId: string): Promise<MeetIntegration | null> {
  const row = await prisma.meetIntegration.findUnique({
    where: { orgId },
    select: { baseUrl: true, apiKey: true, enabled: true, autoJoin: true, defaultQuality: true },
  });
  if (!row) return null;
  return { ...row, baseUrl: row.baseUrl.replace(/\/$/, '') };
}

/**
 * The organisation's MEET integration, configured and enabled — or a 404
 * with the same code and wording the admin routes use, so the client can
 * tell "no MEET" apart from any other failure.
 */
export async function requireMeetIntegration(orgId: string): Promise<MeetIntegration> {
  const integration = await getMeetIntegration(orgId);
  if (!integration || !integration.enabled) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'MEET integration is not configured or disabled', {
      details: { code: 'NOT_CONFIGURED' },
    });
  }
  return integration;
}

/** MEET's REST API base — the SPA origin plus `/api`, which is where MEET mounts it. */
export function getMeetApiUrl(integration: Pick<MeetIntegration, 'baseUrl'>): string {
  return `${integration.baseUrl}/api`;
}

/**
 * The origin the embed runs on. Used as the postMessage target origin in the
 * client, so it must be an origin, not a URL.
 */
export function getMeetOrigin(integration: Pick<MeetIntegration, 'baseUrl'>): string {
  return new URL(integration.baseUrl).origin;
}

function apiHeaders(integration: Pick<MeetIntegration, 'apiKey'>, extra: Record<string, string> = {}) {
  return { Accept: 'application/json', 'X-API-Key': integration.apiKey, ...extra };
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
export async function generateRoomCode(integration: MeetIntegration): Promise<string> {
  try {
    const response = await fetch(`${getMeetApiUrl(integration)}/room-code`, {
      headers: apiHeaders(integration),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
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
  /**
   * Display name to pre-fill FOR THIS VIEWER. Only ever set on a URL handed to
   * the person it names; never on anything shareable (see buildJoinUrl).
   */
  name?: string;
  /** Override the integration's default quality (auto | high | max | balanced | low). */
  quality?: string;
}

/**
 * Build the URL the NEON client frames.
 *
 * Every URL built here carries:
 *   - `embed=1`      — MEET never shows its "create or join a room" screen;
 *                      the room has already been decided here.
 *   - `hideEndCall=1` — MEET hides BOTH its "Leave call" and "End meeting for
 *                      all" buttons. NEON owns leaving: its own button posts
 *                      `meet:leave` over the bridge and closes the call when
 *                      MEET reports `meet:left`. Two sets of hang-up buttons
 *                      in one frame is exactly what this prevents.
 *   - `autojoin=true` — when the integration says so.
 *
 * `name` is applied per viewer at embed time and is the only thing that
 * differs between two people's URLs. Anything shareable — an invite, a link
 * in a message — must carry only the room: MEET's participant identities are
 * per device and per window, so a name baked into a shared link would
 * pre-fill the inviter's name for everyone who opens it.
 */
export function buildJoinUrl(
  integration: Pick<MeetIntegration, 'baseUrl' | 'autoJoin' | 'defaultQuality'>,
  roomCode: string,
  options: JoinUrlOptions = {}
): string {
  const url = new URL(`${integration.baseUrl}/`);
  url.searchParams.set('room', roomCode);
  url.searchParams.set('embed', '1');
  url.searchParams.set('hideEndCall', '1');
  if (options.name) url.searchParams.set('name', options.name);
  if (integration.autoJoin) url.searchParams.set('autojoin', 'true');

  const quality = options.quality || integration.defaultQuality;
  if (quality && quality !== 'auto') url.searchParams.set('quality', quality);

  return url.toString();
}

/** Everything the client needs to embed one room. */
export interface MeetSession {
  url: string;
  room: string;
  origin: string;
}

export function buildMeetSession(
  integration: MeetIntegration,
  roomCode: string,
  options: JoinUrlOptions = {}
): MeetSession {
  return {
    url: buildJoinUrl(integration, roomCode, options),
    room: roomCode,
    origin: getMeetOrigin(integration),
  };
}

/**
 * End the meeting for everyone. Best-effort: NEON's own record is the source
 * of truth for whether a call is over, so a MEET that refuses this should not
 * fail the request that closed the call.
 */
export async function endMeeting(
  integration: MeetIntegration,
  roomCode: string,
  participantIdentity: string
): Promise<boolean> {
  try {
    const response = await fetch(`${getMeetApiUrl(integration)}/end-meeting`, {
      method: 'POST',
      headers: apiHeaders(integration, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ roomName: roomCode, participantIdentity }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
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

/** Liveness probe for the admin health panel — the organisation's MEET, or "not configured". */
export async function checkMeetHealth(orgId: string): Promise<{ healthy: boolean; message: string }> {
  const integration = await getMeetIntegration(orgId);
  if (!integration) {
    return { healthy: false, message: 'MEET integration not configured (Admin → Integrations)' };
  }
  if (!integration.enabled) {
    return { healthy: false, message: 'MEET integration is disabled' };
  }

  try {
    const response = await fetch(`${integration.baseUrl}/health`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    return response.ok
      ? { healthy: true, message: `MEET reachable at ${integration.baseUrl}` }
      : { healthy: false, message: `MEET returned ${response.status}` };
  } catch (error) {
    return { healthy: false, message: `MEET not reachable: ${(error as Error).message}` };
  }
}
