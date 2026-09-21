# Deploying NEON on ProxyPilot

This directory is the production deployment of NEON onto an Incus/LXC guest
managed by [ProxyPilot](https://github.com/CyberTechArmor/ProxyPilot). It is
self-contained and does **not** use `docker/docker-compose.yml` — that file is
the development stack (bind-mounted sources, dev build targets, published
database ports). Nor does it use `scripts/setup.sh`, which is interactive and
rewrites `docker/docker-compose.yml` in place.

## Shape of the deployment

One LXC guest runs the whole stack under Docker. Nothing in the guest listens on
a public address; ProxyPilot's Caddy is the only edge, and it terminates TLS.

```
                       ProxyPilot host (Caddy, :443)
  chat.fractionate.ai/          ──▶  guest:3000   web (nginx + SPA)
  chat.fractionate.ai/api       ──▶  guest:3001   api (Express)
  chat.fractionate.ai/socket.io ──▶  guest:3001   api (Socket.io)
  chat.fractionate.ai/livekit   ──▶  guest:7880   livekit  (prefix stripped)
  neon-s3.fractionate.ai/       ──▶  guest:3900   garage   (path preserved)

                 guest (Docker network "neon")
  web ─┬─▶ api ─┬─▶ postgres
       │        ├─▶ redis
       │        ├─▶ garage
       │        └─▶ livekit
```

Two things about that table are load-bearing:

- **`/livekit` is stripped, `neon-s3` is not.** The LiveKit client SDK appends
  its own paths to the server URL, so a stripped prefix is transparent to it.
  Pre-signed S3 URLs are the opposite case: SigV4 covers the path, so anything
  that rewrites it invalidates the signature. That is why object storage gets
  its own hostname rather than a path on the app's.
- **Media does not go through Caddy.** Only LiveKit *signalling* is proxied.
  WebRTC media needs host→guest forwards for `7881/tcp` and `50000-50100/udp`,
  which ProxyPilot manages as Incus proxy devices (`set_port_forward`).

## Files

| File | Purpose |
|------|---------|
| `docker-compose.prod.yml` | The production stack. Standalone, not an overlay. |
| `startup.sh` | Registered as the guest's ProxyPilot startup script. Idempotent: installs Docker if needed, builds, bootstraps, migrates, starts. |
| `scripts/bootstrap-garage.sh` | First-run Garage cluster layout, access key, buckets, CORS. |
| `scripts/put-bucket-cors.cjs` | Bucket CORS via the S3 API (Garage has no CLI verb for it). |
| `garage.toml`, `livekit.yaml` | Service configs, deliberately credential-free — secrets arrive through the environment. |
| `env/*.env.example` | Templates. The real `env/*.env` are gitignored. |

## First deployment

1. **Create the guest** (8 vCPU / 12 GB / 80 GB is comfortable; the web build is
   the memory-hungry step) with Docker-ready flags set, and clone this repo into
   it.

2. **Write the two environment files** from their examples:

   ```bash
   cd deploy/proxypilot/env
   cp deploy.env.example deploy.env      # compose interpolation
   cp api.env.example    api.env         # the API container's environment
   chmod 600 deploy.env api.env
   ```

   Generate every secret rather than editing the placeholders by hand:

   ```bash
   openssl rand -hex 24      # POSTGRES_PASSWORD, REDIS_PASSWORD
   openssl rand -hex 32      # GARAGE_RPC_SECRET, GARAGE_ADMIN_TOKEN, ENCRYPTION_KEY
   openssl rand -base64 48   # JWT_SECRET, SESSION_SECRET
   ```

   `LIVEKIT_KEYS` in `deploy.env` and `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` in
   `api.env` are the same pair, written two ways — keep them in step or calls
   fail to authenticate.

   You do **not** write `env/garage.env`; `bootstrap-garage.sh` mints the S3 key
   on the first run and writes it there.

3. **Run the startup script** (from ProxyPilot: `rerun_startup`, with a generous
   `timeout_seconds` — the first build compiles the API and the React bundle):

   ```bash
   ./startup.sh
   ```

4. **Publish the routes** — root, `/api`, `/socket.io`, `/livekit` (stripped),
   and the S3 hostname. See the diagram above for ports.

5. **Sign in** as `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `api.env` and change the
   password.

## Re-running

`startup.sh` is safe to run again and is the normal way to deploy a change:

```bash
git pull && ./startup.sh
```

It rebuilds images, re-applies migrations (a no-op when there is nothing new),
skips the Garage bootstrap once the layout and key exist, and restarts the app
containers. The seed is a no-op once an organization row exists. Data lives in
named Docker volumes (`postgres_data`, `redis_data`, `garage_data`,
`garage_meta`) and is untouched.

Changing a public URL is the one case that needs care: `PUBLIC_API_URL` and
`PUBLIC_WS_URL` are re-read at container start (the image entrypoint writes
`/config.js`), but `PUBLIC_LIVEKIT_URL` is read from `import.meta.env` inside
the call pages and is therefore baked into the bundle — change it and rebuild
the web image.

## Troubleshooting

```bash
cd deploy/proxypilot
docker compose --env-file env/deploy.env -f docker-compose.prod.yml ps
docker compose --env-file env/deploy.env -f docker-compose.prod.yml logs -f api
tail -f /var/log/neon-deploy.log         # what startup.sh did, and when
```

- **A 502 at the edge with a healthy container** is a stale route binding, not
  an app fault — ProxyPilot records the upstream IP when the route is created,
  so re-point it if the guest's address changed.
- **Uploads fail in the browser but work from the API** — check bucket CORS
  (`scripts/put-bucket-cors.cjs`) and that `S3_PUBLIC_ENDPOINT` is a host whose
  path is proxied verbatim.
- **Calls connect then freeze** — signalling is working and media is not: check
  the host port forwards for `7881/tcp` and `50000-50100/udp`.
