# Vercel Deployment Checklist

## Repository preparation

- [x] Vendor the matching `@workspace/db` and `@workspace/api-zod` sources into this standalone repository.
- [x] Declare the local pnpm workspace and commit `pnpm-lock.yaml`.
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
