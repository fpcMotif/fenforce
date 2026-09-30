#!/bin/bash
set -u
REPO=$(CDPATH= cd -- "$(dirname "$0")/../../../../.." && pwd)
SRC=$REPO/deployments/convex
MUTANT=$(mktemp -d)
trap 'rm -rf "$MUTANT"' EXIT

cp "$SRC/package.json" "$SRC/tsconfig.json" "$MUTANT/"
ln -s "$SRC/node_modules" "$MUTANT/node_modules"
cp -R "$SRC/convex" "$MUTANT/convex"

awk '/throw new ConvexError\(.FORBIDDEN.\);/ && !done { print "    return { role: \"member\", _id: \"mutant\" } as never;"; done = 1; next } { print }' \
  "$SRC/convex/authorization.ts" > "$MUTANT/convex/authorization.ts"
diff "$SRC/convex/authorization.ts" "$MUTANT/convex/authorization.ts"

cd "$MUTANT" && bunx vitest run convex/companyJourney.test.ts 2>&1 | rg --no-config 'AssertionError|Tests |FAIL'
