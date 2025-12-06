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
import { getLiveKitToken } from '../services/livekit';
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

    const roomName = `call-${Date.now()}-${Math.random().toString(36).substring(7)}`;

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

    // Get LiveKit token for initiator
    const token = await getLiveKitToken(roomName, req.userId!, req.user!.displayName, {
      isHost: true,
    });

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
        livekitUrl: process.env.LIVEKIT_URL,
        token,
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

    const token = await getLiveKitToken(
      participant.call.livekitRoom,
      req.userId!,
      req.user!.displayName
    );

    res.json({
      success: true,
      data: {
        livekitUrl: process.env.LIVEKIT_URL,
        token,
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
 * POST /calls/:id/end
 * End a call
 */
router.post('/:id/end', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.call.update({
      where: { id: req.params.id },
      data: { endedAt: new Date(), endReason: 'completed' },
    });

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
