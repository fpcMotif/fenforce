# Fenforce

Fenforce is a CRM derived from Twenty. The first Salesforce replacement pilot (M1) is defined by actual company workflows; Twenty supplies reusable implementation and behavior references. Full-platform Twenty parity is a separate scope.

The [M1 contract](docs/migration/m1-contract.md) records current decisions and unresolved evidence. Company discovery remains blocked; a [synthetic sales contract](docs/migration/m1-mock-contract.md) supplies user-authorized assumptions for local implementation, not approved pilot scope.

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

**Account**:
An organization the company sells to, owned by one seller and visible to managers.
The interface labels it Company to match Twenty.
_Avoid_: Company (outside interface copy), customer, organization

**Contact**:
A person at exactly one Account, whose access follows that Account.
The interface labels it Person to match Twenty.
_Avoid_: Person (outside interface copy), lead, people

**Modern CRM experience**:
A planned improvement to navigation, record readability, editing, and keyboard use while preserving CRM capabilities.
_Avoid_: Treating a styling-library replacement as proof of improved usability.

## Related decisions

- [Retain Lingui through the React and TanStack migration](docs/adr/0001-retain-lingui.md).
- [Retain existing styling and Base UI for M1](docs/adr/0002-stylex-base-ui.md).

The [migration maps](docs/migration/README.md) track preservation contracts and verification requirements.
