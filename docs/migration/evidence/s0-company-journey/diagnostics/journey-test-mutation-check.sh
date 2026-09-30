#!/bin/bash
set -u
REPO=$(CDPATH= cd -- "$(dirname "$0")/../../../../.." && pwd)
SRC=$REPO/deployments/convex
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

prepare_copy() {
  local target=$1
  mkdir -p "$target"
  cp "$SRC/package.json" "$SRC/tsconfig.json" "$target/"
  ln -s "$SRC/node_modules" "$target/node_modules"
  cp -R "$SRC/convex" "$target/convex"
}

mutate_membership_check_removed() {
  awk '/throw new ConvexError\(.FORBIDDEN.\);/ && !done { print "    return { role: \"member\", _id: \"mutant\" } as never;"; done = 1; next } { print }' \
    "$SRC/convex/authorization.ts" > "$1/convex/authorization.ts"
}

mutate_list_ignores_workspace() {
  awk '/\.withIndex\(.by_workspaceId_and_deletedAt_and_name./ && !done { skip = 3; done = 1 } skip > 0 { skip--; next } { print }' \
    "$SRC/convex/workspaceCompanies.ts" > "$1/convex/workspaceCompanies.ts"
}

run_mutant() {
  local name=$1
  local target=$WORK/$name
  prepare_copy "$target"
  "mutate_$name" "$target"
  diff "$SRC/convex/authorization.ts" "$target/convex/authorization.ts" > /dev/null || echo "mutated: authorization.ts"
  diff "$SRC/convex/workspaceCompanies.ts" "$target/convex/workspaceCompanies.ts" > /dev/null || echo "mutated: workspaceCompanies.ts"
  (cd "$target" && bunx vitest run convex/companyJourney.test.ts > "$WORK/$name.log" 2>&1)
  local status=$?
  rg --no-config 'AssertionError' "$WORK/$name.log" | head -n 1
  if [ "$status" -ne 0 ]; then
    echo "mutant $name: vitest exit $status, caught"
    return 0
  fi
  echo "mutant $name: vitest exit $status, SURVIVED"
  return 1
}

survivors=0
run_mutant membership_check_removed || survivors=$((survivors + 1))
run_mutant list_ignores_workspace || survivors=$((survivors + 1))
echo "surviving mutants: $survivors"
exit "$survivors"
