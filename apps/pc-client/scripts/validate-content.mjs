import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { formatEventManifestIssues, validateEventManifest } from "../../editor/scripts/generate-event-content-manifest.mjs";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const root = process.env.VALIDATE_CONTENT_ROOT
  ? path.resolve(process.env.VALIDATE_CONTENT_ROOT)
  : sourceRoot;
const { validateEventContentLibrary } = await loadEventValidation();

const contentFilePairs = [
  ["content/crew/crew.json", "content/schemas/crew.schema.json"],
  ["content/items/items.json", "content/schemas/items.schema.json"],
  ["content/maps/default-map.json", "content/schemas/maps.schema.json"],
];

const contentAssetGroups = [
  {
    directoryPath: "content/map-objects",
    schemaPath: "content/schemas/map-objects.schema.json",
  },
  {
    directoryPath: "content/universal-actions",
    schemaPath: "content/schemas/universal-actions.schema.json",
  },
];

const eventSchemaPaths = [
  "content/schemas/events/condition.schema.json",
  "content/schemas/events/effect.schema.json",
  "content/schemas/events/event-graph.schema.json",
  "content/schemas/events/event-definition.schema.json",
  "content/schemas/events/call-template.schema.json",
  "content/schemas/events/preset.schema.json",
  "content/schemas/events/handler-registry.schema.json",
];

const eventAssetGroups = [
  {
    directoryPath: "content/events/definitions",
    schemaPath: "content/schemas/events/event-definition.schema.json",
  },
  {
    directoryPath: "content/events/call_templates",
    schemaPath: "content/schemas/events/call-template.schema.json",
  },
  {
    directoryPath: "content/events/presets",
    schemaPath: "content/schemas/events/preset.schema.json",
  },
];

const eventAssetFiles = [
  ["content/events/handler_registry.json", "content/schemas/events/handler-registry.schema.json"],
];

const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true });
const schemaPaths = new Set([
  ...contentFilePairs.map(([, schemaPath]) => schemaPath),
  ...contentAssetGroups.map(({ schemaPath }) => schemaPath),
  ...eventSchemaPaths,
]);
const schemasByPath = Object.fromEntries([...schemaPaths].map((schemaPath) => [schemaPath, readJson(schemaPath)]));
for (const schema of Object.values(schemasByPath)) {
  ajv.addSchema(schema);
}

const loaded = Object.fromEntries(contentFilePairs.map(([dataPath]) => [dataPath, readJson(dataPath)]));

let failed = false;
let eventSchemaFailed = false;

const eventManifestResult = validateEventManifest(root);
if (eventManifestResult.issues.length > 0) {
  console.error(formatEventManifestIssues(eventManifestResult.issues));
  failed = true;
}

for (const [dataPath, schemaPath] of contentFilePairs) {
  failed = validateJsonFile(dataPath, schemaPath, loaded[dataPath]) || failed;
}

for (const { directoryPath, schemaPath } of eventAssetGroups) {
  for (const dataPath of listJsonFiles(directoryPath)) {
    const fileFailed = validateJsonFile(dataPath, schemaPath);
    eventSchemaFailed = fileFailed || eventSchemaFailed;
    failed = fileFailed || failed;
  }
}

for (const { directoryPath, schemaPath } of contentAssetGroups) {
  for (const dataPath of listJsonFiles(directoryPath)) {
    failed = validateJsonFile(dataPath, schemaPath) || failed;
  }
}

for (const [dataPath, schemaPath] of eventAssetFiles) {
  const fileFailed = validateJsonFile(dataPath, schemaPath);
  eventSchemaFailed = fileFailed || eventSchemaFailed;
  failed = fileFailed || failed;
}

if (!eventSchemaFailed) {
  failed = validateStructuredEventCrewReferences() || failed;
  failed = validateEventProgramReferences() || failed;
  failed = validateMapObjectActionEventReferences() || failed;
}

failed = validateReferences(loaded) || failed;

