# Workflow experiment

Read `../../docs/agents/development-workflow.md` for role ownership and migration contracts.
This package is an isolated Bun experiment. Follow the root manifest for the larger workspace's package manager.

Run `bun install --frozen-lockfile` after checkout.
The prepare script patches the pinned TypeScript compiler with `@effect/tsgo` and generates Varlock types.
Use `bun run check` before handing off changes.
That command also proves Effect diagnostics reject a floating Effect and accept the positive control.
Use `bun run effect:check` for Effect-specific diagnostics while editing.

Open `fenforce.code-workspace` for the experiment's native TypeScript editor settings.
Use the recommended TypeScript 7 extension and select the workspace TypeScript version.
The workspace file does not establish that an editor extension is installed or running.
Do not add a second TypeScript language server or change Twenty's root editor configuration.

Keep Effect v4 and its compiler tooling pinned to a supported version pair.
After upgrading either, rerun the compiler canary and inspect the emitted diagnostic.
Do not suppress Effect failures or weaken complexity limits to pass checks.
Worker workflow retries and waits remain owned by Cloudflare Workflows.
Effect composes operations inside a step; it does not supply durable persistence.

`bun run verify:remote` exercises the deployed synthetic workflow and records provider responses in `test-results/`.
It does not test undeployed source changes. Deployment needs applicable user authorization.
