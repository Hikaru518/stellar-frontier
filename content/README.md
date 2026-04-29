# Content Data

This folder stores authored game content outside of application code.

## Structure

- `events/definitions/*.json`: structured event definitions.
- `events/call_templates/*.json`: structured event call templates.
- `events/handler_registry.json`: structured event handler allowlist.
- `crew/crew.json`: crew definitions.
- `items/items.json`: item definitions.
- `schemas/events/*.schema.json`: JSON Schemas for structured event assets.
- `schemas/crew.schema.json`: JSON Schema for `crew/crew.json`.
- `schemas/items.schema.json`: JSON Schema for `items/items.json`.

## Rules

- Content files should be reviewed as data, not mixed into TypeScript code.
- Stable IDs should use lowercase snake case, for example `survey_forest_scattered_wood`.
- Data files may contain display text, but gameplay references should use IDs.
- Keep schema changes backward-incompatible only when existing content is migrated in the same change.
