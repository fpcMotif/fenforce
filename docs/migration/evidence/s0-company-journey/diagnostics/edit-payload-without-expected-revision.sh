#!/bin/bash
set -u
REPO=$(CDPATH= cd -- "$(dirname "$0")/../../../../.." && pwd)
SRC=$REPO/deployments/convex
PROBE=$(mktemp -d)
trap 'rm -rf "$PROBE"' EXIT

cp "$SRC/package.json" "$SRC/tsconfig.json" "$PROBE/"
ln -s "$SRC/node_modules" "$PROBE/node_modules"
cp -R "$SRC/convex" "$PROBE/convex"
rm -f "$PROBE"/convex/*.test.ts
cp "$(dirname "$0")/edit-payload-without-expected-revision.test.ts" "$PROBE/convex/editProbe.test.ts"

cd "$PROBE" && bunx vitest run convex/editProbe.test.ts --silent=false 2>&1 | rg --no-config 'EDIT_PROBE|Tests ' | cut -c1-260
