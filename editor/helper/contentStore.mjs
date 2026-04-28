import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createPathGuard } from "./pathGuard.mjs";
import { buildValidationReport } from "./validationGate.mjs";

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

export async function loadEventEditorLibrary({ repoRoot = path.resolve(import.meta.dirname, "../..") } = {}) {
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
    domains: (manifest.domains ?? []).map((domain) => domain.id),
    definitions,
    call_templates: callTemplates,
    handlers: handlerRegistry.handlers ?? [],
    presets,
    legacy_events: legacyEvents,
    schemas,
    validation: await buildValidationReport(rawLibrary, { repoRoot }),
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

function hashJson(value) {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}
