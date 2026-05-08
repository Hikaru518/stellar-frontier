import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { validateEventManifest } from "./eventManifestStore.mjs";

const EVENT_SCHEMA_PATHS = [
  "content/schemas/events/condition.schema.json",
  "content/schemas/events/effect.schema.json",
  "content/schemas/events/event-graph.schema.json",
  "content/schemas/events/event-definition.schema.json",
  "content/schemas/events/call-template.schema.json",
  "content/schemas/events/handler-registry.schema.json",
];
const EVENT_DEFINITION_SCHEMA_ID = "https://stellar-frontier.local/schemas/events/event-definition.schema.json";
const CALL_TEMPLATE_SCHEMA_ID = "https://stellar-frontier.local/schemas/events/call-template.schema.json";
const DEFAULT_REPO_ROOT = path.resolve(import.meta.dirname, "../../..");

let runtimeEventValidationPromise = null;

export async function validateEventAssetsForPublish({
  repoRoot = DEFAULT_REPO_ROOT,
  eventDefinitions = null,
  callTemplates = null,
  definitionFile = null,
  callTemplateFile = null,
  handlers = [],
  presets = [],
  domains = null,
  manifestIssues = [],
  crossReferenceValidator = null,
} = {}) {
  const normalizedDefinitionFile = definitionFile ?? { event_definitions: eventDefinitions ?? [] };
  const normalizedCallTemplateFile = callTemplateFile ?? { call_templates: callTemplates ?? [] };
  const normalizedEventDefinitions = normalizedDefinitionFile.event_definitions ?? [];
  const normalizedCallTemplates = normalizedCallTemplateFile.call_templates ?? [];
  const library = {
    domains: domains ?? Array.from(new Set(normalizedEventDefinitions.map((definition) => definition?.domain).filter(Boolean))).sort(),
    event_definitions: normalizedEventDefinitions,
    call_templates: normalizedCallTemplates,
    handlers,
    presets,
  };
  const schemaIssues = await validateEventSchemaFiles({
    repoRoot,
    definitionFile: normalizedDefinitionFile,
    callTemplateFile: normalizedCallTemplateFile,
  });
  const issues = [...schemaIssues, ...manifestIssues.map(mapEventManifestIssueToEditorIssue)];

  if (!hasBlockingIssues(schemaIssues)) {
    const validateLibrary =
      crossReferenceValidator ?? (await loadRuntimeEventValidation(repoRoot)).validateEventContentLibrary;
    issues.push(...validateLibrary(library).map((issue) => mapCrossReferenceIssueToEditorIssue(issue, { library })));
  }

  return toValidationResult(issues);
}

export async function validateEventManifestForEditor(options = {}) {
  const result = await validateEventManifest(options);
  const issues = result.issues.map(mapEventManifestIssueToEditorIssue);

  return {
    valid: !hasBlockingIssues(issues),
    issues,
  };
}

export function mapAjvErrorToEditorIssue(error, { assetType, data, label }) {
  const jsonPath = error.instancePath || "/";
  const assetIndex = getCollectionIndexFromJsonPointer(jsonPath);
  const asset = getAssetAtIndex(data, assetType, assetIndex);
  const messagePath = jsonPath === "/" ? "root" : jsonPath;

  return {
    severity: "error",
    code: `schema_${error.keyword}`,
    message: `${label} schema validation failed at ${messagePath}: ${error.message ?? "invalid value"}.`,
    asset_type: assetType,
    asset_id: typeof asset?.id === "string" ? asset.id : undefined,
    json_path: jsonPath,
    editor_location: buildEditorLocation({
      assetType,
      jsonPath,
      library: buildSingleAssetLibrary(assetType, data),
    }),
  };
}

export function mapEventManifestIssueToEditorIssue(issue) {
  const assetType = issue.domain_id == null ? "manifest" : "domain";
  const jsonPath = issue.json_path ?? "/";

  return {
    severity: "error",
    code: issue.code,
    message: issue.message,
    asset_type: assetType,
    asset_id: issue.domain_id ?? issue.file_path,
    json_path: jsonPath,
    editor_location: {
      step: "domain",
      section: "manifest",
      field_path: issue.json_path ?? issue.file_path ?? "/",
    },
  };
}

export function mapCrossReferenceIssueToEditorIssue(issue, { library }) {
  const jsonPath = dotBracketPathToJsonPointer(issue.path);

  return {
    severity: issue.severity,
    code: issue.code,
    message: issue.message,
    asset_type: issue.asset_type,
    asset_id: issue.asset_id,
    json_path: jsonPath,
    editor_location: buildEditorLocation({
      assetType: issue.asset_type,
      jsonPath,
      originalPath: issue.path,
      library,
    }),
  };
}

