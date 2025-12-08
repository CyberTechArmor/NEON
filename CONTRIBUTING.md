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

---

## Getting Help

- Check existing issues/PRs for similar problems
- Review recent commit messages for context
- Test locally before pushing

---

*Last updated: December 2025*
