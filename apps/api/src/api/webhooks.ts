/**
 * Webhook Routes
 *
 * Handles webhooks from external services (LiveKit, etc.)
 */

import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '@neon/database';
import { verifyWebhook } from '../services/livekit';
import { AuditService } from '../services/audit';

const router = Router();

/**
 * POST /webhooks/livekit
 * Handle LiveKit webhooks
 */
router.post('/livekit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    // Verify webhook signature
    if (!verifyWebhook(JSON.stringify(req.body), authHeader)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const event = req.body;
    console.log('[Webhook] LiveKit event:', event.event);

    switch (event.event) {
      case 'room_started':
        await handleRoomStarted(event);
        break;

      case 'room_finished':
        await handleRoomFinished(event);
        break;

      case 'participant_joined':
        await handleParticipantJoined(event);
        break;

      case 'participant_left':
        await handleParticipantLeft(event);
        break;

      case 'egress_started':
        await handleEgressStarted(event);
        break;

      case 'egress_ended':
        await handleEgressEnded(event);
        break;

      default:
        console.log('[Webhook] Unhandled event:', event.event);
    }

    res.json({ received: true });
  } catch (error) {
    next(error);
  }
});

async function handleRoomStarted(event: any): Promise<void> {
  const roomName = event.room?.name;
  if (!roomName) return;

  // Handle meeting start
  if (roomName.startsWith('meeting-')) {
    const meetingId = roomName.replace('meeting-', '');
    await prisma.meeting.update({
      where: { id: meetingId },
      data: { status: 'IN_PROGRESS', actualStart: new Date() },
    });
  }
}

async function handleRoomFinished(event: any): Promise<void> {
  const roomName = event.room?.name;
  if (!roomName) return;

  // Handle meeting end
  if (roomName.startsWith('meeting-')) {
    const meetingId = roomName.replace('meeting-', '');
    await prisma.meeting.update({
      where: { id: meetingId },
      data: { status: 'ENDED', actualEnd: new Date() },
    });
  }

  // Handle call end
  if (roomName.startsWith('call-')) {
    await prisma.call.updateMany({
      where: { livekitRoom: roomName, endedAt: null },
      data: { endedAt: new Date(), endReason: 'completed' },
    });
  }
}

async function handleParticipantJoined(event: any): Promise<void> {
  const roomName = event.room?.name;
  const participantId = event.participant?.identity;
  if (!roomName || !participantId) return;

  console.log(`[Webhook] Participant ${participantId} joined ${roomName}`);
}

async function handleParticipantLeft(event: any): Promise<void> {
  const roomName = event.room?.name;
  const participantId = event.participant?.identity;
  if (!roomName || !participantId) return;

  console.log(`[Webhook] Participant ${participantId} left ${roomName}`);

  // Update meeting participant
  if (roomName.startsWith('meeting-')) {
    await prisma.meetingParticipant.updateMany({
      where: { meeting: { livekitRoom: roomName }, userId: participantId },
      data: { leftAt: new Date() },
    });
  }

  // Update call participant
  if (roomName.startsWith('call-')) {
    await prisma.callParticipant.updateMany({
      where: { call: { livekitRoom: roomName }, userId: participantId },
      data: { status: 'left', leftAt: new Date() },
    });
  }
}

async function handleEgressStarted(event: any): Promise<void> {
  const egressId = event.egress_info?.egress_id;
  const roomName = event.egress_info?.room_name;

  console.log(`[Webhook] Egress started: ${egressId} for room ${roomName}`);

  await AuditService.log({
    actorType: 'system',
    action: 'recording.started',
    resourceType: 'meeting',
    details: { egressId, roomName },
  });
}

async function handleEgressEnded(event: any): Promise<void> {
  const egressId = event.egress_info?.egress_id;
  const roomName = event.egress_info?.room_name;
  const fileUrl = event.egress_info?.file?.filename;

  console.log(`[Webhook] Egress ended: ${egressId}`);

  await AuditService.log({
    actorType: 'system',
    action: 'recording.ended',
    resourceType: 'meeting',
    details: { egressId, roomName, fileUrl },
  });

  // TODO: Create recording record and associate with meeting
}

export { router as webhooksRouter };
