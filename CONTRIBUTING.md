# Contributing to NEON

> **Alpha Software Notice**: NEON is in active alpha development. This document outlines best practices and requirements for making changes, especially those that could be breaking.

---

## Table of Contents

1. [Development Environment](#development-environment)
2. [Monorepo Structure](#monorepo-structure)
3. [TypeScript Requirements](#typescript-requirements)
4. [Express Route Handlers](#express-route-handlers)
5. [Database Changes (Prisma)](#database-changes-prisma)
6. [API Changes](#api-changes)
7. [Docker Build Requirements](#docker-build-requirements)
8. [Testing](#testing)
9. [Common Issues & Solutions](#common-issues--solutions)

---

## Development Environment

### Prerequisites

- Node.js 20+
- npm 10+
- Docker & Docker Compose (for full stack testing)
- PostgreSQL 15+ (or use Docker)
- Redis 7+ (or use Docker)

### Setup

```bash
# Install dependencies
npm install

# Generate Prisma client
npx prisma generate --schema=packages/database/prisma/schema.prisma

# Build packages in order
npm run build -w @neon/config
npm run build -w @neon/shared
npm run build -w @neon/database
```

---

## Monorepo Structure

NEON uses npm workspaces. **Package build order matters:**

```
1. packages/config     (no dependencies)
2. packages/shared     (depends on config)
3. packages/database   (depends on shared, requires Prisma generate)
4. apps/api           (depends on all packages)
5. apps/web           (depends on config, shared)
```

### Important Notes

- Changes to `packages/shared` types require rebuilding dependent packages
- Changes to `packages/database/prisma/schema.prisma` require:
  1. Run `npx prisma generate`
  2. Rebuild `packages/database`
  3. Rebuild `apps/api`

---

## TypeScript Requirements

### TS7030: Not All Code Paths Return a Value

This is a **common issue** in Express async route handlers. When a function has `return` statements in some branches, TypeScript requires all branches to return.

**Problem:**
```typescript
router.post('/example', async (req, res, next) => {
  try {
    if (condition) {
      return res.json({ data }); // Returns here
    }
    return res.json({ other }); // Returns here
  } catch (error) {
    next(error); // ERROR: TS7030 - no return!
  }
});
```

**Solution:**
```typescript
router.post('/example', async (req, res, next) => {
  try {
    if (condition) {
      return res.json({ data });
    }
    return res.json({ other });
  } catch (error) {
    return next(error); // Add 'return' before next()
  }
});
```

### TS2339: Property Does Not Exist on Type

When using discriminated unions (like `LoginResult`), TypeScript may not narrow types automatically.

**Problem:**
```typescript
const result = await AuthService.login(email, password);
// result is LoginResult = LoginResponse | MfaRequiredResponse

res.cookie(config.sessionCookie, result.refreshToken); // ERROR: refreshToken doesn't exist on MfaRequiredResponse
```

**Solution:**
```typescript
const result = await AuthService.login(email, password);

if ('requiresMfa' in result && result.requiresMfa) {
  return res.json({ requiresMfa: true, userId: result.userId });
}

// Type assertion after narrowing
const loginResponse = result as LoginResponse;
res.cookie(config.sessionCookie, loginResponse.refreshToken);
```

### General TypeScript Rules

1. **Always specify return types** for async functions that return Response
2. **Use explicit type assertions** after type guards when TypeScript can't narrow
3. **Add `return` before `next(error)`** in catch blocks
4. **Import required types** from `@neon/shared`

---

## Express Route Handlers

### Standard Response Format

All API responses must follow this format:

```typescript
// Success response
res.json({
  success: true,
  data: { /* response data */ },
  meta: {
    requestId: req.requestId,
    timestamp: new Date().toISOString(),
  },
});

// Error response
res.status(400).json({
  success: false,
  error: {
    code: 'ERROR_CODE',
    message: 'Human readable message'
  },
  meta: {
    requestId: req.requestId,
    timestamp: new Date().toISOString(),
  },
});
```

### Route Handler Template

```typescript
router.post('/endpoint', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 1. Validate input
    const data = someSchema.parse(req.body);

    // 2. Business logic
    const result = await SomeService.doSomething(data);

    // 3. Return success response
    return res.json({
      success: true,
      data: result,
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return next(error); // IMPORTANT: Always use 'return'
  }
});
```

### MFA Flow Pattern

When implementing endpoints that may require MFA:

```typescript
const result = await AuthService.login(email, password, options);

// Check if MFA is required FIRST
if ('requiresMfa' in result && result.requiresMfa) {
  return res.json({
    success: true,
    data: {
      requiresMfa: true,
      userId: result.userId,
      mfaMethods: result.mfaMethods,
    },
    meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
  });
}

// Now safe to treat as full login response
const loginResponse = result as LoginResponse;
// ... continue with tokens, cookies, etc.
```

---

## Database Changes (Prisma)

### Before Making Schema Changes

1. **Check existing data** - Will the migration break existing records?
2. **Consider rollback** - Can this migration be reversed?
3. **Update types** - `packages/database/src/types.ts` must reflect schema changes

### Schema Change Checklist

- [ ] Update `packages/database/prisma/schema.prisma`
- [ ] Run `npx prisma generate` to update client
- [ ] Create migration: `npx prisma migrate dev --name descriptive_name`
- [ ] Update `packages/database/src/types.ts` if adding/removing models
- [ ] Update validation schemas in `packages/shared/src/validation/`
- [ ] Rebuild `packages/database`
- [ ] Update affected API routes in `apps/api`
- [ ] Update frontend types/hooks in `apps/web`

### Breaking Schema Changes

These require extra care:

| Change Type | Risk | Mitigation |
|-------------|------|------------|
| Remove column | HIGH | Mark deprecated first, migrate data |
| Rename column | MEDIUM | Use `@map` to preserve DB column name |
| Change type | HIGH | Create new column, migrate, remove old |
| Remove table | HIGH | Archive data first, remove references |
| Add required column | MEDIUM | Provide default value or migrate existing |

### Example: Adding Required Field

```prisma
// BAD - breaks existing records
model User {
  newField String  // Required, no default
}

// GOOD - safe migration path
model User {
  newField String @default("default_value")
}
```

---

## API Changes

### Breaking vs Non-Breaking Changes

**Non-Breaking (Safe):**
- Adding new optional fields to responses
- Adding new endpoints
- Adding new optional query parameters
- Adding new optional request body fields

**Breaking (Requires Versioning/Migration):**
- Removing fields from responses
- Changing field types
- Removing endpoints
- Changing required fields
- Renaming fields

### API Change Checklist

- [ ] Update Zod validation schema in `packages/shared/src/validation/`
- [ ] Update TypeScript types in `packages/shared/src/types/`
- [ ] Update API route handler in `apps/api/src/api/`
- [ ] Update frontend API calls in `apps/web/src/api/`
- [ ] Update any React Query hooks
- [ ] Test with existing frontend

### Validation Schema Updates

When updating validation schemas:

```typescript
// packages/shared/src/validation/index.ts

// Handle optional fields that may come as empty strings
export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  // Transform empty string to undefined for optional fields
  departmentId: z.string().uuid().optional()
    .or(z.literal('').transform(() => undefined)),
  roleId: z.string().uuid().optional()
    .or(z.literal('').transform(() => undefined)),
});
```

---

## Docker Build Requirements

### Build Order in Dockerfile

The Docker build follows a specific order. Errors at one stage will fail the entire build.

```dockerfile
# Order matters!
# 1. Install system dependencies
# 2. Install npm dependencies
# 3. Generate Prisma client
# 4. Build packages/config
# 5. Build packages/shared
# 6. Build packages/database
# 7. Build apps/api or apps/web
```

### Common Docker Build Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `TS7030: Not all code paths return a value` | Missing `return` in catch block | Add `return` before `next(error)` |
| `TS2345: Argument of type '"event:name"' is not assignable` | Socket event not in type definitions | Add event to `ClientToServerEvents`/`ServerToClientEvents` in `packages/shared/src/types/events.ts` |
| `TS2353: 'renotify' does not exist in type 'NotificationOptions'` | Web API property not in TypeScript types | Use type assertion: `{ ...options } as NotificationOptions` |
| `Cannot find module '@neon/shared'` | Package not built | Ensure build order is correct |
| `Prisma Client not generated` | Missing prisma generate | Run generate before build |
| `Module not found: @prisma/client` | Prisma not generated | Add prisma generate step |

### Testing Docker Build Locally

```bash
# Build both images
docker compose build

# Build specific image with verbose output
docker compose build api --no-cache --progress=plain

# View build logs
docker compose build 2>&1 | tee build.log
```

---

## Testing

### Before Committing

1. **TypeScript compilation**
   ```bash
   npm run build
   ```

2. **Lint check**
   ```bash
   npm run lint
   ```

3. **Docker build (if changing API/Web)**
   ```bash
   docker compose build
   ```

### Manual Testing Checklist

- [ ] API endpoints return expected format
- [ ] Frontend displays data correctly
- [ ] Error cases handled gracefully
- [ ] MFA flows work correctly
- [ ] Authentication/authorization working

---

## Common Issues & Solutions

### Issue: TS7030 in Express Handlers

**Symptom:**
```
error TS7030: Not all code paths return a value.
```

**Solution:** Add `return` before all `next()` calls in catch blocks.

### Issue: Type Not Exported from @prisma/client

**Symptom:**
```
Module '"@prisma/client"' has no exported member 'User'.
```

**Solution:** Run `npx prisma generate` to regenerate the client.

### Issue: Empty String Validation Fails

**Symptom:** Form submissions fail when optional fields are empty.

**Solution:** Transform empty strings to undefined in validation schemas:
```typescript
field: z.string().optional().or(z.literal('').transform(() => undefined))
```

### Issue: MFA Login Returns Error Instead of MFA Required

**Symptom:** Users with MFA enabled get error instead of MFA prompt.

**Solution:** Check that login service returns `{ requiresMfa: true }` response, not throws an error.

### Issue: Docker Build Cache Stale

**Symptom:** Changes not reflected in Docker build.

**Solution:**
```bash
docker compose build --no-cache
```

### Issue: Message CSS Word-Wrapping (Text Breaking Mid-Word)

**Symptom:** Short messages like "Hello!" appear broken across lines as "He\nllo!"

**Solution:** Add proper word-break CSS properties to `.message-bubble` class:
```css
.message-bubble {
  word-wrap: break-word;
  overflow-wrap: break-word;
  word-break: break-word;
  hyphens: auto;
  min-width: 0;
}
```

### Issue: Display Name Showing "Unknown" in Chat

**Symptom:** User display names appear as "Unknown" in conversation list or message cards.

**Cause:** Backend returns `displayName` but frontend was only checking for `name` property.

**Solution:** Update frontend to check for both properties:
```typescript
// Use displayName with fallback to name
const displayName = user?.displayName || user?.name || 'Unknown';
```

### Issue: Real-Time Messages Not Appearing Without Refresh

**Symptom:** Messages don't appear in real-time; page refresh required to see new messages. Same user in two browsers doesn't see messages sync. No message notifications.

**Cause:** When using Socket.io with Redis adapter for horizontal scaling, room-based broadcasting (`io.to(room).emit()`) from HTTP route handlers may not reliably deliver messages. The Redis pub/sub mechanism can fail to propagate events emitted from non-socket contexts.

**Solution:** Use direct socket emission by tracking socket IDs in memory and emitting directly to each socket. This bypasses the room/Redis adapter mechanism for reliable delivery:

```typescript
// Track socket IDs when users connect
const userSockets = new Map<string, Set<string>>();

// On connection
userSockets.get(userId)!.add(socket.id);

// Direct socket emission (RELIABLE)
const socketIds = userSockets.get(userId);
if (socketIds && socketIds.size > 0) {
  for (const socketId of socketIds) {
    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
      socket.emit('message:received', data);
    }
  }
}
```

**Key Points:**
1. Users are tracked in the `userSockets` Map when they connect (socket/index.ts)
2. On disconnect, socket IDs are removed from tracking
3. For message delivery, iterate through each user's socket IDs and emit directly
4. This ensures messages reach all connected browsers/devices for a user
5. Works regardless of whether user has "joined" a conversation room

**For conversation-wide events (messages, edits, reactions):**
```typescript
// broadcastToConversationParticipants in socket/index.ts
const participants = await prisma.conversationParticipant.findMany({
  where: { conversationId, leftAt: null },
  select: { userId: true },
});

for (const participant of participants) {
  const socketIds = userSockets.get(participant.userId);
  if (socketIds) {
    for (const socketId of socketIds) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit(event, data);
      }
    }
  }
}
```

**Frontend expects these events:**
- `message:received` - New message in conversation
- `message:edited` - Message was edited
- `message:deleted` - Message was deleted
- `notification` - General notifications
- `test:alert` - Test alerts (working as reference implementation)

### Issue: S3 Storage Secret Key Not Persisting

**Symptom:** S3 connection works during test but fails later; credentials appear lost.

**Cause:** When saving settings without re-entering the secret key (intentionally not pre-filled for security), empty string overwrites existing secret.

**Solution:** Only include `secretAccessKey` in save payload if user entered a new value:
```typescript
const storageData = { ...formData };
if (!storageData.secretAccessKey) {
  delete storageData.secretAccessKey;
}
saveMutation.mutate({ storage: storageData });
```

### Issue: Cross-Department Messaging Not Respecting Settings

**Symptom:** Users can message across departments even when disabled, or directional restrictions not enforced.

**Solution:** The permissions service must:
1. Load organization messaging settings from database
2. Check `crossDepartmentMessaging` flag before allowing cross-dept communication
3. Validate `crossDepartmentDirection` based on department ranks:
   - `both`: Bidirectional messaging allowed
   - `higher_to_lower`: Only higher-ranked departments can initiate
   - `lower_to_higher`: Only lower-ranked departments can initiate
   - `none`: No cross-department messaging
4. Apply `requireApprovalForCrossDept` when set

### Issue: TypeScript Build Fails with Type Assignment Errors

**Symptom:** Docker build or `npm run build` fails with TypeScript errors like:
```
error TS2322: Type '"new_value"' is not assignable to type '"allowed" | "values" | "only"'.
```

**Cause:** When adding new functionality that uses string literal types (union types), the code uses a new value that isn't included in the type definition. This commonly happens with:
- `source` fields in permission systems
- `status` or `type` enums
- API response types

**Example (from commit b1d1730):**
The `permissions.ts` service added `'org_policy'` as a permission source, but the `ResolvedPermission` type in `packages/database/src/types.ts` only allowed:
```typescript
source: 'user' | 'user_role' | 'role' | 'department' | 'default' | 'super_admin';
```

**Solution:**
1. When adding new string values, always check the type definition first
2. Update the type definition to include the new value:
```typescript
source: 'user' | 'user_role' | 'role' | 'department' | 'default' | 'super_admin' | 'org_policy';
```

**Prevention:**
1. **Run TypeScript build locally before committing:** `npm run build` or `npx tsc --noEmit`
2. **Search for type definitions:** When using a typed field, search for its definition (e.g., `grep -r "source:" packages/`)
3. **Co-locate type changes:** When adding new features that extend types, update the type definition in the same commit
4. **Use IDE type checking:** TypeScript-aware IDEs will highlight type errors immediately

### Issue: Duplicate Array.find() Calls in React Components

**Symptom:** Performance degradation or unnecessary re-computations in React components.

**Cause:** Finding the same item multiple times when only one lookup is needed:
```tsx
// Bad: Finds the same item twice
{participants.find(p => p.id !== userId)?.displayName ||
 participants.find(p => p.id !== userId)?.name}
```

**Solution:** Use an IIFE or extract to a variable:
```tsx
// Good: Single lookup
{(() => {
  const other = participants.find(p => p.id !== userId);
  return other?.displayName || other?.name;
})()}
```

Or extract to a useMemo for more complex cases:
```tsx
const otherUser = useMemo(() =>
  participants.find(p => p.id !== userId),
  [participants, userId]
);
```

### Issue: Browser Notification API Property Not in TypeScript (TS2353)

**Symptom:** TypeScript build fails with errors like:
```
error TS2353: Object literal may only specify known properties, and 'renotify' does not exist in type 'NotificationOptions'.
```

**Cause:** The Web Notifications API includes properties like `renotify`, `vibrate`, `silent`, and others that are valid according to the spec but are not included in TypeScript's built-in `NotificationOptions` type definition in `lib.dom.d.ts`.

**Example:**
```typescript
// Bad: TypeScript doesn't recognize 'renotify'
showBrowserNotification(title, {
  body: 'Message content',
  tag: 'conversation-123',
  renotify: true,  // ERROR: TS2353
});
```

**Solution:** Use type assertion to tell TypeScript the object conforms to `NotificationOptions`:
```typescript
// Good: Type assertion for extended notification options
showBrowserNotification(title, {
  body: 'Message content',
  tag: 'conversation-123',
  renotify: true,
} as NotificationOptions);
```

**Alternative Solution:** Create an extended interface for full type safety:
```typescript
// In a types file
interface ExtendedNotificationOptions extends NotificationOptions {
  renotify?: boolean;
  vibrate?: number[];
  silent?: boolean;
}

// Usage
showBrowserNotification(title, {
  body: 'Message content',
  renotify: true,
} as ExtendedNotificationOptions);
```

**Prevention:**
1. Be aware that TypeScript's DOM type definitions may not include all Web API properties
2. Check MDN documentation when using browser APIs for property availability
3. Use type assertions for valid API properties not in TypeScript definitions
4. Consider creating extended interfaces for frequently used browser APIs

### Issue: WebSocket Event Type Mismatch (TS2345)

**Symptom:** TypeScript build fails with errors like:
```
error TS2345: Argument of type '"event:name"' is not assignable to parameter of type 'ReservedOrUserEventNames<SocketReservedEventsMap, ClientToServerEvents>'.
```

**Cause:** New socket events were added to the implementation (e.g., `apps/api/src/socket/index.ts`) but not to the type definitions in `packages/shared/src/types/events.ts`.

**Example (from commit 650a19a):**
The socket server used string literals for test alert events:
```typescript
// Bad: Using string literals instead of typed constants
socket.on('test:alert:send', async (data) => { ... });
io.emit('test:alert', alert);
```

But `ClientToServerEvents` and `ServerToClientEvents` interfaces didn't include these events.

**Solution:**
1. Add event constants to `SocketEvents` in `packages/shared/src/types/events.ts`:
```typescript
export const SocketEvents = {
  // ... existing events
  TEST_ALERT_SEND: 'test:alert:send',
  TEST_ALERT: 'test:alert',
  TEST_ALERT_ACKNOWLEDGE: 'test:alert:acknowledge',
  TEST_ALERT_ACKNOWLEDGED: 'test:alert:acknowledged',
} as const;
```

2. Add client-to-server events to `ClientToServerEvents`:
```typescript
export interface ClientToServerEvents {
  // ... existing events
  [SocketEvents.TEST_ALERT_SEND]: (data: TestAlertSendPayload) => void;
  [SocketEvents.TEST_ALERT_ACKNOWLEDGE]: (data: TestAlertAcknowledgePayload) => void;
}
```

3. Add server-to-client events to `ServerToClientEvents`:
```typescript
export interface ServerToClientEvents {
  // ... existing events
  [SocketEvents.TEST_ALERT]: (alert: TestAlertPayload) => void;
  [SocketEvents.TEST_ALERT_ACKNOWLEDGED]: (data: TestAlertAcknowledgePayload) => void;
}
```

4. Add payload type definitions:
```typescript
export interface TestAlertSendPayload {
  title: string;
  body: string;
}

export interface TestAlertPayload {
  id: string;
  title: string;
  body: string;
  createdAt: string;
}

export interface TestAlertAcknowledgePayload {
  id: string;
}
```

5. Update implementation to use typed constants:
```typescript
// Good: Using typed constants
socket.on(SocketEvents.TEST_ALERT_SEND, async (data) => { ... });
io.emit(SocketEvents.TEST_ALERT, alert);
```

**Prevention:**
1. Always add new socket events to `SocketEvents` constant first
2. Update `ClientToServerEvents` for client → server events
3. Update `ServerToClientEvents` for server → client events
4. Define payload interfaces for type safety
5. Use `SocketEvents.EVENT_NAME` constants instead of string literals

---

## Getting Help

- Check existing issues/PRs for similar problems
- Review recent commit messages for context
- Test locally before pushing

---

*Last updated: December 2025*
