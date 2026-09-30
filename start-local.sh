#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

export NODE_ENV="${NODE_ENV:-development}"
export API_PORT="${API_PORT:-3000}"
export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/al_bassam_school}"
export MONGODB_URI="${MONGODB_URI:-mongodb://localhost:27017}"
export MONGODB_DB="${MONGODB_DB:-al_bassam_school}"
export FRONTEND_URL="${FRONTEND_URL:-http://localhost:5173}"
export LOG_LEVEL="${LOG_LEVEL:-info}"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

pnpm run build
exec pnpm run start
