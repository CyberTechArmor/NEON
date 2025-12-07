/**
 * Message Routes
 */

import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '@neon/database';
import { sendMessageSchema, editMessageSchema, addReactionSchema, cursorPaginationSchema } from '@neon/shared';
import { NotFoundError, ForbiddenError, FrozenConversationError } from '@neon/shared';
import { authenticate } from '../middleware/auth';
import { broadcastToConversation } from '../socket';
import { SocketEvents } from '@neon/shared';
import { AuditService } from '../services/audit';

const router = Router();
router.use(authenticate);

/**
 * GET /messages
 * Get messages for a conversation
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cursor, limit } = cursorPaginationSchema.parse(req.query);
    const conversationId = req.query.conversationId as string;

    if (!conversationId) {
      throw new Error('conversationId is required');
    }

    // Verify user is participant
    const participant = await prisma.conversationParticipant.findFirst({
      where: {
        conversationId,
        userId: req.userId!,
        leftAt: null,
      },
    });

    if (!participant) {
      throw new ForbiddenError('Not a participant in this conversation');
    }

    const messages = await prisma.message.findMany({
      where: {
        conversationId,
        deletedAt: null,
      },
      include: {
        sender: {
          select: { id: true, displayName: true, avatarUrl: true },
        },
        reactions: {
          include: {
            user: { select: { id: true, displayName: true } },
          },
        },
        files: {
          include: { file: true },
        },
        replyTo: {
          include: {
            sender: { select: { id: true, displayName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });

    const hasMore = messages.length > limit;
    const data = hasMore ? messages.slice(0, -1) : messages;

    res.json({
      success: true,
      data: data.reverse(), // Return in chronological order
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
        pagination: {
          cursor: data.length > 0 ? data[0]!.id : null,
          hasMore,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /messages
 * Send a message
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const conversationId = req.query.conversationId as string || req.body.conversationId;
    const data = sendMessageSchema.parse(req.body);

    // Check participant status
    const participant = await prisma.conversationParticipant.findFirst({
      where: {
        conversationId,
        userId: req.userId!,
        leftAt: null,
      },
    });

    if (!participant) {
      throw new ForbiddenError('Not a participant in this conversation');
    }

    if (participant.isFrozen) {
      throw new FrozenConversationError();
    }

    if (!participant.canSendMessages || participant.isMuted) {
      throw new ForbiddenError('You cannot send messages in this conversation');
    }

    const message = await prisma.message.create({
      data: {
        conversationId,
        senderId: req.userId!,
        type: data.fileIds?.length ? 'FILE' : 'TEXT',
        content: data.content,
        replyToId: data.replyToId,
        files: data.fileIds?.length
          ? {
              create: data.fileIds.map((fileId, index) => ({
                fileId,
                order: index,
              })),
            }
          : undefined,
      },
      include: {
        sender: {
          select: { id: true, displayName: true, avatarUrl: true },
        },
        reactions: true,
        files: { include: { file: true } },
        replyTo: {
          include: {
            sender: { select: { id: true, displayName: true } },
          },
        },
      },
    });

    // Update conversation last message
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: new Date(),
        lastMessagePreview: data.content?.substring(0, 100) ?? '[Attachment]',
      },
    });

    // Broadcast to conversation
    broadcastToConversation(conversationId, SocketEvents.MESSAGE_RECEIVED, message);

    res.status(201).json({
      success: true,
      data: message,
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /messages/:id
 * Edit a message
 */
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { content } = editMessageSchema.parse(req.body);

    const message = await prisma.message.findUnique({
      where: { id: req.params.id },
    });

    if (!message) {
      throw new NotFoundError('Message', req.params.id);
    }

    if (message.senderId !== req.userId) {
      throw new ForbiddenError('Can only edit your own messages');
    }

    const updated = await prisma.message.update({
      where: { id: req.params.id },
      data: {
        content,
        editedAt: new Date(),
        originalContent: message.originalContent ?? message.content,
      },
    });

    broadcastToConversation(message.conversationId, SocketEvents.MESSAGE_EDITED, {
      messageId: updated.id,
      conversationId: message.conversationId,
      content: updated.content,
      editedAt: updated.editedAt,
    });

    await AuditService.log({
      action: 'message.edited',
      resourceType: 'message',
      resourceId: message.id,
      actorId: req.userId,
      orgId: req.orgId,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: updated,
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /messages/:id
 * Delete a message (soft delete)
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const message = await prisma.message.findUnique({
      where: { id: req.params.id },
      include: { conversation: true },
    });

    if (!message) {
      throw new NotFoundError('Message', req.params.id);
    }

    const canDeleteAny = req.user?.permissions.includes('messages:delete_any');
    if (message.senderId !== req.userId && !canDeleteAny) {
      throw new ForbiddenError('Can only delete your own messages');
    }

    await prisma.message.update({
      where: { id: req.params.id },
      data: {
        deletedAt: new Date(),
        deletedBy: req.userId,
      },
    });

    broadcastToConversation(message.conversationId, SocketEvents.MESSAGE_DELETED, {
      messageId: message.id,
      conversationId: message.conversationId,
      deletedBy: req.userId,
    });

    await AuditService.log({
      action: 'message.deleted',
      resourceType: 'message',
      resourceId: message.id,
      actorId: req.userId,
      orgId: req.orgId,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: { message: 'Message deleted' },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /messages/:id/reactions
 * Add reaction to message
 */
router.post('/:id/reactions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { emoji } = addReactionSchema.parse(req.body);

    const message = await prisma.message.findUnique({
      where: { id: req.params.id },
    });

    if (!message) {
      throw new NotFoundError('Message', req.params.id);
    }

    const messageId = req.params.id!;
    const reaction = await prisma.messageReaction.upsert({
      where: {
        messageId_userId_emoji: {
          messageId,
          userId: req.userId!,
          emoji,
        },
      },
      create: {
        messageId,
        userId: req.userId!,
        emoji,
      },
      update: {},
      include: {
        user: { select: { id: true, displayName: true } },
      },
    });

    broadcastToConversation(message.conversationId, SocketEvents.MESSAGE_REACTION_ADDED, {
      messageId: message.id,
      conversationId: message.conversationId,
      userId: req.userId,
      userDisplayName: (reaction as { user: { displayName: string } }).user.displayName,
      emoji,
    });

    res.json({
      success: true,
      data: reaction,
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /messages/:id/reactions/:emoji
 * Remove reaction from message
 */
router.delete('/:id/reactions/:emoji', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const message = await prisma.message.findUnique({
      where: { id: req.params.id },
    });

    if (!message) {
      throw new NotFoundError('Message', req.params.id);
    }

    await prisma.messageReaction.delete({
      where: {
        messageId_userId_emoji: {
          messageId: req.params.id!,
          userId: req.userId!,
          emoji: decodeURIComponent(req.params.emoji!),
        },
      },
    });

    broadcastToConversation(message.conversationId, SocketEvents.MESSAGE_REACTION_REMOVED, {
      messageId: message.id,
      conversationId: message.conversationId,
      userId: req.userId,
      emoji: req.params.emoji,
    });

    res.json({
      success: true,
      data: { message: 'Reaction removed' },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

export { router as messagesRouter };
