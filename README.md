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
| `FRONTEND_URL` | Optional | Currently not enforced as a CORS allowlist; the server reflects request origins. Do not treat CORS as an authentication boundary. |
| `ALLOW_PUBLIC_REGISTRATION` | Required for registration policy | Set to `true` to enable registration without a registration secret; any other value requires the configured secret. Registration still requires the desktop app key. |
| `REGISTRATION_SECRET` | Required unless public registration is enabled | Secret sent as `X-Registration-Secret` for `POST /api/register-school`. Keep it in Vercel secrets. |
| `api_key` | Required | Shared server-side key expected in `X-App-API-Key` for registration, `/api/school-info`, `/api/sync/*`, and `/api/admin/*`. Keep it in Vercel secrets and embed the matching value in the desktop build. |
| `MISTRAL_API_KEY` | Optional | Enables chat; without it, the chat endpoint returns 503. Store secrets only in Vercel, not in Git. |
| `MISTRAL_MODEL` | Optional | Defaults to `mistral-small-latest`. |
| `LOG_LEVEL` | Optional | Defaults to `info`. |

Vercel manages the function listener; `API_PORT` is for local/container use only. Provision PostgreSQL and MongoDB separately. The `pnpm db:push` command synchronizes the Drizzle schema; review the planned database changes and take an appropriate backup before running it against production.

After deployment, verify `GET https://<deployment>/api/healthz` returns `{"status":"ok"}`. Do not rely on local filesystem persistence in a serverless function.

## API endpoints

Public/no-school-key endpoints:

- `GET /api/healthz` — health check
- `POST /api/register-school` — register a school; requires `X-App-API-Key` and, unless `ALLOW_PUBLIC_REGISTRATION=true`, the configured `X-Registration-Secret`; rate limited to 5 attempts per IP per 15 minutes
- `POST /api/student/login` — student sign-in; returns a short-lived student JWT

Authenticated endpoints (send `X-API-Key`):

- `GET /api/school-info`
- `GET /api/library/student-data`
- `GET|POST /api/sync/library` — desktop-to-cloud library snapshot sync used by student-library reads; requires both `X-App-API-Key` and `X-API-Key`
- `GET|POST /api/students`, `DELETE /api/students/:id`
- `GET|POST /api/teachers`, `DELETE /api/teachers/:id`
- `GET|POST|PATCH|DELETE /api/library/books` and `/api/library/books/:id`
- `GET|POST|PATCH /api/library/borrows` and `/api/library/borrows/:id/return`
- `GET|POST /api/attendance`
- `GET /api/academic-years`, `/api/dashboard/summary`, and `/api/borrows/due-today`
- `POST /api/chat`

Every `/api` route except health, registration, and student login requires a valid active school API key. `/api/admin/*`, `/api/school-info`, `/api/sync/*`, and registration also require the desktop app key. CORS preflight requests are handled before authentication, and requests without an `Origin` header remain allowed for the desktop app. The school API key is resolved to the school for each request; library sync never falls back to a default school. CORS reflects request origins and disables cookies; both API keys must remain secret.

### Desktop library sync

The desktop app sends both its server-configured desktop key and its school key. This endpoint writes to the MongoDB collections used by `/api/student/library/books`; `/api/library/sync` is the separate legacy relational-data endpoint.

```bash
curl -X POST https://<api-deployment>/api/sync/library \
  -H "Content-Type: application/json" \
  -H "X-App-API-Key: <desktop-app-key>" \
  -H "X-API-Key: sk-your-school-key" \
  -d '{"books": [], "borrows": []}'
```

The server scopes the sync to the school associated with that key. Do not put the key in a browser-visible frontend bundle.

## Multi-School Support

The API supports multiple schools with data isolation. Each school has:

- **Unique API Key**: Generated during school registration
- **Isolated Data**: Students, teachers, books, and other data are scoped by school
- **Independent Operations**: Each school operates independently with its own data

### First-Time Setup

The desktop API key is always required for registration. When `ALLOW_PUBLIC_REGISTRATION` is not `true`, the request must also include `X-Registration-Secret` matching `REGISTRATION_SECRET`; when it is `true`, the registration-secret check is bypassed. Keep public registration disabled after onboarding when possible.

When setting up a new school:

1. **Register the School**:
```bash
curl -X POST http://localhost:3000/api/register-school \
  -H "Content-Type: application/json" \
  -H "X-App-API-Key: <desktop-app-key>" \
  -H "X-Registration-Secret: <registration-secret>" \
  -d '{
    "name": "My School",
    "nameArabic": "مدرستي",
    "code": "SCHOOL001",
    "address": "123 School St",
    "phone": "555-1234",
    "email": "admin@school.com",
    "principalName": "Principal Name"
  }'
```

2. **Save the API Key**: The response includes a unique API key (format: `sk-...`). Store this securely in your desktop application configuration.

3. **Use the API Key**: Include it in all subsequent requests:
```bash
curl -H "X-API-Key: sk-your-api-key-here" \
  http://localhost:3000/api/students
```

### API Key Authentication

School data endpoints require `X-API-Key`; `/api/healthz`, `/api/register-school`, and `/api/student/login` are exceptions. Desktop registration, `/api/school-info`, `/api/sync/*`, and `/api/admin/*` additionally require `X-App-API-Key`:

- **Header**: `X-API-Key: sk-your-api-key-here`
- **Security**: Each school has a unique key; never share it
- **Desktop Integration**: Embed the API key in your desktop application configuration
- **Hacking Prevention**: Invalid keys are rejected; inactive schools are blocked

### Student/Admin Panel Sync

Both the student panel and admin panel connect to the same API:

1. **Admin Panel**: Uses the school's API key for full access to manage students, teachers, books, etc.
2. **Student Panel**: Uses the same API key but may have restricted access based on user permissions
3. **Data Consistency**: Both panels access the same real-time data from the database
4. **Secure Communication**: All requests are authenticated via API key

## Environment example

`.env.example` is for local development only. Replace its localhost database URLs when running outside the included local services. Never commit real credentials.
