/**
 * Call Routes
 *
 * Instant calls (non-scheduled)
 */

import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '@neon/database';
import { initiateCallSchema } from '@neon/shared';
import { NotFoundError, ForbiddenError } from '@neon/shared';
import { authenticate } from '../middleware/auth';
import { canCommunicate } from '../services/permissions';
import { generateRoomCode, buildMeetSession, endMeeting } from '../services/meet';
import { sendNotification } from '../socket';

const router = Router();
router.use(authenticate);

/**
 * POST /calls
 * Initiate a call
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = initiateCallSchema.parse(req.body);

    // Check permissions for all participants
    for (const participantId of data.participantIds) {
      const { allowed, reason } = await canCommunicate(
        req.userId!,
        participantId,
        req.orgId!,
        'call'
      );

      if (!allowed) {
        throw new ForbiddenError(reason || 'Cannot call this user');
      }
    }

    // `livekitRoom` is the historical column name; it now holds a MEET room
    // code. Kept as-is so this needs no migration.
    const roomName = await generateRoomCode();

    const call = await prisma.call.create({
      data: {
        orgId: req.orgId!,
        initiatorId: req.userId!,
        isGroupCall: data.participantIds.length > 1,
        conversationId: data.conversationId,
        livekitRoom: roomName,
        participants: {
          create: [
            { userId: req.userId!, status: 'connected', joinedAt: new Date() },
            ...data.participantIds.map((id) => ({ userId: id, status: 'invited' })),
          ],
        },
      },
      include: {
        initiator: { select: { id: true, displayName: true, avatarUrl: true } },
        participants: {
          include: {
            user: { select: { id: true, displayName: true, avatarUrl: true } },
          },
        },
      },
    });

    // The initiator is whoever joins first, which MEET decides on its own —
    // it reports isHost back over the embed bridge.
    const meet = buildMeetSession(roomName, { name: req.user!.displayName });

    // Send call notifications to other participants
    for (const participantId of data.participantIds) {
      await sendNotification(participantId, {
        id: call.id,
        type: 'CALL',
        title: 'Incoming Call',
        body: `${req.user!.displayName} is calling you`,
        data: { callId: call.id },
      });
    }

    res.status(201).json({
      success: true,
      data: {
        call,
        meet,
        roomName,
      },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /calls/:id/answer
 * Answer a call
 */
router.post('/:id/answer', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const participant = await prisma.callParticipant.findFirst({
      where: { callId: req.params.id, userId: req.userId! },
      include: { call: true },
    });

    if (!participant) {
      throw new NotFoundError('Call', req.params.id);
    }

    if (participant.status !== 'invited') {
      throw new ForbiddenError('Call already answered or declined');
    }

    await prisma.callParticipant.update({
      where: { id: participant.id },
      data: { status: 'connected', joinedAt: new Date() },
    });

    // Update call status if first answer
    if (!participant.call.answeredAt) {
      await prisma.call.update({
        where: { id: req.params.id },
        data: { answeredAt: new Date() },
      });
    }

    const meet = buildMeetSession(participant.call.livekitRoom, {
      name: req.user!.displayName,
    });

    res.json({
      success: true,
      data: {
        meet,
        roomName: participant.call.livekitRoom,
      },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /calls/:id/decline
 * Decline a call
 */
router.post('/:id/decline', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const participant = await prisma.callParticipant.findFirst({
      where: { callId: req.params.id, userId: req.userId! },
    });

    if (!participant) {
      throw new NotFoundError('Call', req.params.id);
    }

    await prisma.callParticipant.update({
      where: { id: participant.id },
      data: { status: 'left', leftAt: new Date() },
    });

    // Check if all participants declined
    const remainingInvited = await prisma.callParticipant.count({
      where: { callId: req.params.id, status: 'invited' },
    });

    if (remainingInvited === 0) {
      await prisma.call.update({
        where: { id: req.params.id },
        data: { endedAt: new Date(), endReason: 'declined' },
      });
    }

    res.json({
      success: true,
      data: { message: 'Call declined' },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /calls/:id/join
 * Join a call that is already under way.
 *
 * Distinct from /answer, which is the one-time transition out of `invited`.
 * Joining is idempotent: reloading the tab, or rejoining after a drop, comes
 * back here and should simply hand back the room again.
 */
router.post('/:id/join', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const participant = await prisma.callParticipant.findFirst({
      where: { callId: req.params.id, userId: req.userId! },
      include: { call: true },
    });

    if (!participant) {
      throw new NotFoundError('Call', req.params.id);
    }

    if (participant.call.endedAt) {
      throw new ForbiddenError('This call has ended');
    }

    if (participant.status !== 'connected') {
      await prisma.callParticipant.update({
        where: { id: participant.id },
        data: { status: 'connected', joinedAt: participant.joinedAt ?? new Date(), leftAt: null },
      });
    }

    res.json({
      success: true,
      data: {
        meet: buildMeetSession(participant.call.livekitRoom, {
          name: req.user!.displayName,
        }),
        roomName: participant.call.livekitRoom,
      },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /calls/:id/end
 * End a call
 */
router.post('/:id/end', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const call = await prisma.call.update({
      where: { id: req.params.id },
      data: { endedAt: new Date(), endReason: 'completed' },
    });

    // Tear the MEET room down too, so anyone still in it is disconnected
    // rather than left talking to a call NEON considers over. Best-effort.
    await endMeeting(call.livekitRoom, `neon-${req.userId!}`);

    await prisma.callParticipant.updateMany({
      where: { callId: req.params.id, status: { in: ['invited', 'joining', 'connected'] } },
      data: { status: 'left', leftAt: new Date() },
    });

    res.json({
      success: true,
      data: { message: 'Call ended' },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

export { router as callsRouter };
