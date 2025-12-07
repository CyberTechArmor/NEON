/**
 * Conversation Routes
 */

import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '@neon/database';
import { createConversationSchema, updateConversationSchema, addParticipantsSchema, cursorPaginationSchema } from '@neon/shared';
import { NotFoundError, ForbiddenError, ValidationError } from '@neon/shared';
import { authenticate } from '../middleware/auth';
import { canCommunicate, canFreeze } from '../services/permissions';
import { AuditService } from '../services/audit';
import { CHAT_LIMITS } from '@neon/shared';

const router = Router();
router.use(authenticate);

/**
 * GET /conversations
 * List user's conversations
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cursor, limit } = cursorPaginationSchema.parse(req.query);

    const conversations = await prisma.conversation.findMany({
      where: {
        orgId: req.orgId!,
        deletedAt: null,
        participants: { some: { userId: req.userId!, leftAt: null } },
      },
      include: {
        participants: {
          where: { leftAt: null },
          include: {
            user: {
              select: { id: true, displayName: true, avatarUrl: true, presenceStatus: true },
            },
          },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });

    const hasMore = conversations.length > limit;
    const data = hasMore ? conversations.slice(0, -1) : conversations;

    res.json({
      success: true,
      data,
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
        pagination: {
          cursor: data.length > 0 ? data[data.length - 1]!.id : null,
          hasMore,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /conversations
 * Create new conversation
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createConversationSchema.parse(req.body);

    // Validate participants
    if (data.type === 'DIRECT' && data.participantIds.length !== 1) {
      throw new ValidationError('Direct conversations must have exactly one other participant');
    }

    if (data.type === 'GROUP') {
      if (data.participantIds.length > CHAT_LIMITS.MAX_GROUP_PARTICIPANTS - 1) {
        throw new ValidationError(`Groups cannot have more than ${CHAT_LIMITS.MAX_GROUP_PARTICIPANTS} participants`);
      }
      if (!data.name) {
        throw new ValidationError('Group name is required');
      }
    }

    // Check permissions for each participant
    for (const participantId of data.participantIds) {
      const { allowed, requiresApproval, reason } = await canCommunicate(
        req.userId!,
        participantId,
        req.orgId!
      );

      if (!allowed && !requiresApproval) {
        throw new ForbiddenError(reason || 'Cannot communicate with this user');
      }
    }

    // Check for existing direct conversation
    if (data.type === 'DIRECT') {
      const existing = await prisma.conversation.findFirst({
        where: {
          type: 'DIRECT',
          orgId: req.orgId!,
          deletedAt: null,
          AND: [
            { participants: { some: { userId: req.userId!, leftAt: null } } },
            { participants: { some: { userId: data.participantIds[0], leftAt: null } } },
          ],
        },
      });

      if (existing) {
        return res.json({
          success: true,
          data: existing,
          meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
        });
      }
    }

    const conversation = await prisma.conversation.create({
      data: {
        orgId: req.orgId!,
        type: data.type,
        name: data.name,
        description: data.description,
        createdBy: req.userId,
        participants: {
          create: [
            { userId: req.userId!, isOwner: data.type === 'GROUP', isAdmin: data.type === 'GROUP' },
            ...data.participantIds.map((id) => ({ userId: id })),
          ],
        },
      },
      include: {
        participants: {
          include: {
            user: { select: { id: true, displayName: true, avatarUrl: true } },
          },
        },
      },
    });

    return res.status(201).json({
      success: true,
      data: conversation,
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /conversations/:id
 * Get conversation by ID
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: req.params.id,
        orgId: req.orgId!,
        deletedAt: null,
        participants: { some: { userId: req.userId!, leftAt: null } },
      },
      include: {
        participants: {
          where: { leftAt: null },
          include: {
            user: {
              select: { id: true, displayName: true, avatarUrl: true, presenceStatus: true },
            },
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundError('Conversation', req.params.id);
    }

    res.json({
      success: true,
      data: conversation,
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /conversations/:id
 * Update conversation (groups only)
 */
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateConversationSchema.parse(req.body);

    const participant = await prisma.conversationParticipant.findFirst({
      where: {
        conversationId: req.params.id,
        userId: req.userId!,
        leftAt: null,
      },
    });

    if (!participant?.isAdmin && !participant?.isOwner) {
      throw new ForbiddenError('Only admins can update the conversation');
    }

    const conversation = await prisma.conversation.update({
      where: { id: req.params.id },
      data,
    });

    res.json({
      success: true,
      data: conversation,
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /conversations/:id/participants
 * Add participants to group
 */
router.post('/:id/participants', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userIds } = addParticipantsSchema.parse(req.body);

    const participant = await prisma.conversationParticipant.findFirst({
      where: {
        conversationId: req.params.id,
        userId: req.userId!,
        leftAt: null,
      },
      include: { conversation: true },
    });

    if (!participant?.isAdmin && !participant?.isOwner) {
      throw new ForbiddenError('Only admins can add participants');
    }

    if (participant.conversation.type !== 'GROUP') {
      throw new ValidationError('Cannot add participants to direct conversations');
    }

    // Check permissions and add participants
    for (const userId of userIds) {
      const { allowed } = await canCommunicate(req.userId!, userId, req.orgId!);
      if (allowed) {
        await prisma.conversationParticipant.upsert({
          where: {
            conversationId_userId: { conversationId: req.params.id!, userId },
          },
          create: { conversationId: req.params.id!, userId },
          update: { leftAt: null, removedAt: null },
        });
      }
    }

    res.json({
      success: true,
      data: { message: 'Participants added' },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /conversations/:id/participants/:userId
 * Remove participant from group
 */
router.delete('/:id/participants/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const isLeavingSelf = req.params.userId === req.userId;

    if (!isLeavingSelf) {
      const participant = await prisma.conversationParticipant.findFirst({
        where: {
          conversationId: req.params.id,
          userId: req.userId!,
          leftAt: null,
        },
      });

      if (!participant?.isAdmin && !participant?.isOwner) {
        throw new ForbiddenError('Only admins can remove participants');
      }
    }

    await prisma.conversationParticipant.update({
      where: {
        conversationId_userId: {
          conversationId: req.params.id!,
          userId: req.params.userId!,
        },
      },
      data: isLeavingSelf
        ? { leftAt: new Date() }
        : { removedAt: new Date(), removedBy: req.userId },
    });

    res.json({
      success: true,
      data: { message: isLeavingSelf ? 'Left conversation' : 'Participant removed' },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /conversations/:id/freeze
 * Freeze conversation for a user
 */
router.post('/:id/freeze', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.body;

    const canFreezeUser = await canFreeze(req.userId!, userId, req.orgId!);
    if (!canFreezeUser) {
      throw new ForbiddenError('Cannot freeze this user');
    }

    await prisma.conversationParticipant.update({
      where: {
        conversationId_userId: { conversationId: req.params.id!, userId },
      },
      data: {
        isFrozen: true,
        frozenBy: req.userId,
        frozenAt: new Date(),
      },
    });

    await AuditService.log({
      action: 'conversation.frozen',
      resourceType: 'conversation',
      resourceId: req.params.id,
      actorId: req.userId,
      orgId: req.orgId,
      details: { frozenUserId: userId },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: { message: 'User frozen in conversation' },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

export { router as conversationsRouter };
