# API Server - Deployment Guide

This API server is ready for virtual deployment and serves as the backend for the Al-Bassam School application.

## Prerequisites

- Node.js 20+
- pnpm 8+
- Docker (for containerized deployment)
- PostgreSQL 16+
- MongoDB 7+

## Environment Variables

Create a `.env` file in the `artifacts/api-server` directory based on `.env.example`:

```bash
NODE_ENV=production
API_PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/al_bassam_school
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=al_bassam_school
FRONTEND_URL=http://localhost:5173
LOG_LEVEL=info
MISTRAL_API_KEY=your_mistral_api_key_here
MISTRAL_MODEL=mistral-small-latest
```

## Local Development

1. Install dependencies:
```bash
cd /Users/mahmoudelsayed/Downloads/al-basim-school-main
pnpm install
```

2. Build the API server:
```bash
cd artifacts/api-server
pnpm run build
```

3. Start the server:
```bash
export API_PORT=3000
pnpm run start
```

The server will be available at `http://localhost:3000`

## Docker Deployment

### Using Docker Compose (Recommended)

The included `docker-compose.yml` sets up the API server along with PostgreSQL and MongoDB databases.

1. Build and start all services:
```bash
cd artifacts/api-server
docker-compose up -d
```

2. View logs:
```bash
docker-compose logs -f api-server
```

3. Stop services:
```bash
docker-compose down
```

### Using Docker Build

1. Build the Docker image:
```bash
cd artifacts/api-server
docker build -t al-bassam-school-api -f Dockerfile ..
```

2. Run the container:
```bash
docker run -p 3000:3000 \
  -e NODE_ENV=production \
  -e API_PORT=3000 \
  -e DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:5432/al_bassam_school \
  -e MONGODB_URI=mongodb://host.docker.internal:27017 \
  -e MONGODB_DB=al_bassam_school \
  -e FRONTEND_URL=http://localhost:5173 \
  -e MISTRAL_API_KEY=your_key_here \
  al-bassam-school-api
```

## Vercel Deployment

The API server should be deployed as a separate Vercel project from the main frontend application.

**Important:** This API server uses pnpm workspaces and cannot be deployed using Vercel's standard deployment from a subdirectory. It must be deployed as a standalone project.

For Vercel deployment, you have two options:

### Option 1: Deploy the standalone api-server repository
This repository is already set up as a standalone project at `https://github.com/mahmoud2391997/api-server.git`.

1. Clone the api-server repository:
```bash
git clone https://github.com/mahmoud2391997/api-server.git
cd api-server
```

2. Install dependencies:
```bash
pnpm install
```

3. Deploy to Vercel:
```bash
npm i -g vercel
vercel
```

4. Set environment variables in Vercel dashboard:
   - `DATABASE_URL`
   - `MONGODB_URI`
   - `MONGODB_DB`
   - `FRONTEND_URL`
   - `MISTRAL_API_KEY`
   - `MISTRAL_MODEL`

### Option 2: Use Docker on Vercel (recommended)
For better compatibility with workspace dependencies, use Docker deployment on Vercel or another platform.

See the Docker deployment section above for instructions.

## API Endpoints

- `GET /api/healthz` - Health check endpoint
- `GET /api/*` - API routes (defined in `src/routes/`)

## Health Check

The server includes a health check endpoint that can be used for monitoring:
- Endpoint: `GET /api/healthz`
- Returns: `{ "status": "ok" }`

Docker containers use this endpoint for health checks every 30 seconds.

## Database Setup

### PostgreSQL
The project uses PostgreSQL for relational data. The `docker-compose.yml` includes a PostgreSQL service, or you can use an external instance.

### MongoDB
MongoDB is used for document storage. The `docker-compose.yml` includes a MongoDB service, or you can use an external instance (e.g., MongoDB Atlas).

## Build Process

The build process uses `esbuild` to bundle the TypeScript code into optimized JavaScript files. Native dependencies like `better-sqlite3` are externalized and must be available in the runtime environment.

## Monitoring

The server uses `pino` for structured logging. Logs can be configured via the `LOG_LEVEL` environment variable (debug, info, warn, error).

## Troubleshooting

### Docker Build Fails
- Ensure Docker daemon is running
- Check that all workspace files are accessible from the build context

### Database Connection Errors
- Verify DATABASE_URL and MONGODB_URI are correct
- Ensure database services are running and accessible
- Check network settings if using Docker (use `host.docker.internal` to access host services)

### Port Already in Use
- Change the port via the `API_PORT` environment variable
- Or stop the process using port 3000
