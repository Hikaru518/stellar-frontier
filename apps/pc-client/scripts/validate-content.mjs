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
];

const questSchemaPath = "content/schemas/quests.schema.json";
const questDataPaths = listJsonFiles("content/quests");
const mapSchemaPath = "content/schemas/maps.schema.json";
const mapDataPaths = listJsonFiles("content/maps");
const mapRadarSchemaPath = "content/schemas/map-radar.schema.json";
const mapRadarDataPaths = listJsonFiles("content/maps/radar");

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

const questProgressOperations = new Set([
  "complete_quest",
  "complete_subquest",
  "complete_todo",
  "set_quest_node",
  "set_subquest_node",
  "mark_updated",
]);

const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true });
const schemaPaths = new Set([
  ...contentFilePairs.map(([, schemaPath]) => schemaPath),
  questSchemaPath,
  mapSchemaPath,
  mapRadarSchemaPath,
  ...contentAssetGroups.map(({ schemaPath }) => schemaPath),
  ...eventSchemaPaths,
]);
const schemasByPath = Object.fromEntries([...schemaPaths].map((schemaPath) => [schemaPath, readJson(schemaPath)]));
for (const schema of Object.values(schemasByPath)) {
  ajv.addSchema(schema);
}

const loaded = Object.fromEntries(contentFilePairs.map(([dataPath]) => [dataPath, readJson(dataPath)]));
const loadedQuests = Object.fromEntries(questDataPaths.map((dataPath) => [dataPath, readJson(dataPath)]));
const loadedMaps = Object.fromEntries(mapDataPaths.map((dataPath) => [dataPath, readJson(dataPath)]));
const loadedMapRadars = Object.fromEntries(mapRadarDataPaths.map((dataPath) => [dataPath, readJson(dataPath)]));

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

for (const [dataPath, questData] of Object.entries(loadedQuests)) {
  failed = validateJsonFile(dataPath, questSchemaPath, questData) || failed;
}

for (const [dataPath, mapData] of Object.entries(loadedMaps)) {
  failed = validateJsonFile(dataPath, mapSchemaPath, mapData) || failed;
}

for (const [dataPath, radarData] of Object.entries(loadedMapRadars)) {
  failed = validateJsonFile(dataPath, mapRadarSchemaPath, radarData) || failed;
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
  failed = validateStructuredEventTileReferences(loadedMaps) || failed;
  failed = validateEventProgramReferences() || failed;
}

failed = validateReferences(loaded, loadedMaps, loadedMapRadars) || failed;
failed = validateQuestContentReferences(loadedQuests, loaded, loadedMaps) || failed;
failed = validateQuestProgressEffectReferences(loadedQuests) || failed;

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

function validateStructuredEventTileReferences(maps) {
  const tileIds = new Set(Object.values(maps).flatMap((map) => (Array.isArray(map.tiles) ? map.tiles.map((tile) => tile.id) : [])));
  let hasError = false;
  for (const { directoryPath } of eventAssetGroups) {
    for (const dataPath of listJsonFiles(directoryPath)) {
      hasError = validateTileReferencesInValue(readJson(dataPath), dataPath, [], tileIds) || hasError;
    }
  }
  return hasError;
}

function validateTileReferencesInValue(value, dataPath, segments, tileIds) {
  if (Array.isArray(value)) {
    return value.reduce(
      (hasError, item, index) => validateTileReferencesInValue(item, dataPath, [...segments, index], tileIds) || hasError,
      false,
    );
  }

  if (!value || typeof value !== "object") {
    return false;
  }

  let hasError = false;
  for (const [key, child] of Object.entries(value)) {
    if (isTileReferenceKey(key) && typeof child === "string" && !child.includes("{")) {
      hasError = validateKnownTileId(child, dataPath, [...segments, key], tileIds) || hasError;
      continue;
    }

    if ((key === "tile_ids" || key === "path_tile_ids" || key === "related_tile_ids") && Array.isArray(child)) {
      hasError =
        child.reduce(
          (childHasError, tileId, index) =>
            (typeof tileId === "string" && !tileId.includes("{") && validateKnownTileId(tileId, dataPath, [...segments, key, index], tileIds)) ||
            childHasError,
          false,
        ) || hasError;
      continue;
    }

    if ((key === "id" || key === "ref") && typeof child === "string" && value.type === "tile_id" && !child.includes("{")) {
      hasError = validateKnownTileId(child, dataPath, [...segments, key], tileIds) || hasError;
      continue;
    }

    hasError = validateTileReferencesInValue(child, dataPath, [...segments, key], tileIds) || hasError;
  }
  return hasError;
}

