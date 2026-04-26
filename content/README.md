# Content Data

This folder stores authored game content outside of application code.

## Structure

- `events/events.json`: event definitions.
- `crew/crew.json`: crew definitions.
- `items/items.json`: item definitions.
- `schemas/events.schema.json`: JSON Schema for `events/events.json`.
- `schemas/crew.schema.json`: JSON Schema for `crew/crew.json`.
- `schemas/items.schema.json`: JSON Schema for `items/items.json`.

## Rules

- Content files should be reviewed as data, not mixed into TypeScript code.
- Stable IDs should use lowercase snake case, for example `survey_forest_scattered_wood`.
- Data files may contain display text, but gameplay references should use IDs.
- Keep schema changes backward-incompatible only when existing content is migrated in the same change.
