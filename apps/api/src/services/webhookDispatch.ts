/**
 * Webhook Dispatch Service
 *
 * Dispatches events to registered webhooks when app events occur.
 * Handles retry logic, signature generation, and error tracking.
 */

import crypto from 'crypto';
import { prisma } from '@neon/database';
import { subscribeToEvents, EventHandler } from './eventbus';

// Event types that can trigger webhooks
const WEBHOOK_EVENTS = [
  'message.created',
  'message.updated',
  'message.deleted',
  'user.joined',
  'user.left',
  'user.updated',
  'meeting.started',
  'meeting.ended',
  'meeting.scheduled',
  'call.started',
  'call.ended',
  'conversation.created',
  'file.uploaded',
  'file.deleted',
];

interface WebhookPayload {
  id: string;
  event: string;
  timestamp: string;
  data: unknown;
}

/**
 * Generate HMAC signature for webhook payload
 */
function generateSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Dispatch a webhook to a URL with retry logic
 */
async function dispatchWebhook(
  webhookId: string,
  url: string,
  secret: string,
  payload: WebhookPayload,
  maxRetries: number,
  retryDelayMs: number
): Promise<boolean> {
  const payloadStr = JSON.stringify(payload);
  const signature = generateSignature(payloadStr, secret);
  const timestamp = Date.now().toString();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Timestamp': timestamp,
          'X-Webhook-Id': payload.id,
          'X-Webhook-Event': payload.event,
        },
        body: payloadStr,
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      if (response.ok) {
        // Update success stats
        await prisma.webhook.update({
          where: { id: webhookId },
          data: {
            lastTriggeredAt: new Date(),
            lastSuccessAt: new Date(),
            successCount: { increment: 1 },
          },
        });
        console.log(`[Webhook] Successfully dispatched to ${url} for event ${payload.event}`);
        return true;
      }

      // Non-2xx response - log and potentially retry
      console.warn(`[Webhook] Non-2xx response (${response.status}) from ${url}`);

      // Don't retry client errors (4xx) except 429 (rate limit)
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        break;
      }
    } catch (error: any) {
      console.error(`[Webhook] Error dispatching to ${url}:`, error.message);
    }

    // Wait before retrying (exponential backoff)
    if (attempt < maxRetries) {
      const delay = retryDelayMs * Math.pow(2, attempt);
      console.log(`[Webhook] Retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // Update failure stats
  await prisma.webhook.update({
    where: { id: webhookId },
    data: {
      lastTriggeredAt: new Date(),
      lastFailureAt: new Date(),
      failureCount: { increment: 1 },
    },
  });

  console.error(`[Webhook] Failed to dispatch to ${url} after ${maxRetries} retries`);
  return false;
}

/**
 * Handle an event and dispatch to matching webhooks
 */
async function handleEvent(event: string, payload: unknown, orgId: string): Promise<void> {
  // Convert internal event format (message:created) to webhook format (message.created)
  const webhookEvent = event.replace(':', '.');

  try {

    // Find enabled webhooks for this org that subscribe to this event
    const webhooks = await prisma.webhook.findMany({
      where: {
        orgId,
        enabled: true,
        events: { has: webhookEvent },
      },
    });

    if (webhooks.length === 0) {
      return;
    }

    console.log(`[Webhook] Found ${webhooks.length} webhook(s) for event ${webhookEvent}`);

    // Generate unique ID for this dispatch
    const webhookPayload: WebhookPayload = {
      id: crypto.randomUUID(),
      event: webhookEvent,
      timestamp: new Date().toISOString(),
      data: payload,
    };

    // Dispatch to all matching webhooks in parallel
    await Promise.all(
      webhooks.map((webhook) =>
        dispatchWebhook(
          webhook.id,
          webhook.url,
          webhook.secret,
          webhookPayload,
          webhook.maxRetries,
          webhook.retryDelayMs
        )
      )
    );
  } catch (error) {
    console.error(`[Webhook] Error handling event ${webhookEvent}:`, error);
  }
}

/**
 * Initialize webhook dispatch service
 * Subscribes to all relevant events from the event bus
 */
export function initializeWebhookDispatch(): void {
  console.log('[Webhook] Initializing webhook dispatch service');

  // Create event handler that maps internal events to webhook events
  const eventHandler: EventHandler = (event, payload, metadata) => {
    // Extract orgId from payload if available
    const payloadData = payload as Record<string, any>;
    const orgId = payloadData?.orgId;

    if (!orgId) {
      // Try to get orgId from nested data
      const nestedOrgId = payloadData?.data?.orgId || payloadData?.message?.orgId;
      if (nestedOrgId) {
        handleEvent(event, payload, nestedOrgId);
      }
      return;
    }

    handleEvent(event, payload, orgId);
  };

  // Subscribe to all webhook-triggerable events
  for (const event of WEBHOOK_EVENTS) {
    // Map event name to internal event pattern
    const pattern = event.replace('.', ':');
    subscribeToEvents(pattern, eventHandler);
    console.log(`[Webhook] Subscribed to event pattern: ${pattern}`);
  }

  // Also subscribe to wildcards for broader event matching
  subscribeToEvents('message:*', eventHandler);
  subscribeToEvents('user:*', eventHandler);
  subscribeToEvents('conversation:*', eventHandler);

  console.log('[Webhook] Webhook dispatch service initialized');
}

/**
 * Manually trigger a webhook for testing
 */
export async function testWebhook(webhookId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const webhook = await prisma.webhook.findUnique({
      where: { id: webhookId },
    });

    if (!webhook) {
      return { success: false, error: 'Webhook not found' };
    }

    const testPayload: WebhookPayload = {
      id: crypto.randomUUID(),
      event: 'webhook.test',
      timestamp: new Date().toISOString(),
      data: {
        message: 'This is a test webhook delivery',
        webhookId: webhook.id,
        webhookName: webhook.name,
      },
    };

    const success = await dispatchWebhook(
      webhook.id,
      webhook.url,
      webhook.secret,
      testPayload,
      0, // No retries for test
      0
    );

    return { success };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
