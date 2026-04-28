import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createPathGuard } from "./pathGuard.mjs";
import { hashJson } from "./hash.mjs";
import { formatJson } from "./jsonFormat.mjs";
import { buildValidationReport, validateContentRoot } from "./validationGate.mjs";

const EVENT_ROOT = "content/events";
const SCHEMA_ROOT = "content/schemas";
const MANIFEST_PATH = "content/events/manifest.json";
const HANDLER_REGISTRY_PATH = "content/events/handler_registry.json";
const LEGACY_EVENTS_PATH = "content/events/events.json";
const SCHEMA_PATHS = [
  "content/schemas/events.schema.json",
  "content/schemas/events/condition.schema.json",
  "content/schemas/events/effect.schema.json",
  "content/schemas/events/event-graph.schema.json",
  "content/schemas/events/event-definition.schema.json",
  "content/schemas/events/call-template.schema.json",
  "content/schemas/events/handler-registry.schema.json",
];
const EDITABLE_ASSET_CONFIGS = {
  event_definition: {
    directoryPath: "content/events/definitions",
    collectionName: "event_definitions",
  },
  call_template: {
    directoryPath: "content/events/call_templates",
    collectionName: "call_templates",
  },
};

export async function loadEventEditorLibrary({
  repoRoot = path.resolve(import.meta.dirname, "../.."),
  sourceRoot = repoRoot,
} = {}) {
  const guard = createPathGuard(repoRoot, [EVENT_ROOT, SCHEMA_ROOT]);
  const manifest = await readJson(guard, MANIFEST_PATH);
  const definitions = [];
  const callTemplates = [];
  const presets = [];

  for (const domainEntry of manifest.domains ?? []) {
    definitions.push(
      ...(await loadDomainAssets(guard, domainEntry, {
        manifestField: "definitions",
        collectionName: "event_definitions",
        assetType: "event_definition",
      })),
    );
    callTemplates.push(
      ...(await loadDomainAssets(guard, domainEntry, {
        manifestField: "call_templates",
        collectionName: "call_templates",
        assetType: "call_template",
      })),
    );

    if (domainEntry.presets) {
      presets.push(
        ...(await loadDomainAssets(guard, domainEntry, {
          manifestField: "presets",
          collectionName: "presets",
          assetType: "preset",
        })),
      );
    }
  }

  const handlerRegistry = await readJson(guard, HANDLER_REGISTRY_PATH);
  const legacyEvents = await loadLegacyEvents(guard);
  const schemas = await loadSchemas(guard);
  const rawLibrary = {
    event_definitions: definitions.map((asset) => asset.data),
    call_templates: callTemplates.map((asset) => asset.data),
    handlers: handlerRegistry.handlers ?? [],
    presets: presets.map((asset) => asset.data),
  };

  return {
    manifest,
    manifest_base_hash: hashJson(manifest),
    domains: (manifest.domains ?? []).map((domain) => domain.id),
    definitions,
    call_templates: callTemplates,
    handlers: handlerRegistry.handlers ?? [],
    presets,
    legacy_events: legacyEvents,
    schemas,
    validation: await buildValidationReport(rawLibrary, { repoRoot: sourceRoot }),
  };
}

export async function validateDraftAsset({ repoRoot = path.resolve(import.meta.dirname, "../.."), sourceRoot = repoRoot, body }) {
  const request = normalizeDraftRequest(body);
  await loadEditableTarget(repoRoot, request);
  const validation = await validateDraftInTempRoot({ repoRoot, sourceRoot, request });

  return {
    statusCode: 200,
    body: {
      status: "validated",
      file_path: request.file_path,
      asset_type: request.asset_type,
      asset_id: request.asset_id,
      validation,
    },
  };
}

export async function saveDraftAsset({ repoRoot = path.resolve(import.meta.dirname, "../.."), sourceRoot = repoRoot, body }) {
  const request = normalizeDraftRequest(body, { requireBaseHash: true });
  const current = await loadEditableTarget(repoRoot, request);

  if (current.baseHash !== request.base_hash) {
    return conflictResponse(request, current.baseHash);
  }

  const validation = await validateDraftInTempRoot({ repoRoot, sourceRoot, request });
  if (!validation.passed) {
    return {
      statusCode: 422,
      body: {
        error: {
          code: "validation_failed",
          message: "Draft did not pass content validation.",
        },
        validation,
      },
    };
  }

  const latest = await loadEditableTarget(repoRoot, request);
  if (latest.baseHash !== request.base_hash) {
    return conflictResponse(request, latest.baseHash);
  }

  latest.document[latest.config.collectionName][latest.index] = request.draft;
  await fs.writeFile(latest.absolutePath, formatJson(latest.document));

  return {
    statusCode: 200,
    body: {
      status: "saved",
      file_path: request.file_path,
      asset_type: request.asset_type,
      asset_id: request.asset_id,
      base_hash: hashJson(request.draft),
      validation,
    },
  };
}

