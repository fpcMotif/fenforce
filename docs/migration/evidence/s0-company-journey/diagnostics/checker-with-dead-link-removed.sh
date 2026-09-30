#!/bin/bash
set -eu
REPO=$(CDPATH= cd -- "$(dirname "$0")/../../../../.." && pwd)
SHIM=$(mktemp -d)
trap 'rm -rf "$SHIM"' EXIT

mkdir -p "$SHIM/docs/migration"
for entry in "$REPO"/* "$REPO"/.git "$REPO"/.github; do
  name=$(basename "$entry")
  [ "$name" = docs ] && continue
  ln -s "$entry" "$SHIM/$name"
done
ln -s "$REPO/docs/adr" "$SHIM/docs/adr"
ln -s "$REPO/docs/agents" "$SHIM/docs/agents"
cp "$REPO"/docs/migration/{README.md,frontend-map.md,backend-map.md,source-coverage.json,check-map.mjs} "$SHIM/docs/migration/"
rg --no-config -vF 'packages/twenty-ui/project.json' "$REPO/docs/migration/criteria-map.md" > "$SHIM/docs/migration/criteria-map.md" || true

echo "criteria-map.md lines removed: $(( $(wc -l < "$REPO/docs/migration/criteria-map.md") - $(wc -l < "$SHIM/docs/migration/criteria-map.md") ))"
cd "$SHIM"
bun docs/migration/check-map.mjs
bun docs/migration/check-map.mjs --self-test