if (failed) {
  process.exitCode = 1;
} else {
  console.log("Content validation passed.");
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function listJsonFiles(relativeDirectory) {
  const directory = path.join(root, relativeDirectory);
  if (!fs.existsSync(directory)) {
    return [];
  }

  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.posix.join(relativeDirectory, entry.name))
    .sort();
}

function validateJsonFile(dataPath, schemaPath, data = readJson(dataPath)) {
  const schema = schemasByPath[schemaPath];
  const validate = ajv.getSchema(schema.$id);
  if (!validate) {
    throw new Error(`Missing schema: ${schemaPath}`);
  }

  const valid = validate(data);
  if (valid) {
    return false;
  }

  console.error(`Schema validation failed: ${dataPath}`);
  for (const error of validate.errors ?? []) {
    console.error(`  ${formatErrorPath(error)} ${error.message}`);
  }
  return true;
}

function validateEventProgramReferences() {
  const issues = validateEventContentLibrary(loadEventContentLibrary());
  if (issues.length === 0) {
    return false;
  }

  console.error("Event cross-reference validation failed:");
  for (const issue of issues) {
    console.error(
      `  [${issue.severity}] ${issue.asset_type}:${issue.asset_id} ${issue.path} ${issue.code}: ${issue.message}`,
    );
  }
  return true;
}

function loadEventContentLibrary() {
  return {
    event_definitions: loadArrayFromFiles("content/events/definitions", "event_definitions"),
    call_templates: loadArrayFromFiles("content/events/call_templates", "call_templates"),
    handlers: readJson("content/events/handler_registry.json").handlers,
    presets: loadArrayFromFiles("content/events/presets", "presets"),
  };
}

function collectEventDefinitionIds() {
  const ids = new Set();
  for (const dataPath of listJsonFiles("content/events/definitions")) {
    for (const definition of readJson(dataPath).event_definitions ?? []) {
      if (typeof definition.id === "string") {
        ids.add(definition.id);
      }
    }
  }
  return ids;
}

function loadArrayFromFiles(relativeDirectory, propertyName) {
  return listJsonFiles(relativeDirectory).flatMap((dataPath) => readJson(dataPath)[propertyName] ?? []);
}

function validateStructuredEventCrewReferences() {
  let hasError = false;
  const crewIds = new Set(loaded["content/crew/crew.json"].crew.map((member) => member.crewId));
  for (const { directoryPath } of eventAssetGroups) {
    for (const dataPath of listJsonFiles(directoryPath)) {
      hasError = validateCrewReferencesInValue(readJson(dataPath), dataPath, [], crewIds) || hasError;
    }
  }
  return hasError;
}

function validateCrewReferencesInValue(value, dataPath, segments, crewIds) {
  if (Array.isArray(value)) {
    return value.reduce(
      (hasError, item, index) => validateCrewReferencesInValue(item, dataPath, [...segments, index], crewIds) || hasError,
      false,
    );
  }

  if (!value || typeof value !== "object") {
    return false;
  }

  let hasError = false;
  for (const [key, child] of Object.entries(value)) {
    if (key === "crew_id" && typeof child === "string") {
      hasError = validateKnownCrewId(child, dataPath, [...segments, key], crewIds) || hasError;
      continue;
    }

    if (key === "crew_ids" && Array.isArray(child)) {
      hasError =
        child.reduce(
          (childHasError, crewId, index) =>
            (typeof crewId === "string" && validateKnownCrewId(crewId, dataPath, [...segments, key, index], crewIds)) ||
            childHasError,
          false,
        ) || hasError;
      continue;
    }

    if (key === "id" && typeof child === "string" && value.type === "crew_id") {
      hasError = validateKnownCrewId(child, dataPath, [...segments, key], crewIds) || hasError;
      continue;
    }

    hasError = validateCrewReferencesInValue(child, dataPath, [...segments, key], crewIds) || hasError;
  }
  return hasError;
}

function validateKnownCrewId(crewId, dataPath, segments, crewIds) {
  if (crewIds.has(crewId) || crewId.includes("{")) {
    return false;
  }
  return report(`Unknown crew id in structured event content: ${crewId} at ${dataPath}${formatJsonPath(segments)}`);
}