function isTileReferenceKey(key) {
  return key === "tile_id" || key === "target_tile_id" || key === "from_tile_id" || key === "to_tile_id" || key === "origin_tile_id" || key === "primary_tile_id";
}

function validateKnownTileId(tileId, dataPath, segments, tileIds) {
  if (tileIds.has(tileId)) {
    return false;
  }
  return report(`Unknown tile id in structured event content: ${tileId} at ${dataPath}${formatJsonPath(segments)}`);
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

function validateReferences(data, maps, mapRadars) {
  let hasError = false;
  const crew = data["content/crew/crew.json"].crew;
  const items = data["content/items/items.json"].items;
  const mapTileIds = new Set(Object.values(maps).flatMap((map) => (Array.isArray(map.tiles) ? map.tiles.map((tile) => tile.id) : [])));

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

    if (!mapTileIds.has(member.currentTile)) {
      hasError = report(`Unknown currentTile in crew ${member.crewId}: ${member.currentTile}`) || hasError;
    }
  }

  const { hasError: catalogFailed } = collectMapObjectIds();
  hasError = catalogFailed || hasError;
  for (const [dataPath, map] of Object.entries(maps)) {
    hasError =
      validateMap(map, {
        requireDefaultSize: dataPath === "content/maps/default-map.json",
        dataPath,
        mapRadars,
      }) || hasError;
  }

  return hasError;
}

function validateQuestContentReferences(questFiles, data, maps) {
  let hasError = false;
  const crewIds = new Set(data["content/crew/crew.json"].crew.map((member) => member.crewId));
  const tileIds = new Set(Object.values(maps).flatMap((map) => (Array.isArray(map.tiles) ? map.tiles.map((tile) => tile.id) : [])));
  const questIds = new Set();

  for (const [dataPath, questFile] of Object.entries(questFiles)) {
    if (questFile.schema_version !== "quests.v1" || !Array.isArray(questFile.quests)) {
      continue;
    }

    for (const quest of questFile.quests) {
      const questPath = `${dataPath}/quests/${quest.id ?? "<missing>"}`;
      if (!addUnique(questIds, quest.id)) {
        hasError = report(`Duplicate quest id: ${quest.id}`) || hasError;
      }

      hasError = validateQuestNodes(quest.nodes, quest.initial_node_id, questPath) || hasError;
      hasError = validateQuestCompletedNode(quest.nodes, quest.completed_node_id, questPath) || hasError;
      hasError = validateQuestNavigation(quest.navigation, questPath, crewIds, tileIds) || hasError;
      hasError = validateQuestTodos(quest.todos, questPath, new Set((quest.nodes ?? []).map((node) => node.id)), crewIds, tileIds) || hasError;

      const subquestIds = new Set();
      for (const subquest of quest.subquests ?? []) {
        const subquestPath = `${questPath}/subquests/${subquest.id ?? "<missing>"}`;
        if (!addUnique(subquestIds, subquest.id)) {
          hasError = report(`Duplicate subquest id in quest ${quest.id}: ${subquest.id}`) || hasError;
        }

        hasError = validateQuestNodes(subquest.nodes, subquest.initial_node_id, subquestPath) || hasError;
        hasError = validateQuestNavigation(subquest.navigation, subquestPath, crewIds, tileIds) || hasError;

        hasError = validateQuestTodos(subquest.todos, subquestPath, new Set((subquest.nodes ?? []).map((node) => node.id)), crewIds, tileIds) || hasError;
      }
    }
  }

  return hasError;
}

function validateQuestTodos(todos, contextPath, nodeIds, crewIds, tileIds) {
  let hasError = false;
  const todoIds = new Set();

  for (const todo of todos ?? []) {
    const todoPath = `${contextPath}/todos/${todo.id ?? "<missing>"}`;
    if (!addUnique(todoIds, todo.id)) {
      hasError = report(`Duplicate todo id at ${contextPath}: ${todo.id}`) || hasError;
    }

    if (todo.visible_after_node && !nodeIds.has(todo.visible_after_node)) {
      hasError = report(`Unknown todo visible_after_node at ${todoPath}: ${todo.visible_after_node}`) || hasError;
    }

    hasError = validateQuestNavigation(todo.navigation, todoPath, crewIds, tileIds) || hasError;
  }

  return hasError;
}

