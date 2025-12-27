# NEON Style Guide

> Code style, conventions, and patterns for the NEON codebase

---

## Table of Contents

1. [General Principles](#general-principles)
2. [TypeScript](#typescript)
3. [React Components](#react-components)
4. [State Management](#state-management)
5. [API Development](#api-development)
6. [Styling & CSS](#styling--css)
7. [File Organization](#file-organization)
8. [Testing](#testing)
9. [Git & Version Control](#git--version-control)

---

## General Principles

### Core Values

1. **Type Safety First** — Leverage TypeScript's strict mode to catch errors at compile time
2. **Explicit Over Implicit** — Be clear about intentions; avoid magic
3. **Consistency** — Follow established patterns throughout the codebase
4. **Simplicity** — Write code that's easy to understand and maintain
5. **Accessibility** — Build inclusive interfaces from the start

### Code Quality Standards

- All code must pass TypeScript strict mode
- All code must be formatted with Prettier
- All code must pass ESLint checks
- All new features should include tests
- All public APIs should be documented

---

## TypeScript

### Compiler Configuration

We use TypeScript 5.3+ with strict mode enabled:

```json
{
  "compilerOptions": {
    "strict": true,
    "strictNullChecks": true,
    "noImplicitAny": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true
  }
}
```

### Type Definitions

#### Interfaces vs Types

Use **interfaces** for object shapes that may be extended:

```typescript
// Good: Extendable object shape
interface User {
  id: string;
  email: string;
  name: string;
}

interface AdminUser extends User {
  permissions: string[];
}
```

Use **types** for unions, intersections, and computed types:

```typescript
// Good: Union type
type Status = 'online' | 'away' | 'busy' | 'offline';

// Good: Intersection type
type UserWithMeta = User & { createdAt: Date };

// Good: Utility type
type PartialUser = Partial<User>;
```

#### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Interfaces | PascalCase | `UserProfile` |
| Type aliases | PascalCase | `ApiResponse` |
| Enums | PascalCase | `MfaMethod` |
| Enum members | PascalCase | `MfaMethod.Totp` |
| Generic parameters | Single uppercase | `T`, `K`, `V` |

#### Props Interfaces

Name component props with the component name + `Props`:

```typescript
// Good
interface ButtonProps {
  variant: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}

// Bad
interface IButtonProps { }  // No 'I' prefix
interface Props { }         // Too generic
```

### Type Assertions

Avoid type assertions when possible. Prefer type guards:

```typescript
// Bad: Type assertion
const user = data as User;

// Good: Type guard
function isUser(data: unknown): data is User {
  return (
    typeof data === 'object' &&
    data !== null &&
    'id' in data &&
    'email' in data
  );
}

if (isUser(data)) {
  console.log(data.email); // Type-safe
}
```

### Null & Undefined

- Use `undefined` for optional values
- Use `null` only when interfacing with APIs that return `null`
- Always handle nullable values explicitly

```typescript
// Good: Explicit handling
function getUser(id: string): User | undefined {
  return users.find(u => u.id === id);
}

const user = getUser('123');
if (user) {
  console.log(user.name);
}

// Good: Optional chaining
console.log(user?.name ?? 'Unknown');
```

### Avoid `any`

Never use `any`. Use these alternatives:

| Instead of `any` | Use |
|------------------|-----|
| Unknown data | `unknown` |
| Any object | `Record<string, unknown>` |
| Any array | `unknown[]` |
| Any function | `(...args: unknown[]) => unknown` |

```typescript
// Bad
function parse(data: any): any { }

// Good
function parse(data: unknown): Record<string, unknown> { }
```

---

## React Components

### Component Structure

Use functional components with hooks:

```typescript
import { forwardRef, useState, useCallback } from 'react';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  'aria-label'?: string;
}

export const Toggle = forwardRef<HTMLButtonElement, ToggleProps>(
  ({ checked, onChange, disabled = false, label, size = 'md', ...props }, ref) => {
    const handleClick = useCallback(() => {
      if (!disabled) {
        onChange(!checked);
      }
    }, [checked, disabled, onChange]);

    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={props['aria-label'] ?? label}
        disabled={disabled}
        onClick={handleClick}
        className={getToggleClasses(size, checked, disabled)}
      >
        {label && <span className="sr-only">{label}</span>}
        <span className={getKnobClasses(size, checked)} />
      </button>
    );
  }
);

Toggle.displayName = 'Toggle';
```

### Component Patterns

#### Always Include

1. **TypeScript interface** for props
2. **Default values** for optional props
3. **displayName** for debugging
4. **Accessibility** attributes (aria-*, role)
5. **forwardRef** when DOM access is needed

#### Component File Structure

```typescript
// 1. Imports
import { useState, useCallback } from 'react';
import { SomeIcon } from 'lucide-react';

// 2. Types/Interfaces
interface ComponentProps {
  // ...
}

// 3. Helper functions (if small, else separate file)
function formatValue(value: number): string {
  return value.toFixed(2);
}

// 4. Component
export function Component({ prop1, prop2 }: ComponentProps) {
  // 4a. Hooks
  const [state, setState] = useState(false);

  // 4b. Derived values
  const computedValue = useMemo(() => /* ... */, [dep]);

  // 4c. Callbacks
  const handleClick = useCallback(() => {
    // ...
  }, []);

  // 4d. Effects
  useEffect(() => {
    // ...
  }, []);

  // 4e. Early returns
  if (!data) return null;

  // 4f. Render
  return (
    <div>
      {/* ... */}
    </div>
  );
}
```

### Hooks

#### Custom Hook Naming

Always prefix with `use`:

```typescript
// Good
function useFeatureFlags() { }
function useSecureFileUrl(fileId: string) { }
function useDebounce<T>(value: T, delay: number) { }

// Bad
function getFeatureFlags() { }  // Not a hook
function featureFlagsHook() { } // Wrong naming
```

#### Hook Organization

```typescript
// hooks/useAuth.ts
export function useAuth() {
  const user = useAuthStore((state) => state.user);
  const login = useAuthStore((state) => state.login);
  const logout = useAuthStore((state) => state.logout);

  return { user, login, logout, isAuthenticated: !!user };
}
```

### Event Handlers

Name event handlers with `handle` prefix:

```typescript
// Good
const handleClick = () => { };
const handleSubmit = (e: FormEvent) => { };
const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => { };

// Bad
const onClick = () => { };     // Conflicts with prop name
const clickHandler = () => { }; // Inconsistent
const doClick = () => { };      // Unclear purpose
```

### Conditional Rendering

Use clear, readable patterns:

```typescript
// Good: Ternary for simple conditions
{isLoading ? <Spinner /> : <Content />}

// Good: && for conditional display
{error && <ErrorMessage message={error} />}

// Good: Early return for complex conditions
if (isLoading) return <Spinner />;
if (error) return <ErrorMessage message={error} />;
return <Content data={data} />;

// Bad: Nested ternaries
{isLoading ? <Spinner /> : error ? <Error /> : <Content />}
```

### Lists & Keys

Always use stable, unique keys:

```typescript
// Good: Unique ID as key
{users.map((user) => (
  <UserCard key={user.id} user={user} />
))}

// Bad: Array index as key (unstable)
{users.map((user, index) => (
  <UserCard key={index} user={user} />
))}

// Bad: Non-unique key
{items.map((item) => (
  <Item key={item.type} item={item} />
))}
```

---

## State Management

### Zustand Stores

#### Store Structure

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  // State
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: true,

      // Actions
      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const response = await api.post('/auth/login', { email, password });
          const { user, accessToken } = response.data.data;
          set({ user, accessToken, isAuthenticated: true, isLoading: false });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      logout: async () => {
        await api.post('/auth/logout');
        set({ user: null, accessToken: null, isAuthenticated: false });
      },

      setUser: (user) => set({ user }),
    }),
    { name: 'auth-storage' }
  )
);
```

#### Selecting State

Select only what you need to prevent unnecessary re-renders:

```typescript
// Good: Select specific values
const user = useAuthStore((state) => state.user);
const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

// Bad: Select entire store
const authStore = useAuthStore();
```

### React Query

#### Query Patterns

```typescript
// Queries
const { data, isLoading, error, refetch } = useQuery({
  queryKey: ['users', orgId],
  queryFn: () => api.get(`/orgs/${orgId}/users`).then(r => r.data.data),
  staleTime: 60000,      // 1 minute
  gcTime: 300000,        // 5 minutes (formerly cacheTime)
  retry: 2,
  enabled: !!orgId,      // Conditional fetching
});

// Mutations
const mutation = useMutation({
  mutationFn: (newUser: CreateUserDto) => api.post('/users', newUser),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['users'] });
  },
  onError: (error) => {
    toast.error(getErrorMessage(error));
  },
});
```

#### Query Key Conventions

```typescript
// Pattern: [entity, ...identifiers, ...filters]
['users']                          // All users
['users', userId]                  // Specific user
['users', { org: orgId }]          // Users by org
['messages', channelId, { page }]  // Paginated messages
```

---

## API Development

### Route Handler Pattern

```typescript
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';

const router = Router();

// Validation schema
const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  role: z.enum(['member', 'admin']).default('member'),
});