function validateMapObjectActionEventReferences() {
  let hasError = false;
  const eventDefinitionIds = collectEventDefinitionIds();
  for (const dataPath of listJsonFiles("content/map-objects")) {
    const data = readJson(dataPath);
    for (const [objectIndex, definition] of (data.map_objects ?? []).entries()) {
      for (const [actionIndex, action] of (definition.actions ?? []).entries()) {
        if (typeof action.event_id !== "string" || eventDefinitionIds.has(action.event_id)) {
          continue;
        }

        hasError =
          report(
            `Unknown event_id in map object action: ${action.event_id} at ${dataPath}${formatJsonPath([
              "map_objects",
              objectIndex,
              "actions",
              actionIndex,
              "event_id",
            ])} (map object ${definition.id})`,
          ) || hasError;
      }
    }
  }
  return hasError;
}

function formatJsonPath(segments) {
  if (segments.length === 0) {
    return "";
  }
  return `/${segments.map(escapeJsonPointer).join("/")}`;
}

async function loadEventValidation() {
  const validationPath = path.join(sourceRoot, "apps/pc-client/src/events/validation.ts");

  try {
    return await import(pathToFileURL(validationPath).href);
  } catch (error) {
    if (!isUnknownTypeScriptExtensionError(error)) {
      throw error;
    }

    const tsModule = await import("typescript");
    const ts = tsModule.default ?? tsModule;
    const source = fs.readFileSync(validationPath, "utf8");
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ES2020,
        target: ts.ScriptTarget.ES2020,
      },
    });
    return import(`data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`);
  }
}

function isUnknownTypeScriptExtensionError(error) {
  return error instanceof TypeError && String(error.message).includes("Unknown file extension");
}

function formatErrorPath(error) {
  if (error.keyword === "required" && error.params.missingProperty) {
    return joinJsonPointer(error.instancePath, error.params.missingProperty);
  }

  if (error.keyword === "additionalProperties" && error.params.additionalProperty) {
    return joinJsonPointer(error.instancePath, error.params.additionalProperty);
  }

  if (error.keyword === "unevaluatedProperties" && error.params.unevaluatedProperty) {
    return joinJsonPointer(error.instancePath, error.params.unevaluatedProperty);
  }

  return error.instancePath || "/";
}

function joinJsonPointer(instancePath, property) {
  return `${instancePath || ""}/${escapeJsonPointer(property)}`;
}

function escapeJsonPointer(value) {
  return String(value).replaceAll("~", "~0").replaceAll("/", "~1");
}

function validateReferences(data) {
  let hasError = false;
  const crew = data["content/crew/crew.json"].crew;
  const items = data["content/items/items.json"].items;
  const defaultMap = data["content/maps/default-map.json"];

  const itemIds = new Set();
  const crewIds = new Set();

  for (const item of items) {
    if (!addUnique(itemIds, item.itemId)) {
      hasError = report(`Duplicate itemId: ${item.itemId}`);
    }
  }

  for (const member of crew) {
    if (!addUnique(crewIds, member.crewId)) {
      hasError = report(`Duplicate crewId: ${member.crewId}`);
    }

    for (const entry of member.inventory) {
      if (!itemIds.has(entry.itemId)) {
        hasError = report(`Unknown itemId in crew ${member.crewId}: ${entry.itemId}`);
      }
    }
  }

  const { ids: knownObjectIds, hasError: catalogFailed } = collectMapObjectIds();
  hasError = catalogFailed || hasError;
  hasError = validateMap(defaultMap, knownObjectIds) || hasError;

  return hasError;
}

function collectMapObjectIds() {
  const ids = new Set();
  let hasError = false;
  for (const filePath of listJsonFiles("content/map-objects")) {
    const file = readJson(filePath);
    for (const definition of file.map_objects ?? []) {
      if (ids.has(definition.id)) {
        hasError = report(`Duplicate map object id: ${definition.id}`) || hasError;
      } else {
        ids.add(definition.id);
      }
    }
  }
  return { ids, hasError };
}

