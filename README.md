# Al-Bassam School API Server

Express API backend for the Al-Bassam School application. This repository is self-contained: its pnpm workspace includes the `@workspace/db` and `@workspace/api-zod` packages required by the API.

## Requirements

- Node.js 20 or newer
- pnpm 11.25.0 (or enable Corepack, which reads `packageManager`)
- Reachable PostgreSQL and MongoDB services for the corresponding data routes

## Local development

```bash
pnpm install --frozen-lockfile
cp .env.example .env
# Edit .env with database URLs reachable from this machine.
pnpm run typecheck
pnpm run build
pnpm run start
```

The API listens on `API_PORT` (default 3000 when using `start-local.sh`) or `PORT`. The helper loads `.env`, builds, then starts the server:

```bash
./start-local.sh
```

## Vercel deployment

Deploy this repository as a separate Vercel project with the repository root as its Root Directory. Vercel detects the Express app exported from `src/app.ts` and serves it as a single Node.js Function; all existing `/api/*` routes are handled by Express. `src/index.ts` is only the local/container listener. See [Express on Vercel](https://vercel.com/docs/frameworks/backend/express).

The checked-in `vercel.json` runs `pnpm install --frozen-lockfile` and `pnpm run vercel-build`. The build emits JavaScript for both workspace packages before the function is packaged, and `includeFiles` adds those outputs to the Express Function. This avoids runtime imports of uncompiled `.ts` workspace sources. No Output Directory is needed, and this function deployment does not use the Dockerfile.

To reproduce the build locally:

```bash
pnpm install --frozen-lockfile
pnpm run vercel-build
```

Configure these values in Vercel **Project Settings → Environment Variables**. Use database hosts accessible from Vercel, and use environment-specific values for Preview and Production as needed.

| Variable | Requirement | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Required | PostgreSQL connection string. The DB module checks this when the app loads; the health route also requires it to be set. Prefer a serverless-friendly connection pooler where appropriate. |
| `MONGODB_URI` | Needed for library data routes | MongoDB connection string. |
| `MONGODB_DB` | Optional | Defaults to `al_bassam_school`. |
| `FRONTEND_URL` | Needed for browser clients | Exact frontend origin allowed by CORS. |
| `MISTRAL_API_KEY` | Optional | Enables chat; without it, the chat endpoint returns 503. Store secrets only in Vercel, not in Git. |
| `MISTRAL_MODEL` | Optional | Defaults to `mistral-small-latest`. |
| `LOG_LEVEL` | Optional | Defaults to `info`. |

Vercel manages the function listener; `API_PORT` is for local/container use only. Provision PostgreSQL and MongoDB separately. The `pnpm db:push` command synchronizes the Drizzle schema; review the planned database changes and take an appropriate backup before running it against production.

After deployment, verify `GET https://<deployment>/api/healthz` returns `{"status":"ok"}`. Do not rely on local filesystem persistence in a serverless function.

## API endpoints

- `GET /api/healthz` — health check
- `/api/*` — school, library, and chat routes defined in `src/routes/`

## Environment example

`.env.example` is for local development only. Replace its localhost database URLs when running outside the included local services. Never commit real credentials.
