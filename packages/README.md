# Packages

Packages follow the **deep module** pattern: substantial behavior behind a minimal public surface.

## Package Layout

```
packages/<name>/
  index.ts        ← public entry point (root file)
  client.ts       ← another public entry point (packages may expose several)
  lib/            ← private implementation (hidden from outside)
  tests/          ← co-located tests and test fixtures
```

Copy-me template: see `packages/example/`.

## Entry Points, Not Barrels

A package's public surface is **every file at the package root**, not a single barrel `index.ts`. Avoid barrel files that re-export an entire subtree. Instead, expose several focused entry points (e.g. `index.ts`, `client.ts`, `server.ts`) and keep implementation hidden inside subfolders like `lib/`.

## The Four Boundary Rules

1. **Entry-point boundary**: Code outside a package (app code or another package) may import only that package's entry points (its root files), never anything inside its subfolders.
2. **Intra-package freedom**: A package's own internal implementation files can import each other freely within the package.
3. **Tests through entry points**: Tests under `<pkg>/tests/` must exercise the package through its public entry points and local test fixtures, never by reaching directly into private subfolder internals.
4. **No circular dependencies**: Dependency cycles across modules and files are strictly forbidden.

## Verification

Run boundary checks:

```bash
bun run lint:boundaries
# or test a specific package:
bun run depcruise packages/<name>
```