export function dotBracketPathToJsonPointer(pathValue) {
  const segments = parseDotBracketPath(pathValue);
  if (!segments) {
    return pathValue || "/";
  }

  return `/${segments.map(escapeJsonPointer).join("/")}`;
}

async function validateEventSchemaFiles({ repoRoot, definitionFile, callTemplateFile }) {
  const validator = await createEventSchemaValidator(repoRoot);

  return [
    ...validateSchemaAsset({
      validate: validator.definition,
      data: definitionFile,
      assetType: "event_definition",
      label: "Event definition",
    }),
    ...validateSchemaAsset({
      validate: validator.callTemplate,
      data: callTemplateFile,
      assetType: "call_template",
      label: "Call template",
    }),
  ];
}

async function createEventSchemaValidator(repoRoot) {
  const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true });

  for (const schemaPath of EVENT_SCHEMA_PATHS) {
    ajv.addSchema(await readJson(path.join(repoRoot, schemaPath)));
  }

  const definition = ajv.getSchema(EVENT_DEFINITION_SCHEMA_ID);
  const callTemplate = ajv.getSchema(CALL_TEMPLATE_SCHEMA_ID);
  if (!definition || !callTemplate) {
    throw new Error("Event schema validator failed to load required schemas.");
  }

  return { definition, callTemplate };
}

function validateSchemaAsset({ validate, data, assetType, label }) {
  if (validate(data)) {
    return [];
  }

  return (validate.errors ?? []).map((error) => mapAjvErrorToEditorIssue(error, { assetType, data, label }));
}

async function loadRuntimeEventValidation(repoRoot) {
  if (repoRoot === DEFAULT_REPO_ROOT && runtimeEventValidationPromise) {
    return runtimeEventValidationPromise;
  }

  const loadPromise = loadRuntimeEventValidationUncached(repoRoot);
  if (repoRoot === DEFAULT_REPO_ROOT) {
    runtimeEventValidationPromise = loadPromise;
  }
  return loadPromise;
}

async function loadRuntimeEventValidationUncached(repoRoot) {
  const validationPath = path.join(repoRoot, "apps/pc-client/src/events/validation.ts");

  try {
    return await import(pathToFileURL(validationPath).href);
  } catch (error) {
    if (!isUnknownTypeScriptExtensionError(error)) {
      throw error;
    }

    const tsModule = await import("typescript");
    const ts = tsModule.default ?? tsModule;
    const source = await fs.readFile(validationPath, "utf8");
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ES2020,
        target: ts.ScriptTarget.ES2020,
      },
    });
    return import(`data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`);
  }
}

function buildEditorLocation({ assetType, jsonPath, originalPath = jsonPath, library }) {
  const segments = parseJsonPointer(jsonPath);
  const fallback = {
    step: "review",
    section: "raw_json",
    field_path: originalPath,
  };

  if (assetType === "event_definition") {
    return buildDefinitionEditorLocation(segments, originalPath, library) ?? fallback;
  }

  if (assetType === "call_template") {
    return buildCallTemplateEditorLocation(segments, originalPath, library) ?? fallback;
  }

  return fallback;
}

function buildDefinitionEditorLocation(segments, originalPath, library) {
  if (segments[0] !== "event_definitions") {
    return null;
  }

  const definitionIndex = toArrayIndex(segments[1]);
  const definition = library?.event_definitions?.[definitionIndex];
  const section = segments[2];
  const location = {
    step: stepForDefinitionSection(section),
    field_path: `/${segments.map(escapeJsonPointer).join("/")}`,
  };

  if (section) {
    location.section = section;
  }

  if (section === "event_graph") {
    addGraphLocationDetails(location, definition, segments);
  }

  if (section === "effect_groups") {
    addEffectLocationDetails(location, definition, segments);
  }

  return location;
}

function buildCallTemplateEditorLocation(segments, originalPath, library) {
  if (segments[0] !== "call_templates") {
    return null;
  }

  const templateIndex = toArrayIndex(segments[1]);
  const template = library?.call_templates?.[templateIndex];
  const location = {
    step: "graph",
    section: "call_templates",
    field_path: `/${segments.map(escapeJsonPointer).join("/")}`,
  };

  if (template?.id) {
    location.call_template_id = template.id;
  }
  if (template?.node_id) {
    location.node_id = template.node_id;
  }
  if (segments[2] === "option_lines" && segments[3]) {
    location.option_id = segments[3];
  }

  return location;
}

