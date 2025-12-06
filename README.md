# NEON

**Real-time collaboration platform for teams** — Open source, self-hosted, privacy-first.

Built by [Fractionate](https://fractionate.com)

---

## Overview

NEON is a complete real-time collaboration platform designed for organizations that need secure, compliant communication. It provides encrypted messaging, video calls, and meetings without relying on paid third-party services.

### Key Features

- **Real-time Messaging** — Channels, direct messages, threads, reactions, file sharing
- **Video & Audio Calls** — 1:1 and group calls powered by LiveKit
- **Scheduled Meetings** — Calendar integration with recurring events
- **End-to-End Encryption** — Messages encrypted at rest and in transit
- **SSO Integration** — LDAP, OAuth2, SAML, OIDC support
- **Federation** — Connect multiple NEON instances across organizations
- **Audit Logging** — Hash-chained logs for HIPAA/GDPR compliance
- **Self-Hosted** — Full control over your data

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **API** | Node.js, Express, Socket.io |
| **Database** | PostgreSQL, Prisma ORM |
| **Cache** | Redis |
| **Media** | LiveKit (WebRTC) |
| **Storage** | S3-compatible (Garage) |
| **Frontend** | React 18, Vite, TypeScript |
| **Styling** | Tailwind CSS |
| **State** | Zustand, React Query |

---

## Project Structure

```
neon/
├── apps/
│   ├── api/          # Express API server
│   └── web/          # React PWA client
├── packages/
│   ├── database/     # Prisma schema & migrations
│   ├── shared/       # Shared types & utilities
│   └── config/       # ESLint, TypeScript configs
└── docker/           # Docker Compose setup
```

---

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Redis 7+
- LiveKit server (for video calls)
- S3-compatible storage (optional)

### Installation

```bash
# Clone the repository
git clone https://github.com/fractionate/neon.git
cd neon

# Install dependencies
npm install

# Set up environment variables
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# Run database migrations
npm run db:migrate

# Seed initial data
npm run db:seed

# Start development servers
npm run dev
```

### Docker Deployment

```bash
# Start all services
npm run docker:up

# View logs
npm run docker:logs
```

---

## Environment Variables

### API Server (`apps/api/.env`)

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/neon
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key
LIVEKIT_URL=wss://livekit.example.com
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret
S3_ENDPOINT=http://localhost:3900
S3_ACCESS_KEY=your-access-key
S3_SECRET_KEY=your-secret-key
```

### Web Client (`apps/web/.env`)

```env
VITE_API_URL=http://localhost:3001
VITE_WS_URL=ws://localhost:3001
VITE_LIVEKIT_URL=wss://livekit.example.com
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start all apps in development mode |
| `npm run build` | Build all apps for production |
| `npm run test` | Run test suites |
| `npm run lint` | Lint all packages |
| `npm run db:migrate` | Run database migrations |
| `npm run db:studio` | Open Prisma Studio |
| `npm run docker:up` | Start Docker services |

---

## Admin Features

- **User Management** — Create, edit, disable users with role assignment
- **Roles & Permissions** — Granular permission system with inheritance
- **SSO Configuration** — Connect LDAP, OAuth, SAML, or OIDC providers
- **Federation Bridges** — Link with other NEON instances
- **Bulk Import** — CSV upload for mass user creation
- **Audit Logs** — Tamper-evident activity tracking

---

## Compliance

NEON is designed with compliance in mind:

- **HIPAA** — Audit logging, encryption, access controls
- **GDPR** — Data export, deletion, consent management
- **SOC 2** — Security policies, monitoring, incident response

---

## Contributing

We welcome contributions. Please read our contributing guidelines before submitting a pull request.

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

Built with care by Fractionate.
