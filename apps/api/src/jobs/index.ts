/**
 * Background Job Scheduler
 *
 * Handles scheduled tasks like backups, purging, and maintenance
 */

import { getConfig } from '@neon/config';
import { prisma } from '@neon/database';
import { AuditService } from '../services/audit';

const config = getConfig();

/**
 * Check if an error is a Prisma "table does not exist" error
 */
function isTableNotExistError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'code' in error) {
    // Prisma error code P2021 = table does not exist
    return (error as { code: string }).code === 'P2021';
  }
  return false;
}

/**
 * Wrap a job handler with graceful error handling for missing tables
 */
function withTableCheck<T>(handler: () => Promise<T>): () => Promise<T | undefined> {
  return async () => {
    try {
      return await handler();
    } catch (error) {
      if (isTableNotExistError(error)) {
        console.warn('[Jobs] Skipping job - database tables not yet created (run migrations)');
        return undefined;
      }
      throw error;
    }
  };
}

interface ScheduledJob {
  name: string;
  schedule: string; // Cron format
  handler: () => Promise<void>;
  running: boolean;
}

const jobs: Map<string, ScheduledJob> = new Map();
let schedulerInterval: NodeJS.Timeout | null = null;

/**
 * Parse cron expression and check if it matches current time
 */
function cronMatches(cronExpr: string, date: Date): boolean {
  // Simple cron parser for: minute hour day month weekday
  const parts = cronExpr.split(' ');
  if (parts.length !== 5) return false;

  const [minute, hour, day, month, weekday] = parts;

  const matches = (field: string, value: number, max: number): boolean => {
    if (field === '*') return true;
    if (field?.includes('/')) {
      const [, step] = field.split('/');
      return value % parseInt(step!) === 0;
    }
    if (field?.includes('-')) {
      const [start, end] = field.split('-').map(Number);
      return value >= start! && value <= end!;
    }
    if (field?.includes(',')) {
      return field.split(',').map(Number).includes(value);
    }
    return parseInt(field!) === value;
  };

  return (
    matches(minute!, date.getMinutes(), 59) &&
    matches(hour!, date.getHours(), 23) &&
    matches(day!, date.getDate(), 31) &&
    matches(month!, date.getMonth() + 1, 12) &&
    matches(weekday!, date.getDay(), 6)
  );
}

/**
 * Register a job
 */
function registerJob(name: string, schedule: string, handler: () => Promise<void>): void {
  jobs.set(name, {
    name,
    schedule,
    handler,
    running: false,
  });
  console.log(`[Jobs] Registered job: ${name} (${schedule})`);
}

/**
 * Run scheduled jobs
 */
async function runScheduler(): Promise<void> {
  const now = new Date();

  for (const [name, job] of jobs) {
    if (job.running) continue;

    if (cronMatches(job.schedule, now)) {
      console.log(`[Jobs] Starting job: ${name}`);
      job.running = true;

      try {
        await job.handler();
        console.log(`[Jobs] Completed job: ${name}`);
      } catch (error) {
        console.error(`[Jobs] Failed job: ${name}`, error);
      } finally {
        job.running = false;
      }
    }
  }
}

/**
 * Start the job scheduler
 */
