#!/bin/bash

# Local startup script for API server
# This script sets up environment variables and starts the server

cd "$(dirname "$0")/.."

# Set default environment variables if not already set
export NODE_ENV=${NODE_ENV:-development}
export API_PORT=${API_PORT:-3000}
export DATABASE_URL=${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/al_bassam_school}
export MONGODB_URI=${MONGODB_URI:-mongodb://localhost:27017}
export MONGODB_DB=${MONGODB_DB:-al_bassam_school}
export FRONTEND_URL=${FRONTEND_URL:-http://localhost:5173}
export LOG_LEVEL=${LOG_LEVEL:-info}

# Check if .env file exists and load it
if [ -f "artifacts/api-server/.env" ]; then
  export $(cat artifacts/api-server/.env | grep -v '^#' | xargs)
fi

echo "Starting API server..."
echo "NODE_ENV: $NODE_ENV"
echo "API_PORT: $API_PORT"
echo "DATABASE_URL: $DATABASE_URL"
echo "MONGODB_URI: $MONGODB_URI"
echo "MONGODB_DB: $MONGODB_DB"
echo "FRONTEND_URL: $FRONTEND_URL"

# Build and start
cd artifacts/api-server
pnpm run build
pnpm run start
