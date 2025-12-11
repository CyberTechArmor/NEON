## Description

<!-- Briefly describe what this PR does -->

## Type of Change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Documentation update
- [ ] Infrastructure/DevOps change

## Testing

<!-- Describe how you tested your changes -->

- [ ] I have tested this locally
- [ ] I have added/updated tests as appropriate
- [ ] All existing tests pass

---

## Docker Changes Checklist

**If this PR modifies Docker configuration (`docker/`, `Dockerfile*`, or container-related code), please verify:**

### Build & Startup
- [ ] `docker compose build` succeeds without errors
- [ ] `docker compose up -d` starts all services
- [ ] All containers reach "healthy" status (check with `docker compose ps`)
- [ ] No errors in container logs (`docker compose logs`)

### Healthchecks
- [ ] Any tools used in healthchecks (wget, curl, etc.) are installed in the Dockerfile
- [ ] Healthcheck endpoints are accessible from within the container

### URLs & Networking
- [ ] `VITE_API_URL` uses browser-accessible URLs (NOT Docker internal hostnames like `http://api:3001`)
- [ ] For local dev: URLs should use `localhost` or `127.0.0.1`
- [ ] For production: URLs should use the actual domain
- [ ] `CORS_ORIGINS` includes the web app's origin

### Environment Variables
- [ ] New environment variables have sensible defaults
- [ ] `SEED_DATABASE` defaults to `true` for first-time setup
- [ ] Sensitive defaults are only used for development (not production)

### Documentation
- [ ] Updated `docker-compose.yml.example` if docker-compose.yml was changed
- [ ] Added comments explaining non-obvious configuration

### Smoke Test
- [ ] Ran `./scripts/smoke-test.sh` and all tests pass

---

## Screenshots (if applicable)

<!-- Add screenshots here if this PR includes UI changes -->

## Additional Notes

<!-- Any other information that reviewers should know -->
