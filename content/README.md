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
- `maps/*.json`: authored map files. `default-map.json` is the current runtime default and may include gameplay tiles plus `visual.layers`.
- `maps/tilesets/registry.json`: tileset metadata for Map Editor and PC Phaser runtime, including `assets/` source paths, public runtime paths, tile geometry, categories, and license info.
- `universal-actions/universal-actions.json`: universal call actions such as move, standby, stop, and survey.
- `schemas/*.schema.json`: JSON Schemas for content files.
- `schemas/events/*.schema.json`: JSON Schemas for structured event assets.

## Rules

- Content files should be reviewed as data, not mixed into TypeScript code.
- Stable IDs should use lowercase snake case or existing schema-specific patterns. Map IDs and tileset IDs allow lowercase letters, numbers, underscores, and hyphens.
- Data files may contain display text, but gameplay references should use IDs.
- Map tile IDs use `row-col`, for example `3-4`.
- Map tile `objectIds` must reference objects defined in `content/map-objects/*.json`.
- Map visual cells use `{ tilesetId, tileIndex }`; `tilesetId` must exist in `maps/tilesets/registry.json`, and `tileIndex` must be inside that tileset's `tileCount`.
- Tileset `assetPath` points at repository `assets/` files for Map Editor preview; `publicPath` points at the public runtime asset used by PC Phaser.
- Keep schema changes backward-incompatible only when existing content is migrated in the same change.

## Validation

Run this after changing content:

```bash
npm run validate:content
```
