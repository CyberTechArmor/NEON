# NEON

**Real-time collaboration platform for teams** — Open source, self-hosted, privacy-first.

Built by [Fractionate](https://fractionate.ai)

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

### Automated Setup (Recommended)

The easiest way to deploy NEON is using the interactive setup wizard:

```bash
# Clone the repository
git clone https://github.com/CyberTechArmor/NEON.git
cd NEON

# Run the setup wizard
./scripts/setup.sh
```

The wizard will:
- Ask for your domain name(s)
- Auto-generate all secrets (JWT, LiveKit, S3, encryption keys)
- Configure SSL with Let's Encrypt (optional)
- Create all environment files
- Generate reverse proxy configs if needed

### What You Need

- A server with Docker and Docker Compose
- A domain name pointing to your server
- (Optional) A separate subdomain for LiveKit video

### Docker Deployment

After running the setup wizard:

```bash
# Start all services
cd docker && docker compose up -d

# Initialize the database
docker compose exec api npm run db:migrate
docker compose exec api npm run db:seed

# View logs
docker compose logs -f
```

### Using Your Own Reverse Proxy

If you have an existing reverse proxy (nginx, Caddy, etc.), the setup wizard can generate configuration files for you:

```bash
# Generate configs for all proxy types
./scripts/generate-proxy-config.sh all your-domain.com livekit.your-domain.com true

# Or generate for a specific proxy
./scripts/generate-proxy-config.sh nginx your-domain.com livekit.your-domain.com true
```

Supported proxies: `nginx`, `caddy`, `haproxy`, `traefik`, `apache`

### Manual Setup

For development or custom configurations:

```bash
# Install dependencies
npm install

# Copy example env files
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# Edit the .env files with your configuration
# Then run database migrations
npm run db:migrate
npm run db:seed

# Start development servers
npm run dev
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

NEON Sustainable Use License — see [LICENSE](LICENSE) for details.

---

Built with care by Fractionate.