// Route handler
router.post(
  '/users',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 1. Validate input
      const data = createUserSchema.parse(req.body);

      // 2. Business logic
      const user = await UserService.create({
        ...data,
        orgId: req.orgId!,
        createdBy: req.userId!,
      });

      // 3. Return success response
      return res.status(201).json({
        success: true,
        data: user,
        meta: {
          requestId: req.requestId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      return next(error);
    }
  }
);

export default router;
```

### Response Format

#### Success Response

```typescript
{
  success: true,
  data: {
    // Response payload
  },
  meta: {
    requestId: "uuid",
    timestamp: "2024-01-15T10:30:00.000Z",
    pagination?: {
      total: 100,
      page: 1,
      limit: 20,
      totalPages: 5,
      hasNext: true,
      hasPrev: false
    }
  }
}
```

#### Error Response

```typescript
{
  success: false,
  error: {
    code: "VALIDATION_ERROR",
    message: "Email is required",
    field?: "email",
    details?: {
      // Additional error context
    }
  },
  meta: {
    requestId: "uuid",
    timestamp: "2024-01-15T10:30:00.000Z"
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Input validation failed |
| `UNAUTHORIZED` | 401 | Authentication required |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource already exists |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

### Validation with Zod

```typescript
import { z } from 'zod';

// Reusable schemas
export const emailSchema = z.string().email().toLowerCase().trim();
export const slugSchema = z.string().min(3).max(50).regex(/^[a-z0-9-]+$/);
export const uuidSchema = z.string().uuid();

// Composite schema
export const createOrgSchema = z.object({
  name: z.string().min(1).max(100),
  slug: slugSchema,
  settings: z.object({
    allowPublicChannels: z.boolean().default(true),
    requireMfa: z.boolean().default(false),
  }).optional(),
});

// Extract types
export type CreateOrgDto = z.infer<typeof createOrgSchema>;
```

### Service Pattern

```typescript
// services/user.ts
import { prisma } from '@neon/database';
import { NotFoundError, ConflictError } from '../errors';

interface CreateUserParams {
  email: string;
  name: string;
  orgId: string;
}

export async function createUser(params: CreateUserParams) {
  const existing = await prisma.user.findUnique({
    where: { email: params.email },
  });

  if (existing) {
    throw new ConflictError('User with this email already exists');
  }

  return prisma.user.create({
    data: params,
  });
}

export async function getUserById(id: string) {
  const user = await prisma.user.findUnique({ where: { id } });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  return user;
}
```

---

## Styling & CSS

### Tailwind CSS

#### Class Organization

Order classes consistently:

```tsx
<div
  className={`
    // 1. Layout (display, position)
    flex items-center justify-between
    absolute top-0 left-0

    // 2. Sizing
    w-full h-12 min-w-0

    // 3. Spacing
    p-4 mx-auto gap-2

    // 4. Typography
    text-sm font-medium text-neon-text

    // 5. Visual (background, border, shadow)
    bg-neon-surface border border-neon-border rounded-lg
    shadow-neon

    // 6. States & Transitions
    hover:bg-neon-surface-hover focus:ring-2
    transition-colors duration-200

    // 7. Responsive
    md:flex-row lg:p-6
  `}
/>
```

#### Using NEON Colors

Always use the NEON color palette:

```tsx
// Good: NEON colors
<div className="bg-neon-bg text-neon-text border-neon-border" />
<span className="text-neon-text-secondary" />
<button className="bg-neon-surface hover:bg-neon-surface-hover" />

// Bad: Raw colors
<div className="bg-gray-900 text-white" />
<div className="bg-[#0d0d0d]" />
```

#### Status Colors

Use semantic status colors:

```tsx
// Online/Success
<span className="text-neon-success" />
<div className="bg-neon-success/20" />

// Warning/Away
<span className="text-neon-warning" />

// Error/Busy
<span className="text-neon-error" />

// Info
<span className="text-neon-info" />
```

### Component Classes

Use the predefined component classes from `globals.css`:

```tsx
// Buttons
<button className="btn-primary">Primary Action</button>
<button className="btn-secondary">Secondary</button>
<button className="btn-ghost">Ghost</button>
<button className="btn-danger">Delete</button>

// Button sizes
<button className="btn-primary btn-sm">Small</button>
<button className="btn-primary btn-lg">Large</button>

// Inputs
<input className="input" placeholder="Enter text..." />
<input className="input input-error" />

// Cards
<div className="card">Card content</div>
<div className="card card-hover">Hoverable card</div>

// Badges
<span className="badge badge-success">Online</span>
<span className="badge badge-warning">Away</span>
<span className="badge badge-error">Offline</span>
<span className="badge badge-info">New</span>
```

### Dynamic Classes

Use template literals for conditional classes:

```tsx
// Good: Template literal
<button
  className={`
    btn-primary
    ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}
    ${size === 'lg' ? 'btn-lg' : ''}
  `}
  disabled={isLoading}
>
  {isLoading ? 'Loading...' : 'Submit'}
</button>

// Good: Utility function
function getButtonClasses(variant: string, size: string, disabled: boolean) {
  return [
    'btn',
    `btn-${variant}`,
    size === 'lg' && 'btn-lg',
    size === 'sm' && 'btn-sm',
    disabled && 'opacity-50 cursor-not-allowed',
  ].filter(Boolean).join(' ');
}
```

### Responsive Design

Use mobile-first responsive classes:

```tsx
<div className="
  // Mobile (default)
  flex flex-col p-4 gap-2

  // Tablet (md: 768px+)
  md:flex-row md:p-6 md:gap-4

  // Desktop (lg: 1024px+)
  lg:p-8 lg:gap-6

  // Large desktop (xl: 1280px+)
  xl:max-w-6xl xl:mx-auto
">
```

### Animations

Use predefined animations:

```tsx
// Fade in
<div className="animate-fade-in">Content</div>

// Slide up (for modals)
<div className="animate-slide-up">Modal content</div>

// Scale in (for buttons/feedback)
<div className="animate-scale-in">Scaled content</div>

// Pulse (for loading)
<div className="animate-pulse-neon">Loading...</div>
```

### Accessibility

Always include focus states and screen reader support:

```tsx
// Visible focus ring
<button className="focus:ring-2 focus:ring-neon-border-focus focus:outline-none">
  Click me
</button>

// Screen reader only text
<button aria-label="Close modal">
  <XIcon className="w-5 h-5" />
  <span className="sr-only">Close modal</span>
</button>

// Skip to content link
<a href="#main-content" className="sr-only focus:not-sr-only">
  Skip to main content
</a>
```

---

## File Organization

### Directory Structure

```
apps/
├── api/
│   └── src/
│       ├── api/              # Route handlers by domain
│       │   ├── auth.ts
│       │   ├── users.ts
│       │   └── messages.ts
│       ├── services/         # Business logic
│       │   ├── auth.ts
│       │   └── user.ts
│       ├── middleware/       # Express middleware
│       │   ├── auth.ts
│       │   └── rateLimit.ts
│       ├── jobs/             # Background jobs
│       ├── socket/           # Socket.io handlers
│       ├── errors/           # Custom error classes
│       └── index.ts          # Entry point
│
└── web/
    └── src/
        ├── components/       # React components
        │   ├── common/       # Shared components
        │   │   ├── Button.tsx
        │   │   ├── Input.tsx
        │   │   └── Modal.tsx
        │   ├── chat/         # Chat feature components
        │   ├── settings/     # Settings components
        │   └── index.ts      # Barrel exports
        ├── pages/            # Page components
        │   ├── ChatPage.tsx
        │   └── SettingsPage.tsx
        ├── stores/           # Zustand stores
        │   ├── auth.ts
        │   └── chat.ts
        ├── hooks/            # Custom hooks
        │   ├── useAuth.ts
        │   └── useDebounce.ts
        ├── lib/              # Utilities
        │   ├── api.ts
        │   └── utils.ts
        ├── layouts/          # Layout components
        └── styles/           # Global CSS
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| **Components** | PascalCase.tsx | `UserProfile.tsx` |
| **Hooks** | camelCase with `use` | `useAuth.ts` |
| **Stores** | camelCase | `auth.ts` |
| **Services** | camelCase | `user.ts` |
| **Utilities** | camelCase | `formatDate.ts` |
| **Types** | PascalCase | `types.ts` or inline |
| **Constants** | SCREAMING_SNAKE | `API_URL` |
| **Directories** | kebab-case | `user-settings/` |

### Barrel Exports

Use `index.ts` for clean imports:

```typescript
// components/common/index.ts
export { Button } from './Button';
export { Input } from './Input';
export { Modal } from './Modal';
export type { ButtonProps } from './Button';

// Usage
import { Button, Input, Modal } from '@/components/common';
```

### Path Aliases

Use the `@/` alias for imports:

```typescript
// Good: Path alias
import { Button } from '@/components/common';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';

// Bad: Relative paths
import { Button } from '../../../components/common';
```

---

## Testing

### Test File Location

Place tests next to source files:

```
components/
├── Button.tsx
├── Button.test.tsx    # Unit tests
└── Button.stories.tsx # Storybook (if used)
```

Or in a `__tests__` directory for complex components:

```
components/
├── UserProfile/
│   ├── UserProfile.tsx
│   ├── UserAvatar.tsx
│   ├── __tests__/
│   │   ├── UserProfile.test.tsx
│   │   └── UserAvatar.test.tsx
│   └── index.ts
```

### Test Naming

```typescript
describe('UserProfile', () => {
  it('renders user name and email', () => { });
  it('shows loading state while fetching', () => { });
  it('displays error message on fetch failure', () => { });
  it('calls onEdit when edit button is clicked', () => { });
});
```

### Testing Patterns

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UserProfile } from './UserProfile';

describe('UserProfile', () => {
  const mockUser = {
    id: '1',
    name: 'John Doe',
    email: 'john@example.com',
  };

  it('renders user information', () => {
    render(<UserProfile user={mockUser} />);

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('john@example.com')).toBeInTheDocument();
  });

  it('calls onEdit when edit button is clicked', async () => {
    const onEdit = vi.fn();
    render(<UserProfile user={mockUser} onEdit={onEdit} />);

    fireEvent.click(screen.getByRole('button', { name: /edit/i }));

    await waitFor(() => {
      expect(onEdit).toHaveBeenCalledWith(mockUser.id);
    });
  });
});
```

---

## Git & Version Control

### Branch Naming

```
feature/add-user-authentication
bugfix/fix-login-redirect
hotfix/security-patch
refactor/simplify-api-client
docs/update-readme
```

### Commit Messages

Follow conventional commits:

```
feat: add user authentication flow
fix: resolve login redirect issue
docs: update API documentation
refactor: simplify error handling
test: add unit tests for UserService
chore: update dependencies
perf: optimize message loading
```

#### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Maintenance
- `perf`: Performance improvement
- `style`: Code style (formatting)

**Example:**

```
feat(auth): add MFA support

Implement TOTP-based multi-factor authentication:
- Add MFA setup flow in settings
- Integrate with authenticator apps
- Add backup codes generation

Closes #123
```

### Pull Request Guidelines

1. **Title**: Use conventional commit format
2. **Description**: Explain what and why
3. **Testing**: Document how to test
4. **Screenshots**: Include for UI changes
5. **Breaking Changes**: Highlight prominently

---

## Quick Reference

### Import Order

```typescript
// 1. React/Node built-ins
import { useState, useEffect } from 'react';

// 2. External packages
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

// 3. Internal packages (@neon/*)
import { prisma } from '@neon/database';

// 4. Internal aliases (@/*)
import { Button } from '@/components/common';
import { useAuth } from '@/hooks/useAuth';

// 5. Relative imports
import { UserCard } from './UserCard';
import type { User } from './types';

// 6. Styles (last)
import './styles.css';
```

### Common Patterns Checklist

- [ ] TypeScript strict mode compliance
- [ ] Props interface defined
- [ ] Default values for optional props
- [ ] Error boundaries for async operations
- [ ] Loading states handled
- [ ] Accessibility attributes included
- [ ] Responsive design implemented
- [ ] Tests written for new code

---

*This style guide is maintained by the NEON team. Last updated: December 2024*
