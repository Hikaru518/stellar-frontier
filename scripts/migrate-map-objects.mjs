#!/usr/bin/env node
// One-shot migration script for the map-object-action-refactor (Task 2).
//
// Reads:
//   content/maps/default-map.json
//   content/call-actions/basic-actions.json
//   content/call-actions/object-actions.json
//
// Writes:
//   content/maps/default-map.json (rewritten: tile.objects -> tile.objectIds)
//   content/map-objects/{mainline,resources,hazards,legacy}.json
//   content/universal-actions/universal-actions.json
//
// The script is idempotent: running it again on already-migrated input
// produces the same output and does not duplicate entries.
//
// See docs/plans/2026-04-29-01-40/technical-design.md §7 for the spec.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

const MAP_PATH = join(repoRoot, "content", "maps", "default-map.json");
const BASIC_ACTIONS_PATH = join(repoRoot, "content", "call-actions", "basic-actions.json");
const OBJECT_ACTIONS_PATH = join(repoRoot, "content", "call-actions", "object-actions.json");
const MAP_OBJECTS_DIR = join(repoRoot, "content", "map-objects");
const UNIVERSAL_ACTIONS_DIR = join(repoRoot, "content", "universal-actions");
const UNIVERSAL_ACTIONS_PATH = join(UNIVERSAL_ACTIONS_DIR, "universal-actions.json");

const MAP_OBJECTS_SCHEMA_REF = "../schemas/map-objects.schema.json";
const UNIVERSAL_ACTIONS_SCHEMA_REF = "../schemas/universal-actions.schema.json";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(path, serialized, "utf8");
}

function ensureDir(path) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

// Bucket assignment: classify objects into one of the four content files.
// mainline objects are tagged with "mainline"; resources are resourceNode kind
// (without mainline tag); hazards are hazard kind (without mainline tag); the
// rest fall into legacy (landmarks, signals, structures, ruins, facilities
// without mainline tag).
function bucketFor(definition) {
  const tags = definition.tags ?? [];
  if (tags.includes("mainline")) {
    return "mainline";
  }
  if (definition.kind === "resourceNode") {
    return "resources";
  }
  if (definition.kind === "hazard") {
    return "hazards";
  }
  return "legacy";
}

// Build a lookup of action verb -> definition from object-actions.json.
function buildObjectActionTable(objectActionsContent) {
  const table = new Map();
  for (const entry of objectActionsContent.call_actions ?? []) {
    table.set(entry.id, entry);
  }
  return table;
}

// Convert tile.objects[].candidateActions to ActionDef[] (per tech-design §7.2).
function expandActions(legacyObject, objectActionTable) {
  const verbs = legacyObject.candidateActions ?? [];
  const actions = [];
  for (const verb of verbs) {
    const oldDef = objectActionTable.get(verb);
    if (!oldDef) {
      throw new Error(
        `Missing object-actions.json entry for verb "${verb}" referenced by ${legacyObject.id}`,
      );
    }
    // Per tech-design §7.2: if the legacy def's applicableObjectKinds excludes
    // this object's kind, skip the fan-out (this preserves the prior runtime
    // filter behaviour).
    if (
      Array.isArray(oldDef.applicableObjectKinds) &&
      !oldDef.applicableObjectKinds.includes(legacyObject.kind)
    ) {
      continue;
    }
    actions.push({
      id: `${legacyObject.id}:${verb}`,
      category: "object",
      label: oldDef.label,
      tone: oldDef.tone,
      conditions: [],
      event_id: `legacy.${verb}`,
    });
  }
  return actions;
}

function transformObject(legacyObject, objectActionTable) {
  const definition = {
    id: legacyObject.id,
    kind: legacyObject.kind,
    name: legacyObject.name,
    visibility: legacyObject.visibility,
    status_options: ["pristine"],
    initial_status: "pristine",
    actions: expandActions(legacyObject, objectActionTable),
  };
  if (legacyObject.description !== undefined) {
    definition.description = legacyObject.description;
  }
  if (Array.isArray(legacyObject.tags) && legacyObject.tags.length > 0) {
    definition.tags = [...legacyObject.tags];
  }
  if (legacyObject.legacyResource !== undefined) {
    definition.legacyResource = legacyObject.legacyResource;
  }
  if (legacyObject.legacyBuilding !== undefined) {
    definition.legacyBuilding = legacyObject.legacyBuilding;
  }
  if (legacyObject.legacyInstrument !== undefined) {
    definition.legacyInstrument = legacyObject.legacyInstrument;
  }
  return definition;
}

