import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { formatEventManifestIssues, validateEventManifest } from "../../../scripts/generate-event-content-manifest.mjs";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const root = process.env.VALIDATE_CONTENT_ROOT
  ? path.resolve(process.env.VALIDATE_CONTENT_ROOT)
  : sourceRoot;
const { validateEventContentLibrary } = await loadEventValidation();

const legacyPairs = [
  ["content/events/events.json", "content/schemas/events.schema.json"],
  ["content/crew/crew.json", "content/schemas/crew.schema.json"],
  ["content/items/items.json", "content/schemas/items.schema.json"],
  ["content/maps/default-map.json", "content/schemas/maps.schema.json"],
  ["content/call-actions/basic-actions.json", "content/schemas/call-actions.schema.json"],
  ["content/call-actions/object-actions.json", "content/schemas/call-actions.schema.json"],
];

const eventSchemaPaths = [
  "content/schemas/events/condition.schema.json",
  "content/schemas/events/effect.schema.json",
  "content/schemas/events/event-graph.schema.json",
  "content/schemas/events/event-definition.schema.json",
  "content/schemas/events/call-template.schema.json",
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
];

const eventAssetFiles = [
  ["content/events/handler_registry.json", "content/schemas/events/handler-registry.schema.json"],
];

const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true });
const schemaPaths = new Set([...legacyPairs.map(([, schemaPath]) => schemaPath), ...eventSchemaPaths]);
const schemasByPath = Object.fromEntries([...schemaPaths].map((schemaPath) => [schemaPath, readJson(schemaPath)]));
for (const schema of Object.values(schemasByPath)) {
  ajv.addSchema(schema);
}

const loaded = Object.fromEntries(legacyPairs.map(([dataPath]) => [dataPath, readJson(dataPath)]));
const validItemTags = new Set(["food", "light", "medical", "signal", "clue"]);
const validAddItemTargets = new Set(["crewInventory", "baseInventory"]);

let failed = false;
let eventSchemaFailed = false;

const eventManifestResult = validateEventManifest(root);
if (eventManifestResult.issues.length > 0) {
  console.error(formatEventManifestIssues(eventManifestResult.issues));
  failed = true;
}

for (const [dataPath, schemaPath] of legacyPairs) {
  failed = validateJsonFile(dataPath, schemaPath, loaded[dataPath]) || failed;
}

for (const { directoryPath, schemaPath } of eventAssetGroups) {
  for (const dataPath of listJsonFiles(directoryPath)) {
    const fileFailed = validateJsonFile(dataPath, schemaPath);
    eventSchemaFailed = fileFailed || eventSchemaFailed;
    failed = fileFailed || failed;
  }
}

for (const [dataPath, schemaPath] of eventAssetFiles) {
  const fileFailed = validateJsonFile(dataPath, schemaPath);
  eventSchemaFailed = fileFailed || eventSchemaFailed;
  failed = fileFailed || failed;
}

if (!eventSchemaFailed) {
  failed = validateEventProgramReferences() || failed;
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

function loadArrayFromFiles(relativeDirectory, propertyName) {
  return listJsonFiles(relativeDirectory).flatMap((dataPath) => readJson(dataPath)[propertyName] ?? []);
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
  const events = data["content/events/events.json"].events;
  const crew = data["content/crew/crew.json"].crew;
  const items = data["content/items/items.json"].items;
  const defaultMap = data["content/maps/default-map.json"];

  const eventIds = new Set();
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

  for (const event of events) {
    if (!addUnique(eventIds, event.eventId)) {
      hasError = report(`Duplicate eventId: ${event.eventId}`);
    }

    const choiceIds = new Set(event.choices.map((choice) => choice.choiceId));
    if (event.emergency && !choiceIds.has(event.emergency.autoResolveResult)) {
      hasError = report(`Unknown autoResolveResult in event ${event.eventId}: ${event.emergency.autoResolveResult}`);
    }

    for (const effect of event.effects) {
      hasError = validateEffectReference(event.eventId, effect, itemIds) || hasError;
    }

    for (const choice of event.choices) {
      const owner = `${event.eventId}.${choice.choiceId}`;
      if (choice.usesItemTag && !validItemTags.has(choice.usesItemTag)) {
        hasError = report(`Invalid usesItemTag in ${owner}: ${choice.usesItemTag}`) || hasError;
      }

      const choiceEffects = [
        ...(choice.effects ?? []),
        ...(choice.successEffects ?? []),
        ...(choice.failureEffects ?? []),
      ];
      if (choice.usesItemTag && !choiceEffects.some((effect) => effect.type === "useItemByTag" && effect.itemTag === choice.usesItemTag)) {
        hasError = report(`Choice ${owner} usesItemTag '${choice.usesItemTag}' but has no matching useItemByTag effect`) || hasError;
      }

      for (const effect of choice.effects ?? []) {
        hasError = validateEffectReference(owner, effect, itemIds) || hasError;
      }
      for (const effect of choice.successEffects ?? []) {
        hasError = validateEffectReference(`${owner}.success`, effect, itemIds) || hasError;
      }
      for (const effect of choice.failureEffects ?? []) {
        hasError = validateEffectReference(`${owner}.failure`, effect, itemIds) || hasError;
      }
    }
  }

  for (const member of crew) {
    if (member.emergencyEvent && !eventIds.has(member.emergencyEvent.eventId)) {
      hasError = report(`Unknown emergency eventId in crew ${member.crewId}: ${member.emergencyEvent.eventId}`);
    }
  }

  hasError = validateMap(defaultMap) || hasError;

  return hasError;
}

function validateMap(map) {
  let hasError = false;
  const { rows, cols } = map.size;
  const tileIds = new Set();
  const tileById = new Map();
  const objectIds = new Set();
  const initialDiscoveredTileIds = new Set(map.initialDiscoveredTileIds);

  if (rows !== 8 || cols !== 8) {
    hasError = report(`Default map must be 8 x 8, got ${rows} x ${cols}`) || hasError;
  }

  if (!initialDiscoveredTileIds.has(map.originTileId)) {
    hasError = report(`Map initialDiscoveredTileIds must include originTileId: ${map.originTileId}`) || hasError;
  }

  for (const tile of map.tiles) {
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

    for (const object of tile.objects) {
      if (!addUnique(objectIds, object.id)) {
        hasError = report(`Duplicate map object id: ${object.id}`) || hasError;
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

function validateEffectReference(owner, effect, itemIds) {
  if ((effect.type === "addResource" || effect.type === "removeResource" || effect.type === "discoverResource") && !itemIds.has(effect.resource)) {
    return report(`Unknown resource item in ${owner}: ${effect.resource}`);
  }

  if (effect.type === "addItem") {
    let hasError = false;
    if (!itemIds.has(effect.itemId)) {
      hasError = report(`Unknown addItem.itemId in ${owner}: ${effect.itemId}`) || hasError;
    }
    if (!validAddItemTargets.has(effect.target)) {
      hasError = report(`Invalid addItem.target in ${owner}: ${effect.target}`) || hasError;
    }
    return hasError;
  }

  if (effect.type === "useItemByTag" && !validItemTags.has(effect.itemTag)) {
    return report(`Invalid useItemByTag.itemTag in ${owner}: ${effect.itemTag}`);
  }

  return false;
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
