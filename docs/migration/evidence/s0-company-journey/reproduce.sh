#!/bin/bash
set -uo pipefail
HERE=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
REPO=$(CDPATH= cd -- "$HERE/../../../.." && pwd)
BASELINE_COMMIT=a431f9afb6e761322109ea3b1b942e007b31eef2
COMPOSE_PROJECT=fenforce-s0-baseline
COMPOSE=(docker compose -p "$COMPOSE_PROJECT" -f "$REPO/packages/twenty-docker/docker-compose.dev.yml")
SERVER_URL=http://localhost:3000
BASELINE_FRONT_PORT=3100
PREVIEW_FRONT_PORT=3101
SERVER_ASSETS=packages/twenty-server/dist/assets/engine/core-modules
SERVER_SOURCE=packages/twenty-server/src/engine/core-modules

step() {
  printf '$ %s\n' "$*"
  "$@"
  printf '# exit: %s\n' "$?"
}

google_auth_library_path() {
  ls -d "$REPO"/node_modules/.bun/google-auth-library@*/node_modules | head -n 1
}

baseline_environment() {
  : "${APP_SECRET:?export APP_SECRET first, for example: export APP_SECRET=\$(openssl rand -hex 32)}"
  export NODE_ENV=development
  export PG_DATABASE_URL=postgres://postgres:postgres@localhost:5432/default
  export REDIS_URL=redis://localhost:6379
  export SIGN_IN_PREFILLED=true
  export IS_WORKSPACE_CREATION_LIMITED_TO_SERVER_ADMINS=false
  export FRONTEND_URL=http://localhost:$BASELINE_FRONT_PORT
  NODE_PATH=$(google_auth_library_path)
  export NODE_PATH
}

restore_baseline_yarn_assets() {
  cd "$REPO" || return 1
  for asset in \
    application/application-package/constants/seed-dependencies/yarn.lock \
    application/application-package/constants/yarn-engine/.yarnrc.yml \
    logic-function/logic-function-drivers/constants/common-layer-dependencies/yarn.lock; do
    mkdir -p "$(dirname "$SERVER_ASSETS/$asset")"
    git show "$BASELINE_COMMIT:$SERVER_SOURCE/$asset" > "$SERVER_ASSETS/$asset" || return 1
  done
}

provenance() {
  cd "$REPO" && bun docs/migration/evidence/s0-company-journey/capture-provenance.mjs
}

checks() {
  cd "$REPO" || return 1
  step bun docs/migration/check-map.mjs
  step bash "$HERE/diagnostics/checker-with-dead-link-removed.sh"
  step bun "$HERE/diagnostics/list-broken-links.mjs" docs/migration
  (
    cd deployments/convex || exit 1
    step bun run check
    step bunx vitest run convex/companyJourney.test.ts --reporter=verbose --silent=false
  )
  step bash "$HERE/diagnostics/journey-test-mutation-check.sh"
  step bash "$HERE/diagnostics/edit-payload-without-expected-revision.sh"
  step bunx vite-plus run --no-cache twenty-shared#build
  (
    cd packages/twenty-front || exit 1
    step bunx tsgo -p tsconfig.json --noEmit
    step bunx oxlint --type-aware -c .oxlintrc.json src/pages/convex-preview/
    step bunx oxfmt --check src/pages/convex-preview/
    step env REACT_APP_FENFORCE_CONVEX_URL=https://placeholder.invalid NODE_ENV=production NODE_OPTIONS=--max-old-space-size=8192 bunx vp build --outDir "$(mktemp -d)"
  )
}

baseline_up() {
  baseline_environment || return 1
  cd "$REPO" || return 1
  "${COMPOSE[@]}" up -d --wait || return 1
  (cd packages/twenty-server && bunx vite-plus run twenty-server#build) || return 1
  restore_baseline_yarn_assets || return 1
  (cd packages/twenty-server && bun run database:reset:seed:command)
}

baseline_server() {
  baseline_environment || return 1
  cd "$REPO/packages/twenty-server" || return 1
  exec node dist/main
}

baseline_front() {
  cd "$REPO/packages/twenty-front" || return 1
  exec env REACT_APP_SERVER_BASE_URL="$SERVER_URL" bun run start:command --port "$BASELINE_FRONT_PORT" --host 127.0.0.1
}

preview_front() {
  cd "$REPO/packages/twenty-front" || return 1
  exec env REACT_APP_FENFORCE_CONVEX_URL="$1" bun run start:command --port "$PREVIEW_FRONT_PORT" --host 127.0.0.1
}

baseline_run() {
  cd "$REPO" && bun docs/migration/evidence/s0-company-journey/twenty-baseline.ts
}

baseline_down() {
  cd "$REPO" && "${COMPOSE[@]}" down -v
}

case "${1:-}" in
  provenance | checks | baseline_up | baseline_server | baseline_front | baseline_run | baseline_down)
    "$1"
    ;;
  preview_front)
    preview_front "${2:?usage: reproduce.sh preview_front CONVEX_URL}"
    ;;
  *)
    echo "usage: reproduce.sh provenance|checks|baseline_up|baseline_server|baseline_front|baseline_run|baseline_down|preview_front CONVEX_URL" >&2
    exit 2
    ;;
esac
