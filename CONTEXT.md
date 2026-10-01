# Fenforce

Fenforce is a CRM derived from Twenty, with feature preservation guiding its stack migration.

## Language

**Twenty baseline**:
The pinned original implementation used to compare CRM behavior during migration.
_Avoid_: Assuming the currently deployed preview demonstrates every original feature.

**Feature parity**:
Evidence that a migrated capability preserves its required behavior, permissions, and failure handling.
Visual similarity alone does not establish feature parity.

**Interface language**:
The language of Fenforce's controls, messages, and accessible labels, currently managed through Lingui.
_Avoid_: Treating language as the user's time zone or date format.

**Format preferences**:
The user's date, time, number, calendar, and time-zone preferences within a workspace.
These remain distinct from interface language.

**Modern CRM experience**:
A planned improvement to navigation, record readability, editing, and keyboard use while preserving CRM capabilities.
_Avoid_: Treating a styling-library replacement as proof of improved usability.

## Related decisions

- [Retain Lingui through the React and TanStack migration](docs/adr/0001-retain-lingui.md).
- [Proposed StyleX and Base UI direction](docs/adr/0002-stylex-base-ui.md).

The [migration maps](docs/migration/README.md) track preservation contracts and verification requirements.