export function startJobScheduler(): void {
  // Check if jobs are enabled
  if (!config.jobs.enabled) {
    console.log('[Jobs] Scheduler disabled by configuration (JOBS_ENABLED=false)');
    return;
  }

  // Register built-in jobs

  // Session cleanup - every hour
  registerJob('session-cleanup', '0 * * * *', withTableCheck(async () => {
    const expiredDate = new Date();
    expiredDate.setDate(expiredDate.getDate() - 7);

    const result = await prisma.session.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { revokedAt: { lt: expiredDate } },
        ],
      },
    });

    console.log(`[Jobs] Cleaned up ${result.count} expired sessions`);
  }));

  // Presence cleanup - every 5 minutes
  registerJob('presence-cleanup', '*/5 * * * *', withTableCheck(async () => {
    const offlineThreshold = new Date();
    offlineThreshold.setMinutes(offlineThreshold.getMinutes() - 5);

    await prisma.user.updateMany({
      where: {
        presenceStatus: { in: ['ONLINE', 'AWAY'] },
        lastActiveAt: { lt: offlineThreshold },
      },
      data: { presenceStatus: 'OFFLINE' },
    });
  }));

  // Backup job (configured schedule)
  if (config.jobs.backupSchedule) {
    registerJob('backup', config.jobs.backupSchedule, async () => {
      // TODO: Implement backup
      console.log('[Jobs] Backup job - not yet implemented');
      await AuditService.log({
        actorType: 'system',
        action: 'backup.scheduled',
        resourceType: 'system',
        details: { status: 'skipped', reason: 'not_implemented' },
      });
    });
  }

  // Purge job for GDPR (configured schedule)
  if (config.compliance.mode === 'GDPR' && config.jobs.purgeSchedule) {
    registerJob('purge', config.jobs.purgeSchedule, async () => {
      const gracePeriod = new Date();
      gracePeriod.setDate(gracePeriod.getDate() - config.compliance.gdprPurgeGraceDays);

      // TODO: Implement GDPR purge
      console.log('[Jobs] GDPR purge job - not yet implemented');
      await AuditService.log({
        actorType: 'system',
        action: 'purge.scheduled',
        resourceType: 'system',
        details: { status: 'skipped', reason: 'not_implemented' },
      });
    });
  }

  // Notification cleanup - daily at 4 AM
  registerJob('notification-cleanup', '0 4 * * *', withTableCheck(async () => {
    const oldDate = new Date();
    oldDate.setMonth(oldDate.getMonth() - 3);

    const result = await prisma.notification.deleteMany({
      where: {
        createdAt: { lt: oldDate },
        read: true,
      },
    });

    console.log(`[Jobs] Cleaned up ${result.count} old notifications`);
  }));

  // Meeting reminder job - every minute
  registerJob('meeting-reminders', '* * * * *', withTableCheck(async () => {
    const now = new Date();

    // Find meetings starting soon with pending reminders
    const reminders = await prisma.meetingReminder.findMany({
      where: {
        sentAt: null,
        meeting: {
          status: 'SCHEDULED',
          scheduledStart: {
            gt: now,
            lt: new Date(now.getTime() + 60 * 60 * 1000), // Within next hour
          },
        },
      },
      include: {
        meeting: {
          include: {
            participants: {
              include: {
                user: { select: { id: true } },
              },
            },
          },
        },
      },
    });

    for (const reminder of reminders) {
      const meetingStart = new Date(reminder.meeting.scheduledStart);
      const reminderTime = new Date(
        meetingStart.getTime() - reminder.minutesBefore * 60 * 1000
      );

      if (now >= reminderTime) {
        // Send notifications to participants
        for (const participant of reminder.meeting.participants) {
          await prisma.notification.create({
            data: {
              userId: participant.user.id,
              type: 'MEETING_REMINDER',
              title: 'Meeting Reminder',
              body: `${reminder.meeting.title} starts in ${reminder.minutesBefore} minutes`,
              data: {
                meetingId: reminder.meeting.id,
                minutesBefore: reminder.minutesBefore,
              },
            },
          });
        }

        // Mark reminder as sent
        await prisma.meetingReminder.update({
          where: { id: reminder.id },
          data: { sentAt: now },
        });
      }
    }
  }));

  // Start scheduler loop (check every minute)
  schedulerInterval = setInterval(runScheduler, 60000);

  // Run immediately
  runScheduler();

  console.log('[Jobs] Scheduler started');
}

/**
 * Stop the job scheduler
 */
export function stopJobScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
  jobs.clear();
  console.log('[Jobs] Scheduler stopped');
}

/**
 * Manually trigger a job
 */
export async function triggerJob(name: string): Promise<boolean> {
  const job = jobs.get(name);
  if (!job) {
    console.error(`[Jobs] Job not found: ${name}`);
    return false;
  }

  if (job.running) {
    console.warn(`[Jobs] Job already running: ${name}`);
    return false;
  }

  console.log(`[Jobs] Manually triggering job: ${name}`);
  job.running = true;

  try {
    await job.handler();
    return true;
  } catch (error) {
    console.error(`[Jobs] Failed job: ${name}`, error);
    return false;
  } finally {
    job.running = false;
  }
}

/**
 * Get job status
 */
export function getJobStatus(): Array<{ name: string; schedule: string; running: boolean }> {
  return Array.from(jobs.values()).map(({ name, schedule, running }) => ({
    name,
    schedule,
    running,
  }));
}
