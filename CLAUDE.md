# CLAUDE.md

Twenty is an open-source CRM — a Bun workspace orchestrated with Vite+. Main packages: `twenty-front` (React 18, Jotai, Linaria, Vite), `twenty-server` (NestJS, TypeORM, PostgreSQL, Redis, GraphQL), `twenty-shared` (isomorphic types/utils), `twenty-ui`, `twenty-sdk` (application SDK + CLI), `twenty-e2e-testing` (Playwright).

Match the surrounding code — the adjacent files in the directory you are editing beat any written rule, including for file naming, which varies by area.

## House rules

Where this repo differs from your defaults:

- Short-form `//` comments, never JSDoc blocks; comment only WHY (a constraint the code cannot express, still true for a reader who never saw your change), never WHAT.
- Types over interfaces (except when extending third-party interfaces); string literals over enums (except GraphQL enums); no `any`; descriptive generics (`TData`, not `T`).
- Named exports only. Functional components only.
- Prefer event handlers over `useEffect` for state updates.
- No abbreviations in names (`fieldMetadata`, not `fm`); constants in SCREAMING_SNAKE_CASE; component props types suffixed `Props`.
- Use existing guards and helpers before writing your own: `isDefined`, `isNonEmptyArray`, `isPlainObject`, … from `twenty-shared/utils`; `isNonEmptyString`, `isString`, `isNull`, `isObject`, … from `@sniptt/guards`. Reimplementing an existing util is the most common AI-authored defect here.
- Lingui for user-facing strings; Linaria (zero-runtime, styled-components pattern) for twenty-front styling.
- For Twenty product concepts, consult `packages/twenty-ui/src/icon/icon-dictionary.md` and use the canonical icon.
- Import icons from `twenty-ui/icon`, never directly from `@tabler/icons-react`; action and status concepts should use their action or status icons.
- Test behavior, not implementation: query by user-visible text/roles, `@testing-library/user-event` for interactions.
- Packages are deep modules — see `packages/README.md` before adding or importing one.

## Commands

```bash
bash packages/twenty-utils/setup-dev-env.sh   # Postgres/Redis + DB init; only for tasks needing a running app
bun start                                    # front + server + worker

bunx jest path/to/file.spec.ts --config=packages/<pkg>/jest.config.mjs   # single test file (preferred)
bunx vitest run --root packages/twenty-ui --project unit <file>          # twenty-ui runs on vitest, not jest
bunx vite-plus run twenty-server#test                 # package unit tests
bunx vite-plus run twenty-server#test:integration:with-db-reset
bunx vite-plus run twenty-front#storybook:build && bunx vite-plus run twenty-front#storybook:test

bunx vite-plus run twenty-server#lint:diff-with-main   # diff-based lint; run with typecheck after changes
bunx vite-plus run twenty-server#lint:fix              # apply lint fixes
bunx vite-plus run twenty-front#fmt                    # format one package
bunx vite-plus run twenty-shared#build                 # required before building/testing dependents
bunx vite-plus run twenty-server#database:reset
bunx vite-plus run twenty-front#graphql:generate      # after GraphQL schema changes
bunx vite-plus run twenty-front#graphql:generate:metadata  # for metadata schema changes
```

## Gotchas

- **`twenty-shared/dist` is per-branch state nothing tracks.** After switching branches or editing `twenty-shared`, run `bunx vite-plus run twenty-shared#build --no-cache` before trusting any typecheck or test failure in a dependent package.
- **Task caching can serve a stale pass.** To verify a fix, run `bunx tsgo -p tsconfig.json --noEmit` in the package directly.
- **Do not commit translation catalogs unless translations are the task.** `lingui extract`/`compile` regenerate `packages/twenty-server/src/engine/core-modules/i18n/locales/*.po` and `locales/generated/*` with thousands of lines of churn as a side effect of touching any `msg` string. The i18n pipeline maintains them; leave them out of your commit.
- **Commit messages must not carry AI attribution.** CI rejects commits containing `@anthropic.com` co-author trailers or "Generated with Claude Code" lines.
- **Upgrade commands** (`packages/twenty-server/src/database/commands/upgrade-version-command/`): add or edit files only under the current `TWENTY_CURRENT_VERSION` directory, with a real epoch-ms timestamp strictly greater than every existing one in that directory — CI enforces both, and the upgrade cursor silently skips a command that sorts before an already-applied one. Include `up` and `down`; never rewrite committed command logic. Keep command-only helpers and constants in the version folder, never in runtime modules, and never make runtime code branch on migration state. See `packages/twenty-server/docs/UPGRADE_COMMANDS.md`.
- **Entity file changes need a generated instance command**: `bunx vite-plus run twenty-server#database:migrate:generate --name <name> --type <fast|slow>` (slow = adds a data-backfill step).
- A read-only Postgres MCP server is configured in `.mcp.json` for inspecting workspace data, metadata, and migration results. Writes go through the CLI commands above.
- E2E login: click "Continue with Email" and use the prefilled credentials.

## Agent skills

### Fenforce development

For Fenforce bugs, features, and stack migration, follow `docs/agents/development-workflow.md`.
Project subagent roles are configured in `.codex/config.toml`.
Keep planned TanStack, Convex, and Effect work distinct from verified production behavior.

### Issue tracker

GitHub Issues via `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical 5-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context (`CONTEXT.md` + `docs/adr/` at repo root). See `docs/agents/domain.md`.