function stepForDefinitionSection(section) {
  if (section === "trigger") {
    return "trigger";
  }

  if (section === "event_graph") {
    return "graph";
  }

  if (section === "effect_groups" || section === "log_templates") {
    return "effects";
  }

  return "basic";
}

function addGraphLocationDetails(location, definition, segments) {
  const nodesSegmentIndex = segments.indexOf("nodes");
  if (nodesSegmentIndex < 0) {
    return;
  }

  const nodeIndex = toArrayIndex(segments[nodesSegmentIndex + 1]);
  const node = definition?.event_graph?.nodes?.[nodeIndex];
  if (!node) {
    return;
  }

  location.node_id = node.id;
  if (node.call_template_id) {
    location.call_template_id = node.call_template_id;
  }

  const optionsSegmentIndex = segments.indexOf("options");
  if (optionsSegmentIndex >= 0) {
    const optionIndex = toArrayIndex(segments[optionsSegmentIndex + 1]);
    const option = node.options?.[optionIndex];
    if (option?.id) {
      location.option_id = option.id;
    }
  }

  const optionNodeMappingIndex = segments.indexOf("option_node_mapping");
  if (optionNodeMappingIndex >= 0 && segments[optionNodeMappingIndex + 1]) {
    location.option_id = segments[optionNodeMappingIndex + 1];
  }
}

function addEffectLocationDetails(location, definition, segments) {
  const groupIndex = toArrayIndex(segments[3]);
  const group = definition?.effect_groups?.[groupIndex];
  if (group?.id) {
    location.effect_group_id = group.id;
  }

  if (segments[4] === "effects") {
    const effectIndex = toArrayIndex(segments[5]);
    const effect = group?.effects?.[effectIndex];
    if (effect?.id) {
      location.effect_id = effect.id;
    }
  }
}

function buildSingleAssetLibrary(assetType, data) {
  if (assetType === "event_definition") {
    return {
      event_definitions: data.event_definitions ?? [],
      call_templates: [],
    };
  }

  return {
    event_definitions: [],
    call_templates: data.call_templates ?? [],
  };
}

function getCollectionIndexFromJsonPointer(jsonPath) {
  const segments = parseJsonPointer(jsonPath);
  return toArrayIndex(segments[1]);
}

function getAssetAtIndex(data, assetType, index) {
  if (assetType === "event_definition") {
    return data.event_definitions?.[index];
  }

  if (assetType === "call_template") {
    return data.call_templates?.[index];
  }

  return null;
}

function parseDotBracketPath(pathValue) {
  if (typeof pathValue !== "string" || pathValue.length === 0) {
    return null;
  }

  if (pathValue.startsWith("/")) {
    return parseJsonPointer(pathValue);
  }

  const segments = [];
  let token = "";
  for (let index = 0; index < pathValue.length; index += 1) {
    const char = pathValue[index];
    if (char === ".") {
      pushPathToken(segments, token);
      token = "";
      continue;
    }

    if (char === "[") {
      pushPathToken(segments, token);
      token = "";
      const closeIndex = pathValue.indexOf("]", index);
      if (closeIndex < 0) {
        return null;
      }
      segments.push(pathValue.slice(index + 1, closeIndex));
      index = closeIndex;
      continue;
    }

    token += char;
  }
  pushPathToken(segments, token);

  return segments.length > 0 ? segments : null;
}

function parseJsonPointer(pointer) {
  if (typeof pointer !== "string" || pointer === "" || pointer === "/") {
    return [];
  }

  if (!pointer.startsWith("/")) {
    return parseDotBracketPath(pointer) ?? [];
  }

  return pointer
    .slice(1)
    .split("/")
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
}

function pushPathToken(segments, token) {
  if (token.length > 0) {
    segments.push(token);
  }
}

function toArrayIndex(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : -1;
}

function escapeJsonPointer(value) {
  return String(value).replaceAll("~", "~0").replaceAll("/", "~1");
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function toValidationResult(issues) {
  return {
    valid: !hasBlockingIssues(issues),
    issues,
  };
}

function hasBlockingIssues(issues) {
  return issues.some((issue) => issue.severity === "error");
}

function isUnknownTypeScriptExtensionError(error) {
  return error instanceof TypeError && String(error.message).includes("Unknown file extension");
}