function validateQuestNodes(nodes, initialNodeId, contextPath) {
  let hasError = false;
  const nodeIds = new Set();

  for (const node of nodes ?? []) {
    if (!addUnique(nodeIds, node.id)) {
      hasError = report(`Duplicate quest node id at ${contextPath}: ${node.id}`) || hasError;
    }
  }

  if (!nodeIds.has(initialNodeId)) {
    hasError = report(`Unknown initial_node_id at ${contextPath}: ${initialNodeId}`) || hasError;
  }

  return hasError;
}

function validateQuestCompletedNode(nodes, completedNodeId, contextPath) {
  if (!completedNodeId) {
    return false;
  }

  const completedNode = (nodes ?? []).find((node) => node.id === completedNodeId);
  if (!completedNode) {
    return report(`Unknown completed_node_id at ${contextPath}: ${completedNodeId}`);
  }

  if (completedNode.type !== "completed") {
    return report(`completed_node_id must reference a completed node at ${contextPath}: ${completedNodeId}`);
  }

  return false;
}

function validateQuestNavigation(entries, contextPath, crewIds, tileIds) {
  let hasError = false;

  for (const [index, entry] of (entries ?? []).entries()) {
    const entryPath = `${contextPath}/navigation/${index}`;
    if (entry.type === "crew" && !crewIds.has(entry.crew_id)) {
      hasError = report(`Unknown quest navigation crew_id at ${entryPath}: ${entry.crew_id}`) || hasError;
    }

    if (entry.type === "tile" && !tileIds.has(entry.tile_id)) {
      hasError = report(`Unknown quest navigation tile_id at ${entryPath}: ${entry.tile_id}`) || hasError;
    }
  }

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

function validateMap(map, options) {
  let hasError = false;
  const { rows, cols } = map.size;
  const tileIds = new Set();
  const tileById = new Map();
  const initialDiscoveredTileIds = new Set(map.initialDiscoveredTileIds);

  if (options.requireDefaultSize && (rows !== 256 || cols !== 256)) {
    hasError = report(`Default map must be 256 x 256, got ${rows} x ${cols}`) || hasError;
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

  hasError = validateMapFeatures(map, { rows, cols, dataPath: options.dataPath }) || hasError;

  const radar = options.mapRadars[map.radarPath];
  if (!radar) {
    hasError = report(`Map radarPath does not exist in ${options.dataPath}: ${map.radarPath}`) || hasError;
  } else {
    hasError = validateRadar(radar, {
      dataPath: options.dataPath,
      radarPath: map.radarPath,
      mapId: map.id,
      rows,
      cols,
    }) || hasError;
  }

  return hasError;
}

function validateMapFeatures(map, { rows, cols, dataPath }) {
  let hasError = false;
  const featureIds = new Set();
  const features = Array.isArray(map.features) ? map.features : [];
  const mapId = map.id ?? "<missing>";

  for (const [index, feature] of features.entries()) {
    if (!feature || typeof feature !== "object") {
      continue;
    }

    const featureId = typeof feature.id === "string" && feature.id.length > 0 ? feature.id : `<index:${index}>`;
    const context = { dataPath, mapId, featureId };

    if (typeof feature.id === "string" && !addUnique(featureIds, feature.id)) {
      hasError = reportMapFeatureIssue(context, "id", "Duplicate feature id") || hasError;
    }

    hasError = validateMapFeatureInvestigationFields(feature, context) || hasError;
    hasError = validateMapFeatureFootprint(feature, { ...context, rows, cols }) || hasError;
  }

  return hasError;
}

function validateMapFeatureInvestigationFields(feature, context) {
  let hasError = false;

  if (feature.investigatable === true) {
    if (!Array.isArray(feature.status_options) || feature.status_options.length === 0) {
      hasError = reportMapFeatureIssue(context, "status_options", "Investigatable feature must define non-empty status_options") || hasError;
    }

    if (typeof feature.initial_status !== "string" || feature.initial_status.length === 0) {
      hasError = reportMapFeatureIssue(context, "initial_status", "Investigatable feature must define initial_status") || hasError;
    } else if (Array.isArray(feature.status_options) && !feature.status_options.includes(feature.initial_status)) {
      hasError = reportMapFeatureIssue(context, "initial_status", "Feature initial_status must be included in status_options") || hasError;
    }

    if (!Array.isArray(feature.actions)) {
      hasError = reportMapFeatureIssue(context, "actions", "Investigatable feature must define actions") || hasError;
    }

    return hasError;
  }

  for (const field of ["status_options", "initial_status", "actions"]) {
    if (hasOwnField(feature, field)) {
      hasError = reportMapFeatureIssue(context, field, "Non-investigatable feature must not define investigatable-only field") || hasError;
    }
  }

  return hasError;
}

function validateMapFeatureFootprint(feature, context) {
  const footprint = feature.footprint;
  if (!footprint || typeof footprint !== "object" || footprint.type !== "row_spans") {
    return false;
  }

  let hasError = false;
  const spans = Array.isArray(footprint.spans) ? footprint.spans : [];
  if (spans.length === 0) {
    return reportMapFeatureIssue(context, "footprint.spans", "Map feature footprint spans must not be empty");
  }

  const coveredTileIds = new Set();
  for (const [index, span] of spans.entries()) {
    if (!span || typeof span !== "object") {
      continue;
    }

    const field = `footprint.spans[${index}]`;
    const { row, colStart, colEnd } = span;
    if (!Number.isInteger(row) || !Number.isInteger(colStart) || !Number.isInteger(colEnd)) {
      hasError = reportMapFeatureIssue(context, field, "Map feature row span coordinates must be integers") || hasError;
      continue;
    }

    let spanHasError = false;
    if (colStart > colEnd) {
      spanHasError = reportMapFeatureIssue(context, field, "Map feature row span colStart must be <= colEnd") || spanHasError;
    }

    if (!isInsideMapCoordinate(context, row, colStart) || !isInsideMapCoordinate(context, row, colEnd)) {
      spanHasError = reportMapFeatureIssue(context, field, "Map feature row span is out of bounds") || spanHasError;
    }

    if (spanHasError) {
      hasError = true;
      continue;
    }

    let overlapsPreviousSpan = false;
    for (let col = colStart; col <= colEnd; col += 1) {
      if (coveredTileIds.has(`${row}-${col}`)) {
        overlapsPreviousSpan = true;
        break;
      }
    }

    if (overlapsPreviousSpan) {
      hasError = reportMapFeatureIssue(context, field, "Map feature row span overlaps another span in the same feature") || hasError;
    }

    for (let col = colStart; col <= colEnd; col += 1) {
      coveredTileIds.add(`${row}-${col}`);
    }
  }

  if (coveredTileIds.size > 0) {
    hasError = validateMapFeatureFootprintContiguous(coveredTileIds, context) || hasError;
  }

  return hasError;
}

function validateMapFeatureFootprintContiguous(coveredTileIds, context) {
  const firstTileId = coveredTileIds.values().next().value;
  if (typeof firstTileId !== "string") {
    return false;
  }

  const visited = new Set([firstTileId]);
  const stack = [firstTileId];
  while (stack.length > 0) {
    const tileId = stack.pop();
    const coord = parseTileCoord(tileId);
    if (!coord) {
      continue;
    }

    for (const neighbor of [
      `${coord.row - 1}-${coord.col}`,
      `${coord.row + 1}-${coord.col}`,
      `${coord.row}-${coord.col - 1}`,
      `${coord.row}-${coord.col + 1}`,
    ]) {
      if (!coveredTileIds.has(neighbor) || visited.has(neighbor)) {
        continue;
      }
      visited.add(neighbor);
      stack.push(neighbor);
    }
  }

  if (visited.size === coveredTileIds.size) {
    return false;
  }

  return reportMapFeatureIssue(context, "footprint.spans", "Map feature footprint must be four-direction contiguous");
}

function parseTileCoord(tileId) {
  const match = /^(\d+)-(\d+)$/.exec(tileId);
  if (!match) {
    return null;
  }

  return { row: Number(match[1]), col: Number(match[2]) };
}

function isInsideMapCoordinate({ rows, cols }, row, col) {
  return row >= 1 && row <= rows && col >= 1 && col <= cols;
}

function reportMapFeatureIssue({ dataPath, mapId, featureId }, field, message) {
  return report(`${message} in map ${mapId} feature ${featureId} field ${field} at ${dataPath}`);
}

function validateRadar(radar, { dataPath, radarPath, mapId, rows, cols }) {
  let hasError = false;
  if (!radar) {
    return report(`Map radar definition is required: ${dataPath}`);
  }

  if (radar.mapId !== mapId) {
    hasError = report(`Map radar mapId mismatch in ${radarPath}: ${radar.mapId} vs ${mapId}`) || hasError;
  }

  if (radar.world?.width !== cols || radar.world?.height !== rows) {
    hasError =
      report(`Map radar world must match map size in ${radarPath}: ${radar.world?.width} x ${radar.world?.height} vs ${cols} x ${rows}`) ||
      hasError;
  }

  if (!isInsideRadar(radar, radar.world?.origin?.x, radar.world?.origin?.y)) {
    hasError = report(`Map radar origin is out of bounds in ${radarPath}`) || hasError;
  }

  hasError = validateRadarRows(radar.glyphRows, "glyphRows", radarPath, rows, cols) || hasError;
  hasError = validateRadarRows(radar.toneRows, "toneRows", radarPath, rows, cols) || hasError;

  const toneKeys = new Set(Object.keys(radar.palette ?? {}));
  for (const [rowIndex, row] of (Array.isArray(radar.toneRows) ? radar.toneRows : []).entries()) {
    for (let colIndex = 0; colIndex < row.length; colIndex += 1) {
      const tone = row[colIndex];
      if (!toneKeys.has(tone)) {
        hasError = report(`Unknown radar tone in ${radarPath}/toneRows/${rowIndex}/${colIndex}: ${tone}`) || hasError;
      }
    }
  }

  for (const [symbolId, symbol] of Object.entries(radar.symbols ?? {})) {
    if (!toneKeys.has(symbol?.tone)) {
      hasError = report(`Unknown radar symbol tone in ${radarPath}/symbols/${symbolId}: ${symbol?.tone}`) || hasError;
    }
  }

  const regionIds = new Set();
  for (const region of radar.regions ?? []) {
    if (!addUnique(regionIds, region.id)) {
      hasError = report(`Duplicate radar region id in ${radarPath}: ${region.id}`) || hasError;
    }
    if (!toneKeys.has(region.tone)) {
      hasError = report(`Unknown radar region tone in ${radarPath}/regions/${region.id}: ${region.tone}`) || hasError;
    }
    hasError = validateRadarRegionBounds(radar, region, radarPath) || hasError;
  }

  return hasError;
}

function validateRadarRows(rowsValue, fieldName, dataPath, rows, cols) {
  let hasError = false;
  if (!Array.isArray(rowsValue) || rowsValue.length !== rows) {
    return report(`Map radar ${fieldName} row count must be ${rows} in ${dataPath}`);
  }

  for (const [index, row] of rowsValue.entries()) {
    if (typeof row !== "string" || row.length !== cols) {
      hasError = report(`Map radar ${fieldName}/${index} must contain ${cols} cells in ${dataPath}`) || hasError;
    }
  }
  return hasError;
}

function validateRadarRegionBounds(radar, region, dataPath) {
  const shape = region.shape;
  if (!shape) {
    return false;
  }

  if (shape.type === "circle") {
    return isInsideRadar(radar, shape.x, shape.y)
      ? false
      : report(`Radar region circle center out of bounds in ${dataPath}/radar/regions/${region.id}`);
  }

  if (shape.type === "box") {
    let hasError = false;
    if (shape.x2 < shape.x1 || shape.y2 < shape.y1) {
      hasError = report(`Radar region box coordinates must be ordered in ${dataPath}/radar/regions/${region.id}`) || hasError;
    }
    if (!isInsideRadar(radar, shape.x1, shape.y1) || !isInsideRadar(radar, shape.x2, shape.y2)) {
      hasError = report(`Radar region box out of bounds in ${dataPath}/radar/regions/${region.id}`) || hasError;
    }
    return hasError;
  }

  return false;
}

function isInsideRadar(radar, x, y) {
  return Number.isInteger(x)
    && Number.isInteger(y)
    && Number.isInteger(radar.world?.width)
    && Number.isInteger(radar.world?.height)
    && x >= 0
    && y >= 0
    && x < radar.world.width
    && y < radar.world.height;
}

function addUnique(set, value) {
  if (set.has(value)) {
    return false;
  }

  set.add(value);
  return true;
}

function hasOwnField(value, field) {
  return Object.prototype.hasOwnProperty.call(value, field);
}

function validateQuestProgressEffectReferences(questFiles) {
  const questIndex = buildQuestIndex(questFiles);
  let hasError = false;

  for (const { directoryPath } of eventAssetGroups) {
    for (const dataPath of listJsonFiles(directoryPath)) {
      const file = readJson(dataPath);
      for (const [definitionIndex, definition] of (file.event_definitions ?? []).entries()) {
        for (const [groupIndex, group] of (definition.effect_groups ?? []).entries()) {
          for (const [effectIndex, effect] of (group.effects ?? []).entries()) {
            hasError = validateQuestProgressEffect(
              effect,
              `${dataPath}/event_definitions/${definitionIndex}/effect_groups/${groupIndex}/effects/${effectIndex}`,
              questIndex,
            ) || hasError;
          }
        }

        for (const [nodeIndex, node] of (definition.event_graph?.nodes ?? []).entries()) {
          for (const [effectIndex, effect] of (node.inline_effects ?? []).entries()) {
            hasError = validateQuestProgressEffect(
              effect,
              `${dataPath}/event_definitions/${definitionIndex}/event_graph/nodes/${nodeIndex}/inline_effects/${effectIndex}`,
              questIndex,
            ) || hasError;
          }
        }
      }
    }
  }

  return hasError;
}

function buildQuestIndex(questFiles) {
  const quests = new Map();

  for (const questFile of Object.values(questFiles)) {
    for (const quest of questFile.quests ?? []) {
      const questEntry = {
        quest,
        nodes: new Set((quest.nodes ?? []).map((node) => node.id)),
        todos: new Set((quest.todos ?? []).map((todo) => todo.id)),
        subquests: new Map(),
      };

      for (const subquest of quest.subquests ?? []) {
        questEntry.subquests.set(subquest.id, {
          subquest,
          nodes: new Set((subquest.nodes ?? []).map((node) => node.id)),
          todos: new Set((subquest.todos ?? []).map((todo) => todo.id)),
        });
      }

      quests.set(quest.id, questEntry);
    }
  }

  return quests;
}

function validateQuestProgressEffect(effect, contextPath, questIndex) {
  if (effect?.type !== "handler_effect" || effect.handler_type !== "quest_progress") {
    return false;
  }

  let hasError = false;
  const params = effect.params && typeof effect.params === "object" ? effect.params : {};
  const operation = params.operation;
  if (!questProgressOperations.has(operation)) {
    return report(`Invalid quest_progress operation at ${contextPath}/params/operation: ${operation ?? "<missing>"}`);
  }

  for (const field of requiredQuestProgressFields(operation)) {
    if (typeof params[field] !== "string" || params[field].length === 0) {
      hasError = report(`Missing quest_progress ${operation} field at ${contextPath}/params/${field}`) || hasError;
    }
  }
  if (hasError) {
    return true;
  }

  const quest = questIndex.get(params.quest_id);
  if (!quest) {
    return report(`Unknown quest_progress quest_id at ${contextPath}/params/quest_id: ${params.quest_id}`);
  }

  if (operation === "set_quest_node" && !quest.nodes.has(params.node_id)) {
    hasError = report(`Unknown quest_progress node_id in quest ${params.quest_id} at ${contextPath}/params/node_id: ${params.node_id}`) || hasError;
  }

  if (operation === "complete_todo" && !params.subquest_id) {
    if (!quest.todos.has(params.todo_id)) {
      hasError = report(`Unknown quest_progress todo_id in quest ${params.quest_id} at ${contextPath}/params/todo_id: ${params.todo_id}`) || hasError;
    }
  }

  if (operation === "complete_subquest" || (operation === "complete_todo" && params.subquest_id) || operation === "set_subquest_node") {
    const subquest = quest.subquests.get(params.subquest_id);
    if (!subquest) {
      return report(`Unknown quest_progress subquest_id in quest ${params.quest_id} at ${contextPath}/params/subquest_id: ${params.subquest_id}`);
    }

    if (operation === "complete_todo" && !subquest.todos.has(params.todo_id)) {
      hasError = report(`Unknown quest_progress todo_id in subquest ${params.subquest_id} at ${contextPath}/params/todo_id: ${params.todo_id}`) || hasError;
    }
    if (operation === "set_subquest_node" && !subquest.nodes.has(params.node_id)) {
      hasError = report(`Unknown quest_progress node_id in subquest ${params.subquest_id} at ${contextPath}/params/node_id: ${params.node_id}`) || hasError;
    }
  }

  return hasError;
}

function requiredQuestProgressFields(operation) {
  switch (operation) {
    case "complete_quest":
    case "mark_updated":
      return ["quest_id"];
    case "complete_subquest":
      return ["quest_id", "subquest_id"];
    case "complete_todo":
      return ["quest_id", "todo_id"];
    case "set_quest_node":
      return ["quest_id", "node_id"];
    case "set_subquest_node":
      return ["quest_id", "subquest_id", "node_id"];
    default:
      return [];
  }
}

function report(message) {
  console.error(message);
  return true;
}
