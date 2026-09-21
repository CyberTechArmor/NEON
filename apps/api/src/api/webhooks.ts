/**
 * Webhook Routes
 *
 * NEON no longer runs its own LiveKit, so there is no `/webhooks/livekit`
 * endpoint any more. Call and meeting lifecycle — who joined, who left, when
 * the room emptied — now comes from the MEET embed itself over its
 * postMessage bridge, which the client turns into ordinary authenticated
 * calls against /calls/:id and /meetings/:id.
 *
 * That is deliberately better than what it replaced: the old handler accepted
 * any request whose `verifyWebhook` returned true, and that function was a
 * stub that returned true unconditionally — anyone who could reach the URL
 * could end any call or mark any participant as gone.
 *
 * If server-to-server events are wanted later, MEET has its own signed
 * webhook API (POST /api/webhooks, events documented in MEET's API.md) and
 * that is where a replacement belongs — with its signature actually checked.
 */

import { Router } from 'express';

const router = Router();

export { router as webhooksRouter };
