# Vercel Deployment Checklist

## Repository preparation

- [x] Vendor the matching `@workspace/db` and `@workspace/api-zod` sources into this standalone repository.
- [x] Declare the local pnpm workspace and commit `pnpm-lock.yaml`.
- [x] Compile workspace packages to Node-compatible JavaScript and include their output in the Vercel Function.
- [x] Keep the Express app exported from the Vercel-recognized `src/app.ts` entrypoint; use `src/index.ts` only for local/container listening.
- [x] Configure Vercel install and build commands in `vercel.json`.
- [x] Run the same `vercel-build` script locally before deploy.

## Before deploying

1. Import `mahmoud2391997/api-server` as its own Vercel project and use the repository root as the Root Directory.
2. Do not set an Output Directory; Vercel detects the Express app and deploys it as a Node.js Function.
3. Configure `DATABASE_URL` and the needed `MONGODB_URI`, `MONGODB_DB`, `FRONTEND_URL`, `MISTRAL_API_KEY`, `MISTRAL_MODEL`, and `LOG_LEVEL` variables under the appropriate Vercel environments. The `DATABASE_URL` setting is required at app startup.
4. Provision reachable managed databases. Review schema changes and back up the production database before running `pnpm db:push`; it is not run automatically during deployment.
5. Deploy a Preview first, then promote to Production after checking the API and configured CORS origin.

## Repository build verification

```bash
pnpm install --frozen-lockfile
pnpm run vercel-build
```

After deployment, call `GET /api/healthz` and expect `{"status":"ok"}`. A successful local build does not configure Vercel project settings or prove connectivity to production databases.

## Multi-School Support Features

### Database Schema
- [x] Schools table added with unique API keys
- [x] All data tables (students, teachers, books, etc.) linked to schools via school_id
- [x] Database migration created (0004_multi_school_support.sql)
- [x] Unique constraints per school (student numbers, employee codes, etc.)

### API Key Authentication
- [x] Authentication middleware implemented
- [x] API key validation on all protected endpoints
- [x] School activation status checking
- [x] X-API-Key header support in CORS

### School Registration
- [x] POST /api/register-school endpoint for first-time setup
- [x] Secure API key generation (format: sk-...)
- [x] School information endpoint (GET /api/school-info)
- [x] Default school migration for existing data

### Desktop Integration
- [x] API key embedded in desktop app configuration
- [x] Secure communication between desktop and API
- [x] Student/Admin panel synchronization via same API
- [x] Data isolation per school

### First-Time Setup Process
1. Register school via POST /api/register-school
2. Receive and securely store the API key
3. Configure desktop app with the API key
4. All subsequent requests use X-API-Key header
5. Student and admin panels sync through the same API
