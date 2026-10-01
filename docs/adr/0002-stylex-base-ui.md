# Propose StyleX with Base UI for the modern CRM experience

Status: proposed migration direction; StyleX integration and UI redesign are unimplemented.

Use StyleX as the candidate styling system and extend existing Base UI primitives for migrated CRM surfaces.
The intended benefit is consistent themes and interaction behavior across a refreshed interface.
Keep Lingui under [ADR 0001](0001-retain-lingui.md).

## Why the build log does not require migration

The [Linaria profiler](../../packages/twenty-shared/src/vite/createWywProfilingPlugin.ts) skips modules without matching Linaria imports.
Zero transformed files and five skipped files describe that plugin invocation only.
The reported transform time excludes warmup and is not total build time.
Those counters establish neither broken styling nor whole-application migration readiness.

## Boundaries and trade-offs

StyleX handles styles and theme tokens; Base UI supplies unstyled interaction primitives.
Neither provides a complete CRM interface or replaces record grids, charts, rich-text editors, or permission logic.
Base UI already participates in the [locale direction provider](../../packages/twenty-front/src/modules/app/components/LocaleDirectionProvider.tsx).
Reuse existing primitives and contracts before adding another component abstraction.

Retaining Linaria throughout has the lowest immediate migration cost.
StyleX introduces compiler integration, styling conversion, and temporary coexistence costs.
A wholesale rewrite would combine visual, behavioral, and build risks before proving one migrated surface.
Prefer an incremental proof with existing [feature and acceptance maps](../migration/README.md).

## Required proof before adoption

1. Build one representative record surface using StyleX and existing Base UI primitives.
2. Verify the official StyleX Vite integration against our pinned Vite+, React, Lingui, and shared-package build.
3. Check development refresh, extracted production CSS, lazy routes, portals, and Cloudflare delivery.
4. Compare light and dark themes, density, responsive layout, keyboard actions, focus, and accessible names.
5. Verify Chinese text, pseudo-localization, RTL, and preserved format preferences under ADR 0001.
6. Measure matched clean and warm builds, CSS size, and interaction behavior before claiming improvement.
7. Resolve StyleX-specific lint coverage while preserving existing Oxlint, formatting, complexity, and type-check requirements.
8. Expand component by component only after the representative surface passes review.

Keep Linaria for surfaces that still use it.
Remove its plugins and dependencies only after checking imports, shared components, themes, Storybook, tests, and extension rendering.
Do not remove active styling dependencies merely to silence profiling output.

The design review should prioritize readable record tables, clear hierarchy, efficient editing, and predictable navigation.
Any intentional departure from Twenty's appearance needs explicit comparison against preserved behavior and accessibility.

## References

- [Official StyleX Vite and React integration](https://stylexjs.com/docs/learn/installation/vite/vite-react).
- [StyleX installation and style validation](https://stylexjs.com/docs/learn/installation/).
- [Base UI scope and styling independence](https://base-ui.com/react/overview/about).