// Build universal_actions[] from basic-actions.json.
// availableWhenBusy:false -> add a crew_action_status condition that excludes
// the active state. availableWhenBusy:true -> conditions: [].
function buildUniversalActions(basicActionsContent) {
  const out = [];
  for (const entry of basicActionsContent.call_actions ?? []) {
    const conditions = [];
    if (entry.availableWhenBusy === false) {
      conditions.push({
        type: "crew_action_status",
        target: { type: "primary_crew" },
        op: "not_equals",
        value: "active",
      });
    }
    out.push({
      id: `universal:${entry.id}`,
      category: "universal",
      label: entry.label,
      tone: entry.tone,
      conditions,
      event_id: `legacy.${entry.id}`,
    });
  }
  // deterministic sort by id
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

// Validate per tasks.md AC: status_options non-empty, initial_status in
// status_options, and every tile.objectIds[] entry exists in the registry.
function assertInvariants({ definitionsByBucket, tilesObjectIds }) {
  const allDefs = new Map();
  for (const bucket of Object.keys(definitionsByBucket)) {
    for (const def of definitionsByBucket[bucket]) {
      if (allDefs.has(def.id)) {
        throw new Error(`Duplicate object id: ${def.id}`);
      }
      allDefs.set(def.id, def);
      if (!Array.isArray(def.status_options) || def.status_options.length === 0) {
        throw new Error(`Object ${def.id} has empty status_options`);
      }
      if (!def.status_options.includes(def.initial_status)) {
        throw new Error(
          `Object ${def.id} initial_status "${def.initial_status}" is not in status_options`,
        );
      }
    }
  }
  for (const [tileId, ids] of Object.entries(tilesObjectIds)) {
    for (const id of ids) {
      if (!allDefs.has(id)) {
        throw new Error(`Tile ${tileId} references missing object id "${id}"`);
      }
    }
  }
}

function sortDefinitionsById(definitions) {
  return [...definitions].sort((a, b) => a.id.localeCompare(b.id));
}

function migrate() {
  const map = readJson(MAP_PATH);
  const basicActionsContent = readJson(BASIC_ACTIONS_PATH);
  const objectActionsContent = readJson(OBJECT_ACTIONS_PATH);
  const objectActionTable = buildObjectActionTable(objectActionsContent);

  const buckets = {
    mainline: new Map(),
    resources: new Map(),
    hazards: new Map(),
    legacy: new Map(),
  };
  const tilesObjectIds = {};

  for (const tile of map.tiles) {
    // Idempotency: if the tile already has objectIds and no inline objects,
    // we still re-collect ids in deterministic order. If both exist (mid-
    // migration state) prefer the inline objects; otherwise the existing
    // objectIds are kept and the bucket data is sourced from disk later.
    if (Array.isArray(tile.objects) && tile.objects.length > 0) {
      const ids = [];
      for (const legacyObject of tile.objects) {
        const definition = transformObject(legacyObject, objectActionTable);
        ids.push(definition.id);
        const bucket = buckets[bucketFor(definition)];
        bucket.set(definition.id, definition);
      }
      tile.objectIds = ids;
    } else if (!Array.isArray(tile.objectIds)) {
      tile.objectIds = [];
    }
    // Always remove the legacy `objects` field — even if empty — so the
    // rewritten map.json is fully migrated.
    if ("objects" in tile) {
      delete tile.objects;
    }
    tilesObjectIds[tile.id] = tile.objectIds;
  }

  ensureDir(MAP_OBJECTS_DIR);
  ensureDir(UNIVERSAL_ACTIONS_DIR);

  // If buckets came up empty (all tiles already had objectIds and no inline
  // objects, i.e. the script is being re-run on already-migrated input),
  // re-read the existing on-disk bucket files so the invariant checks still
  // run against a meaningful registry.
  const definitionsByBucket = {};
  for (const bucketName of Object.keys(buckets)) {
    if (buckets[bucketName].size > 0) {
      definitionsByBucket[bucketName] = sortDefinitionsById([...buckets[bucketName].values()]);
    } else {
      const path = join(MAP_OBJECTS_DIR, `${bucketName}.json`);
      if (existsSync(path)) {
        const existing = readJson(path);
        definitionsByBucket[bucketName] = sortDefinitionsById(existing.map_objects ?? []);
      } else {
        definitionsByBucket[bucketName] = [];
      }
    }
  }

  assertInvariants({ definitionsByBucket, tilesObjectIds });

  // Write content/map-objects/<bucket>.json
  for (const bucketName of Object.keys(definitionsByBucket)) {
    const path = join(MAP_OBJECTS_DIR, `${bucketName}.json`);
    writeJson(path, {
      $schema: MAP_OBJECTS_SCHEMA_REF,
      map_objects: definitionsByBucket[bucketName],
    });
  }

  // Write content/universal-actions/universal-actions.json
  const universalActions = buildUniversalActions(basicActionsContent);
  if (universalActions.length !== 4) {
    throw new Error(
      `Expected 4 universal actions, got ${universalActions.length}. Check basic-actions.json.`,
    );
  }
  writeJson(UNIVERSAL_ACTIONS_PATH, {
    $schema: UNIVERSAL_ACTIONS_SCHEMA_REF,
    universal_actions: universalActions,
  });

  // Rewrite default-map.json with tile.objectIds (no inline objects)
  writeJson(MAP_PATH, map);

  const totals = Object.fromEntries(
    Object.entries(definitionsByBucket).map(([k, v]) => [k, v.length]),
  );
  console.log("[migrate-map-objects] done.");
  console.log("  buckets:", totals);
  console.log("  universal_actions:", universalActions.length);
}

migrate();
