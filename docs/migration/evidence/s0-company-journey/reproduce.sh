#!/bin/bash
set -uo pipefail
HERE=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
REPO=$(CDPATH= cd -- "$HERE/../../../.." && pwd)
BASELINE_COMMIT=a431f9afb6e761322109ea3b1b942e007b31eef2
COMPOSE=(docker compose -f "$REPO/packages/twenty-docker/docker-compose.dev.yml")
SERVER_ASSETS=packages/twenty-server/dist/assets/engine/core-modules
SERVER_SOURCE=packages/twenty-server/src/engine/core-modules

google_auth_library_path() {
  ls -d "$REPO"/node_modules/.bun/google-auth-library@*/node_modules | head -n 1
}

restore_baseline_yarn_assets() {
  cd "$REPO"
  for asset in \
    application/application-package/constants/seed-dependencies/yarn.lock \
    application/application-package/constants/yarn-engine/.yarnrc.yml \
    logic-function/logic-function-drivers/constants/common-layer-dependencies/yarn.lock; do
    mkdir -p "$(dirname "$SERVER_ASSETS/$asset")"
    git show "$BASELINE_COMMIT:$SERVER_SOURCE/$asset" > "$SERVER_ASSETS/$asset"
  done
}

provenance() {
  cd "$REPO" && bun docs/migration/evidence/s0-company-journey/capture-provenance.mjs
}

checks() {
  cd "$REPO"
  bun docs/migration/check-map.mjs
  bash "$HERE/diagnostics/checker-with-dead-link-removed.sh"
  (cd deployments/convex && bun run check && bunx vitest run convex/companyJourney.test.ts --reporter=verbose --silent=false)
  bunx vite-plus run --no-cache twenty-shared#build
  (cd packages/twenty-front \
    && bunx tsgo -p tsconfig.json --noEmit; \
    bunx oxlint --type-aware -c .oxlintrc.json src/pages/convex-preview/ \
    && bunx oxfmt --check src/pages/convex-preview/ \
    && env REACT_APP_FENFORCE_CONVEX_URL=https://placeholder.invalid NODE_ENV=production NODE_OPTIONS=--max-old-space-size=8192 bunx vp build --outDir "$(mktemp -d)")
}

baseline_up() {
  cd "$REPO"
  "${COMPOSE[@]}" up -d --wait
  awk -v secret="$(openssl rand -hex 32)" '{ sub(/replace_me_with_a_random_string/, secret); sub(/localhost:3001/, "localhost:3100") } 1' \
    packages/twenty-server/.env.example > packages/twenty-server/.env
  cp packages/twenty-front/.env.example packages/twenty-front/.env
  (cd packages/twenty-server && bunx vite-plus run twenty-server#build)
  restore_baseline_yarn_assets
  (cd packages/twenty-server \
    && env NODE_PATH="$(google_auth_library_path)" bun run database:reset:seed:command)
}

baseline_server() {
  cd "$REPO/packages/twenty-server"
  exec env NODE_PATH="$(google_auth_library_path)" NODE_ENV=development node dist/main
}

baseline_run() {
  cd "$REPO" && bun docs/migration/evidence/s0-company-journey/twenty-baseline.ts
}

baseline_down() {
  cd "$REPO"
  "${COMPOSE[@]}" down -v
  rm -f packages/twenty-server/.env packages/twenty-front/.env
}

"${1:?usage: reproduce.sh provenance|checks|baseline_up|baseline_server|baseline_run|baseline_down}"
