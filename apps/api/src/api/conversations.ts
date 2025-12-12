/**
 * Conversation Routes
 */

import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '@neon/database';
import { createConversationSchema, updateConversationSchema, addParticipantsSchema, cursorPaginationSchema, ValidationError, NotFoundError, ForbiddenError } from '@neon/shared';
import { authenticate } from '../middleware/auth';
import { canCommunicate, canFreeze } from '../services/permissions';
import { AuditService } from '../services/audit';
import { publishEvent } from '../services/eventbus';
import { getSignedUrlForOrg, getSignedUrl } from '../services/s3';
import { broadcastToConversation, broadcastToConversationParticipants } from '../socket';
import { SocketEvents } from '@neon/shared';
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
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          where: { deletedAt: null },
          include: {
            sender: {
              select: { id: true, displayName: true },
            },
          },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });

    // Transform to include lastMessage properly
    const transformedConversations = conversations.map((conv) => {
      const { messages, ...rest } = conv;
      return {
        ...rest,
        lastMessage: messages[0] || null,
      };
    });

    const hasMore = transformedConversations.length > limit;
    const data = hasMore ? transformedConversations.slice(0, -1) : transformedConversations;

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
router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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
        res.json({
          success: true,
          data: existing,
          meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
        });
        return;
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

    res.status(201).json({
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
 * GET /conversations/:id/messages
 * Get messages in a conversation
 */
router.get('/:id/messages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { before, limit = '50' } = req.query;
    const messageLimit = Math.min(parseInt(limit as string, 10) || 50, 100);

    // Verify user is a participant
    const participant = await prisma.conversationParticipant.findFirst({
      where: {
        conversationId: req.params.id,
        userId: req.userId!,
        leftAt: null,
      },
    });

    if (!participant) {
      throw new NotFoundError('Conversation', req.params.id);
    }

    const messages = await prisma.message.findMany({
      where: {
        conversationId: req.params.id,
        deletedAt: null,
        ...(before && { createdAt: { lt: new Date(before as string) } }),
      },
      include: {
        sender: {
          select: { id: true, displayName: true, avatarUrl: true },
        },
        replyTo: {
          select: {
            id: true,
            content: true,
            sender: { select: { id: true, displayName: true } },
          },
        },
        reactions: {
          include: {
            user: { select: { id: true, displayName: true } },
          },
        },
        files: {
          include: {
            file: { select: { id: true, name: true, mimeType: true, size: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: messageLimit + 1,
    });

    const hasMore = messages.length > messageLimit;
    const data = hasMore ? messages.slice(0, -1) : messages;

    // Update last read timestamp
    await prisma.conversationParticipant.update({
      where: { id: participant.id },
      data: {
        lastReadAt: new Date(),
        lastReadMessageId: data[0]?.id,
      },
    });

    res.json({
      success: true,
      data: data.reverse(), // Return in chronological order
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
        pagination: {
          hasMore,
          cursor: data.length > 0 ? data[0]!.createdAt.toISOString() : null,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /conversations/:id/messages
 * Send a message to a conversation
 */
router.post('/:id/messages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { content, replyToId, type = 'TEXT' } = req.body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      throw new ValidationError('Message content is required');
    }

    if (content.length > CHAT_LIMITS.MAX_MESSAGE_LENGTH) {
      throw new ValidationError(`Message cannot exceed ${CHAT_LIMITS.MAX_MESSAGE_LENGTH} characters`);
    }

    // Verify user is a participant and can send messages
    const participant = await prisma.conversationParticipant.findFirst({
      where: {
        conversationId: req.params.id,
        userId: req.userId!,
        leftAt: null,
      },
      include: {
        conversation: {
          select: { orgId: true, deletedAt: true },
        },
      },
    });

    if (!participant) {
      throw new NotFoundError('Conversation', req.params.id);
    }

    if (participant.conversation.deletedAt) {
      throw new ForbiddenError('This conversation has been deleted');
    }

    if (!participant.canSendMessages) {
      throw new ForbiddenError('You cannot send messages in this conversation');
    }

    if (participant.isFrozen) {
      throw new ForbiddenError('Your messages are frozen in this conversation');
    }

    // Verify conversation belongs to user's org
    if (participant.conversation.orgId !== req.orgId) {
      throw new ForbiddenError('Access denied');
    }

    // Create the message
    const message = await prisma.message.create({
      data: {
        conversationId: req.params.id!,
        senderId: req.userId!,
        type: type as 'TEXT' | 'FILE' | 'SYSTEM',
        content: content.trim(),
        replyToId,
      },
      include: {
        sender: {
          select: { id: true, displayName: true, avatarUrl: true },
        },
        replyTo: {
          select: {
            id: true,
            content: true,
            sender: { select: { id: true, displayName: true } },
          },
        },
      },
    });

    // Update conversation last message info
    await prisma.conversation.update({
      where: { id: req.params.id },
      data: {
        lastMessageAt: message.createdAt,
        lastMessagePreview: content.trim().substring(0, 100),
      },
    });

    // Log the message send for audit
    await AuditService.log({
      action: 'message.sent',
      resourceType: 'message',
      resourceId: message.id,
      actorId: req.userId,
      orgId: req.orgId,
      details: { conversationId: req.params.id },
      ipAddress: req.ip,
    });

    // Broadcast message to all conversation participants via Socket.IO for real-time delivery
    console.log(`[Conversations API] Broadcasting new message ${message.id} in conversation ${req.params.id}`);
    await broadcastToConversationParticipants(req.params.id!, SocketEvents.MESSAGE_RECEIVED, message);
    broadcastToConversation(req.params.id!, SocketEvents.MESSAGE_RECEIVED, message);
    console.log(`[Conversations API] Broadcast complete for message ${message.id}`);

    // Publish event for webhooks
    await publishEvent('message:created', {
      orgId: req.orgId,
      conversationId: req.params.id,
      message: {
        id: message.id,
        senderId: message.senderId,
        content: message.content,
        type: message.type,
        createdAt: message.createdAt,
      },
    });

    res.status(201).json({
      success: true,
      data: message,
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
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

/**
 * GET /conversations/:id/files
 * List all files shared in a conversation with filtering and pagination
 */
router.get('/:id/files', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const {
      cursor,
      limit = '20',
      type, // Filter by mime type prefix: 'image', 'video', 'audio', 'document'
      search // Search by file name
    } = req.query;

    const limitNum = Math.min(parseInt(limit as string) || 20, 50);

    // Verify user is a participant
    const participant = await prisma.conversationParticipant.findFirst({
      where: {
        conversationId: id,
        userId: req.userId!,
        leftAt: null,
      },
      include: {
        conversation: {
          select: { orgId: true, deletedAt: true },
        },
      },
    });

    if (!participant || participant.conversation.deletedAt) {
      throw new NotFoundError('Conversation', id);
    }

    // Build file filter
    const mimeTypeFilter: Record<string, string> = {
      image: 'image/',
      video: 'video/',
      audio: 'audio/',
      document: 'application/',
    };

    const fileWhereClause: Record<string, unknown> = {
      deletedAt: null,
      orgId: req.orgId!,
    };

    if (type && typeof type === 'string' && mimeTypeFilter[type]) {
      fileWhereClause.mimeType = { startsWith: mimeTypeFilter[type] };
    }

    if (search && typeof search === 'string' && search.trim()) {
      fileWhereClause.name = { contains: search.trim(), mode: 'insensitive' };
    }

    // Build message filter with cursor
    const messageWhereClause: Record<string, unknown> = {
      conversationId: id,
      deletedAt: null,
    };

    if (cursor) {
      messageWhereClause.createdAt = { lt: new Date(cursor as string) };
    }

    // Query files from messages in this conversation
    const messageFiles = await prisma.messageFile.findMany({
      where: {
        message: messageWhereClause,
        file: fileWhereClause,
      },
      select: {
        file: {
          select: {
            id: true,
            name: true,
            mimeType: true,
            size: true,
            bucket: true,
            key: true,
            thumbnailKey: true,
            createdAt: true,
          },
        },
        message: {
          select: {
            id: true,
            createdAt: true,
            sender: {
              select: { id: true, displayName: true, avatarUrl: true },
            },
          },
        },
      },
      orderBy: { message: { createdAt: 'desc' } },
      take: limitNum + 1,
    });

    const hasMore = messageFiles.length > limitNum;
    const data = hasMore ? messageFiles.slice(0, -1) : messageFiles;

    // Generate presigned URLs for each file
    const filesWithUrls = await Promise.all(
      data.map(async (mf) => {
        let url: string | null = null;
        let thumbnailUrl: string | null = null;

        try {
          url = await getSignedUrlForOrg(req.orgId!, mf.file.key);
          if (mf.file.thumbnailKey) {
            thumbnailUrl = await getSignedUrlForOrg(req.orgId!, mf.file.thumbnailKey);
          }
        } catch {
          // Fallback to bucket-based URL
          try {
            url = await getSignedUrl(mf.file.bucket, mf.file.key);
          } catch (e) {
            console.error(`Failed to get URL for file ${mf.file.id}:`, e);
          }
        }

        return {
          id: mf.file.id,
          name: mf.file.name,
          mimeType: mf.file.mimeType,
          size: Number(mf.file.size),
          url,
          thumbnailUrl,
          uploadedAt: mf.file.createdAt,
          message: {
            id: mf.message.id,
            sentAt: mf.message.createdAt,
            sender: mf.message.sender,
          },
        };
      })
    );

    // Get total count
    const totalCount = await prisma.messageFile.count({
      where: {
        message: { conversationId: id, deletedAt: null },
        file: { deletedAt: null, orgId: req.orgId! },
      },
    });

    // Calculate type-specific counts
    const imageCount = await prisma.messageFile.count({
      where: {
        message: { conversationId: id, deletedAt: null },
        file: { deletedAt: null, orgId: req.orgId!, mimeType: { startsWith: 'image/' } },
      },
    });

    const videoCount = await prisma.messageFile.count({
      where: {
        message: { conversationId: id, deletedAt: null },
        file: { deletedAt: null, orgId: req.orgId!, mimeType: { startsWith: 'video/' } },
      },
    });

    const audioCount = await prisma.messageFile.count({
      where: {
        message: { conversationId: id, deletedAt: null },
        file: { deletedAt: null, orgId: req.orgId!, mimeType: { startsWith: 'audio/' } },
      },
    });

    const documentCount = await prisma.messageFile.count({
      where: {
        message: { conversationId: id, deletedAt: null },
        file: { deletedAt: null, orgId: req.orgId!, mimeType: { startsWith: 'application/' } },
      },
    });

    // Get cursor from last message's createdAt
    const lastItem = data[data.length - 1];
    const nextCursor = lastItem ? lastItem.message.createdAt.toISOString() : null;

    res.json({
      success: true,
      data: filesWithUrls,
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
        pagination: {
          hasMore,
          cursor: nextCursor,
        },
        counts: {
          total: totalCount,
          images: imageCount,
          videos: videoCount,
          audio: audioCount,
          documents: documentCount,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

export { router as conversationsRouter };
