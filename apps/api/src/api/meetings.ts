/**
 * Meeting Routes
 */

import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '@neon/database';
import { createMeetingSchema, updateMeetingSchema, paginationSchema } from '@neon/shared';
import { NotFoundError, ForbiddenError } from '@neon/shared';
import { authenticate } from '../middleware/auth';
import { AuditService } from '../services/audit';
import {
  generateRoomCode,
  buildMeetSession,
  endMeeting,
  getMeetIntegration,
  requireMeetIntegration,
} from '../services/meet';

const router = Router();
router.use(authenticate);

/**
 * GET /meetings
 * List meetings
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const skip = (page - 1) * limit;

    const where = {
      orgId: req.orgId!,
      participants: { some: { userId: req.userId! } },
      status: { not: 'CANCELLED' as const },
    };

    const [meetings, total] = await Promise.all([
      prisma.meeting.findMany({
        where,
        include: {
          creator: { select: { id: true, displayName: true, avatarUrl: true } },
          participants: {
            include: {
              user: { select: { id: true, displayName: true, avatarUrl: true } },
            },
          },
        },
        orderBy: { scheduledStart: 'asc' },
        skip,
        take: limit,
      }),
      prisma.meeting.count({ where }),
    ]);

    res.json({
      success: true,
      data: meetings,
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          hasNext: skip + meetings.length < total,
          hasPrev: page > 1,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /meetings
 * Create meeting
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createMeetingSchema.parse(req.body);

    const meeting = await prisma.meeting.create({
      data: {
        orgId: req.orgId!,
        createdById: req.userId!,
        title: data.title,
        description: data.description,
        scheduledStart: new Date(data.scheduledStart),
        scheduledEnd: new Date(data.scheduledEnd),
        timezone: data.timezone ?? 'UTC',
        recurrence: data.recurrence ?? 'NONE',
        settings: data.settings ?? {},
        participants: {
          create: [
            { userId: req.userId!, isHost: true },
            ...data.participantIds.map((id) => ({ userId: id })),
          ],
        },
        reminders: data.reminders?.length
          ? { create: data.reminders }
          : undefined,
      },
      include: {
        creator: { select: { id: true, displayName: true, avatarUrl: true } },
        participants: {
          include: {
            user: { select: { id: true, displayName: true, avatarUrl: true } },
          },
        },
      },
    });

    await AuditService.log({
      action: 'meeting.created',
      resourceType: 'meeting',
      resourceId: meeting.id,
      actorId: req.userId,
      orgId: req.orgId,
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      data: meeting,
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /meetings/:id
 * Get meeting by ID
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const meeting = await prisma.meeting.findFirst({
      where: {
        id: req.params.id,
        orgId: req.orgId!,
        participants: { some: { userId: req.userId! } },
      },
      include: {
        creator: { select: { id: true, displayName: true, avatarUrl: true } },
        participants: {
          include: {
            user: { select: { id: true, displayName: true, avatarUrl: true } },
          },
        },
        recordings: true,
      },
    });

    if (!meeting) {
      throw new NotFoundError('Meeting', req.params.id);
    }

    res.json({
      success: true,
      data: meeting,
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /meetings/:id/join
 * Join meeting (get the MEET room to embed)
 */
router.post('/:id/join', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const meeting = await prisma.meeting.findFirst({
      where: {
        id: req.params.id,
        orgId: req.orgId!,
        participants: { some: { userId: req.userId! } },
      },
    });

    if (!meeting) {
      throw new NotFoundError('Meeting', req.params.id);
    }

    // The organisation's MEET (Admin → Integrations). No MEET, no meeting.
    const meetIntegration = await requireMeetIntegration(req.orgId!);

    // `livekitRoom` is the historical column name; it now holds a MEET room
    // code, minted on the first join and reused by everyone after.
    let livekitRoom = meeting.livekitRoom;
    if (!livekitRoom) {
      livekitRoom = await generateRoomCode(meetIntegration);
      await prisma.meeting.update({
        where: { id: meeting.id },
        data: { livekitRoom },
      });
    }

    const meet = buildMeetSession(meetIntegration, livekitRoom, { name: req.user!.displayName });

    // Update participant join time
    await prisma.meetingParticipant.updateMany({
      where: { meetingId: meeting.id, userId: req.userId! },
      data: { joinedAt: new Date() },
    });

    // Start meeting if first join
    if (meeting.status === 'SCHEDULED') {
      await prisma.meeting.update({
        where: { id: meeting.id },
        data: { status: 'IN_PROGRESS', actualStart: new Date() },
      });
    }

    res.json({
      success: true,
      data: {
        meeting,
        meet,
        roomName: livekitRoom,
      },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /meetings/:id/leave
 * Leave a meeting without ending it for anyone else.
 *
 * The client calls this when MEET's embed reports a final departure. It is
 * idempotent — a reconnect that ends in a real leave, or two windows closing
 * at once, should not be an error.
 */
router.post('/:id/leave', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.meetingParticipant.updateMany({
      where: { meetingId: req.params.id, userId: req.userId!, leftAt: null },
      data: { leftAt: new Date() },
    });

    res.json({
      success: true,
      data: { message: 'Left meeting' },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /meetings/:id/end
 * End meeting
 */
router.post('/:id/end', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const participant = await prisma.meetingParticipant.findFirst({
      where: { meetingId: req.params.id, userId: req.userId!, isHost: true },
    });

    if (!participant) {
      throw new ForbiddenError('Only the host can end the meeting');
    }

    const meeting = await prisma.meeting.update({
      where: { id: req.params.id },
      data: { status: 'ENDED', actualEnd: new Date() },
    });

    // Disconnect anyone still in the MEET room. Best-effort: NEON's record is
    // what decides the meeting is over, and a removed integration is not an
    // error here.
    if (meeting.livekitRoom) {
      const meetIntegration = await getMeetIntegration(req.orgId!);
      if (meetIntegration) {
        await endMeeting(meetIntegration, meeting.livekitRoom, `neon-${req.userId!}`);
      }
    }

    res.json({
      success: true,
      data: { message: 'Meeting ended' },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /meetings/:id/cancel
 * Cancel meeting
 */
router.post('/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const meeting = await prisma.meeting.findFirst({
      where: { id: req.params.id, createdById: req.userId! },
    });

    if (!meeting) {
      throw new ForbiddenError('Only the creator can cancel the meeting');
    }

    await prisma.meeting.update({
      where: { id: req.params.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledBy: req.userId,
      },
    });

    res.json({
      success: true,
      data: { message: 'Meeting cancelled' },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

export { router as meetingsRouter };
