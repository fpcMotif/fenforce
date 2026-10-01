# Retain Lingui through the React and TanStack migration

Status: accepted decision; TanStack integration remains unimplemented.

Keep Lingui as Fenforce's translation system during the frontend, styling, and backend migrations.
Existing catalogs, message identifiers, plurals, and React integration represent behavior we must preserve.
Changing navigation libraries does not justify replacing translations simultaneously.

## Current evidence

[Lingui configuration](../../packages/twenty-front/lingui.config.ts) defines catalogs, source-language fallback, and pseudo-localization.
[Declared locales](../../packages/twenty-shared/src/translations/constants/AppLocales.ts) include Chinese variants, Arabic, and Hebrew.
[Activation gating](../../packages/twenty-front/src/modules/app/components/I18nActivationGate.tsx) waits for an active Lingui locale.
[Direction propagation](../../packages/twenty-front/src/modules/app/components/LocaleDirectionProvider.tsx) connects that locale to Base UI primitives.
These source observations establish existing integration, not verified parity across every locale.

## React and TanStack requirements

Keep Lingui's React provider and supported macro compilation in the Vite+ build.
Activate the selected catalog before rendering translated route content, including loading, error, and not-found states.
Preserve current language selection, persistence, and fallback behavior before changing locale-routing policy.
TanStack Router may coordinate locale loading; it does not replace the message catalog.
Do not add language URL prefixes merely because a router example uses them.

Translate visible text, validation messages, empty states, tooltips, and accessible names.
Preserve interpolation, plurals, rich text, locale switching, and fallback behavior.
Keep format preferences and time zones independent from interface language.
Apply RTL direction to portals, menus, dialogs, navigation, and record editors.
If server rendering is introduced, isolate locale state per request and verify hydration consistency.

Require extraction and compilation checks without unrelated catalog churn.
Verify English, both Chinese variants, pseudo-localization, and RTL representative flows before accepting a migrated surface.
All declared locales remain within [AC-10](../migration/criteria-map.md); representative checks do not replace that release requirement.

## Future reconsideration

React-i18next or Paraglide may be evaluated if Lingui demonstrably blocks required React or TanStack behavior.
Neither alternative is selected by this decision.
Require catalog-conversion evidence, plural and fallback parity, accessibility checks, and a rollback path before replacement.
Framework popularity alone is insufficient justification for translation churn.

## References

- [Lingui installation and React integration](https://lingui.dev/installation).
- [TanStack Router internationalization](https://tanstack.com/router/latest/docs/guide/internationalization-i18n).
