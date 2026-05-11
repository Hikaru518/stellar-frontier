# Content Data

This folder stores authored game content outside of application code. Runtime pages, local editors, tests, and validation scripts should read gameplay text and configuration from here instead of hard-coding content arrays in TypeScript.

## Structure

- `crew/crew.json`: crew definitions, profile text, attributes, tags, specialties, and diary nodes.
- `events/definitions/*.json`: structured event definitions.
- `events/call_templates/*.json`: structured event call templates.
- `events/presets/*.json`: reusable event condition / effect presets.
- `events/handler_registry.json`: structured event handler allowlist.
- `events/manifest.json`: structured event domain manifest used by the editor generator.
- `items/items.json`: item definitions.
- `map-objects/*.json`: reusable map object definitions such as resources, hazards, structures, facilities, ruins, and landmarks.
- `maps/*.json`: authored map files. `default-map.json` is the current runtime default and includes explicit gameplay tiles plus the radar presentation layer.
- `universal-actions/universal-actions.json`: universal call actions such as move, standby, stop, and survey.
- `schemas/*.schema.json`: JSON Schemas for content files.
- `schemas/events/*.schema.json`: JSON Schemas for structured event assets.

## Rules

- Content files should be reviewed as data, not mixed into TypeScript code.
- Stable IDs should use lowercase snake case or existing schema-specific patterns. Map IDs allow lowercase letters, numbers, underscores, and hyphens.
- Data files may contain display text, but gameplay references should use IDs.
- Map tile IDs use `row-col`, for example `3-4`.
- Map tile `objectIds` must reference objects defined in `content/map-objects/*.json`.
- Map radar rows use `glyphRows` and `toneRows`; every row must match the configured radar world width, and every tone must exist in `radar.palette`.
- Keep schema changes backward-incompatible only when existing content is migrated in the same change.

## Validation

Run this after changing content:

```bash
npm run validate:content
```
