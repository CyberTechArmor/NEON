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
  neon-s3.fractionate.ai/       ──▶  guest:3900   garage   (path preserved)

                 guest (Docker network "neon")
  web ─┬─▶ api ─┬─▶ postgres
       │        ├─▶ redis
       │        └─▶ garage
       │
       └─▶ (iframe) ──▶ meet.fractionate.ai   — a separate MEET deployment
```

Two things about that diagram are load-bearing:

- **There is no SFU in this stack.** Calls and meetings are MEET rooms, framed
  by the NEON client and driven over MEET's postMessage bridge. NEON mints a
  room code and builds a join URL; MEET issues the media token to the iframe
  itself. So nothing here terminates WebRTC, and no media ports are forwarded
  to this guest — that is MEET's deployment's job, not NEON's.
- **`neon-s3` keeps its path.** Pre-signed S3 URLs are signed with SigV4, which
  covers the URL path, so anything that rewrites the path in transit
  invalidates the signature. That is why object storage gets its own hostname
  rather than a path on the app's.

## Files

| File | Purpose |
|------|---------|
| `docker-compose.prod.yml` | The production stack. Standalone, not an overlay. |
| `bootstrap.sh` | Registered as the guest's ProxyPilot startup script. Syncs the checkout, then launches `startup.sh` as the transient `neon-deploy.service` and returns — a full deploy outlasts any tool call that would block on it. |
| `startup.sh` | The deploy itself. Idempotent: installs Docker if needed, builds, bootstraps, migrates, starts. |
| `scripts/bootstrap-garage.sh` | First-run Garage cluster layout, access key, buckets, CORS. |
| `scripts/put-bucket-cors.cjs` | Bucket CORS via the S3 API (Garage has no CLI verb for it). |
| `garage.toml` | Garage's config, deliberately credential-free — secrets arrive through the environment. |
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

   `MEET_BASE_URL` in `api.env` must be the exact origin the browser loads
   (it becomes the API's CSP `frame-src` and the postMessage target origin, and
   both are compared literally). `MEET_API_URL` is server-side only.

   You do **not** write `env/garage.env`; `bootstrap-garage.sh` mints the S3 key
   on the first run and writes it there.

3. **Run the deploy** — from ProxyPilot, `rerun_startup`; it returns straight
   away and the work continues in `neon-deploy.service`. Follow it with:

   ```bash
   systemctl status neon-deploy
   journalctl -u neon-deploy -f
   ```

   The first run compiles the API and the React bundle, so give it a few
   minutes.

4. **Publish the routes** — root, `/api`, `/socket.io`, and the S3 hostname.
   See the diagram above for ports. MEET is reached directly by the browser at
   its own hostname, so it needs no route here — but its route must allow
   framing from this app's origin.

5. **Sign in** as `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `api.env` and change the
   password.

## Re-running

`startup.sh` is safe to run again and is the normal way to deploy a change:

```bash
git pull && ./startup.sh        # or, from ProxyPilot, just rerun_startup
```

It rebuilds images, re-applies migrations (a no-op when there is nothing new),
skips the Garage bootstrap once the layout and key exist, and restarts the app
containers. The seed is a no-op once an organization row exists. Data lives in
named Docker volumes (`postgres_data`, `redis_data`, `garage_data`,
`garage_meta`) and is untouched.

`PUBLIC_API_URL` and `PUBLIC_WS_URL` are re-read at container start (the image
entrypoint writes `/config.js`), so changing them is a restart, not a rebuild.
The MEET origin is not baked into the bundle at all — the API sends it with
each call's join response, so pointing NEON at a different MEET is an `api.env`
change and an API restart.

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
- **The call frame is blank or refuses to load** — MEET is not allowing itself
  to be framed from this origin. Its reverse-proxy route needs `frame-ancestors`
  to include the NEON origin, and NEON's `MEET_BASE_URL` must match the framed
  origin exactly.
- **Calls connect then freeze** — signalling works, media doesn't. That is
  MEET's media path (its own TCP/UDP forwards), not anything in this stack.