function validateMap(map, knownObjectIds) {
  let hasError = false;
  const { rows, cols } = map.size;
  const tileIds = new Set();
  const tileById = new Map();
  const referencedObjectIds = new Map();
  const initialDiscoveredTileIds = new Set(map.initialDiscoveredTileIds);

  if (rows !== 8 || cols !== 8) {
    hasError = report(`Default map must be 8 x 8, got ${rows} x ${cols}`) || hasError;
  }

  if (!initialDiscoveredTileIds.has(map.originTileId)) {
    hasError = report(`Map initialDiscoveredTileIds must include originTileId: ${map.originTileId}`) || hasError;
  }

  const forbiddenLegacyObjectIds = new Set([
    "acidic-marsh",
    "animal-tracks",
    "black-pine-stand",
    "fallen-timber",
    "fracture-vent",
    "needlewood-stand",
    "southwest-timber",
  ]);

  for (const [tileIndex, tile] of map.tiles.entries()) {
    const expectedTileId = `${tile.row}-${tile.col}`;

    if (!addUnique(tileIds, tile.id)) {
      hasError = report(`Duplicate map tile id: ${tile.id}`) || hasError;
    } else {
      tileById.set(tile.id, tile);
    }

    if (tile.id !== expectedTileId) {
      hasError = report(`Map tile id must match row/col: ${tile.id} should be ${expectedTileId}`) || hasError;
    }

    if (tile.row < 1 || tile.row > rows || tile.col < 1 || tile.col > cols) {
      hasError = report(`Map tile coordinate out of bounds: ${tile.id} (${tile.row},${tile.col}) for ${rows} x ${cols}`) || hasError;
    }

    for (const [objectIndex, objectId] of tile.objectIds.entries()) {
      const objectPath = `content/maps/default-map.json${formatJsonPath(["tiles", tileIndex, "objectIds", objectIndex])}`;
      if (!knownObjectIds.has(objectId)) {
        hasError = report(`Unknown objectId in default map: ${objectId} at ${objectPath} (tile ${tile.id})`) || hasError;
      }
      if (forbiddenLegacyObjectIds.has(objectId)) {
        hasError =
          report(`Forbidden legacy objectId in default map: ${objectId} at ${objectPath} (tile ${tile.id})`) || hasError;
      }
      const previousTileId = referencedObjectIds.get(objectId);
      if (previousTileId !== undefined) {
        hasError = report(
          `Map object ${objectId} referenced by multiple tiles: ${previousTileId}, ${tile.id}`,
        ) || hasError;
      } else {
        referencedObjectIds.set(objectId, tile.id);
      }
    }

    const specialStateIds = new Set();
    for (const specialState of tile.specialStates) {
      if (!addUnique(specialStateIds, specialState.id)) {
        hasError = report(`Duplicate special state id in tile ${tile.id}: ${specialState.id}`) || hasError;
      }
    }
  }

  if (!tileById.has(map.originTileId)) {
    hasError = report(`Map originTileId does not exist: ${map.originTileId}`) || hasError;
  }

  for (const tileId of initialDiscoveredTileIds) {
    if (!tileById.has(tileId)) {
      hasError = report(`Unknown initialDiscoveredTileId: ${tileId}`) || hasError;
    }
  }

  for (let row = 1; row <= rows; row += 1) {
    for (let col = 1; col <= cols; col += 1) {
      const tileId = `${row}-${col}`;
      if (!tileById.has(tileId)) {
        hasError = report(`Missing map tile for complete coverage: ${tileId}`) || hasError;
      }
    }
  }

  if (tileById.size !== rows * cols) {
    hasError = report(`Map tile count must match size coverage: expected ${rows * cols}, got ${tileById.size}`) || hasError;
  }

  return hasError;
}

function addUnique(set, value) {
  if (set.has(value)) {
    return false;
  }

  set.add(value);
  return true;
}

function report(message) {
  console.error(message);
  return true;
}