async function loadDomainAssets(guard, domainEntry, { manifestField, collectionName, assetType }) {
  const filePath = eventRelativePath(domainEntry[manifestField]);
  const content = await readJson(guard, filePath);
  const items = content[collectionName] ?? [];

  return items.map((item, index) => ({
    id: item.id,
    domain: item.domain ?? domainEntry.id,
    asset_type: assetType,
    file_path: filePath,
    json_path: `/${collectionName}/${index}`,
    base_hash: hashJson(item),
    data: item,
    editable: true,
  }));
}

async function loadLegacyEvents(guard) {
  const content = await readJson(guard, LEGACY_EVENTS_PATH);
  return (content.events ?? []).map((event, index) => ({
    id: event.eventId ?? event.id,
    domain: "legacy",
    asset_type: "legacy_event",
    file_path: LEGACY_EVENTS_PATH,
    json_path: `/events/${index}`,
    base_hash: hashJson(event),
    data: event,
    editable: false,
  }));
}

async function loadSchemas(guard) {
  const schemas = {};
  for (const schemaPath of SCHEMA_PATHS) {
    schemas[schemaPath] = await readJson(guard, schemaPath);
  }
  return schemas;
}

async function readJson(guard, relativePath) {
  const absolutePath = guard.resolveAllowedPath(relativePath);
  return JSON.parse(await fs.readFile(absolutePath, "utf8"));
}

function eventRelativePath(relativePath) {
  return path.posix.join(EVENT_ROOT, relativePath);
}

function normalizeDraftRequest(body, { requireBaseHash = false } = {}) {
  const request = body && typeof body === "object" ? body : {};
  const draft = request.draft ?? request.data;

  if (request.asset_type !== "event_definition" && request.asset_type !== "call_template") {
    throw helperError(400, "unsupported_asset_type", "Only event_definition and call_template assets can be saved.");
  }
  if (typeof request.asset_id !== "string" || request.asset_id.length === 0) {
    throw helperError(400, "invalid_asset_id", "asset_id must be a non-empty string.");
  }
  if (typeof request.file_path !== "string" || request.file_path.length === 0) {
    throw helperError(400, "invalid_file_path", "file_path must be a non-empty repository-relative string.");
  }
  if (typeof request.json_path !== "string" || request.json_path.length === 0) {
    throw helperError(400, "invalid_json_path", "json_path must be a non-empty JSON pointer.");
  }
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) {
    throw helperError(400, "invalid_draft", "draft must be a JSON object.");
  }
  if (requireBaseHash && (typeof request.base_hash !== "string" || !/^[a-f0-9]{64}$/.test(request.base_hash))) {
    throw helperError(400, "invalid_base_hash", "base_hash must be a sha256 hash.");
  }

  return {
    asset_type: request.asset_type,
    asset_id: request.asset_id,
    file_path: request.file_path,
    json_path: request.json_path,
    base_hash: request.base_hash,
    draft,
  };
}

async function loadEditableTarget(repoRoot, request) {
  const config = EDITABLE_ASSET_CONFIGS[request.asset_type];
  const guard = createPathGuard(repoRoot, [EVENT_ROOT]);
  const absolutePath = guard.resolveAllowedPath(request.file_path);

  if (!request.file_path.startsWith(`${config.directoryPath}/`) || !request.file_path.endsWith(".json")) {
    throw helperError(400, "unsupported_asset_path", `${request.asset_type} assets must stay under ${config.directoryPath}.`);
  }

  const jsonPathMatch = request.json_path.match(/^\/([^/]+)\/(\d+)$/);
  if (!jsonPathMatch || jsonPathMatch[1] !== config.collectionName) {
    throw helperError(400, "unsupported_json_path", `${request.asset_type} json_path must point into ${config.collectionName}.`);
  }

  const document = JSON.parse(await fs.readFile(absolutePath, "utf8"));
  const collection = document[config.collectionName];
  const index = Number(jsonPathMatch[2]);
  const asset = Array.isArray(collection) ? collection[index] : undefined;
  if (!asset) {
    throw helperError(404, "asset_not_found", `Asset not found at ${request.json_path}.`);
  }
  if (asset.id !== request.asset_id) {
    throw helperError(400, "asset_mismatch", `Target asset_id ${request.asset_id} does not match ${asset.id}.`);
  }

  return {
    absolutePath,
    asset,
    baseHash: hashJson(asset),
    config,
    document,
    index,
  };
}

async function validateDraftInTempRoot({ repoRoot, sourceRoot, request }) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "stellar-event-draft-"));
  try {
    await fs.cp(path.join(repoRoot, "content"), path.join(tempRoot, "content"), { recursive: true });
    const target = await loadEditableTarget(tempRoot, request);
    target.document[target.config.collectionName][target.index] = request.draft;
    await fs.writeFile(target.absolutePath, formatJson(target.document));
    return await validateContentRoot({ contentRoot: tempRoot, sourceRoot, target: request });
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

function conflictResponse(request, currentBaseHash) {
  return {
    statusCode: 409,
    body: {
      error: {
        code: "conflict",
        message: "The target asset changed after this draft was created.",
      },
      file_path: request.file_path,
      asset_type: request.asset_type,
      asset_id: request.asset_id,
      current_base_hash: currentBaseHash,
    },
  };
}

function helperError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}
