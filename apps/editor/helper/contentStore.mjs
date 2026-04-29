import fs from "node:fs/promises";
import path from "node:path";
import { createPathGuard } from "./pathGuard.mjs";

const EVENT_ROOT = "content/events";
const SCHEMA_ROOT = "content/schemas";
const MANIFEST_PATH = "content/events/manifest.json";
const SCHEMA_PATHS = [
  "content/schemas/events.schema.json",
  "content/schemas/events/condition.schema.json",
  "content/schemas/events/effect.schema.json",
  "content/schemas/events/event-graph.schema.json",
  "content/schemas/events/event-definition.schema.json",
  "content/schemas/events/call-template.schema.json",
  "content/schemas/events/handler-registry.schema.json",
];

export async function loadEventEditorLibrary({
  repoRoot = path.resolve(import.meta.dirname, "../../.."),
} = {}) {
  const guard = createPathGuard(repoRoot, [EVENT_ROOT, SCHEMA_ROOT]);
  const manifest = await readJson(guard, MANIFEST_PATH);
  const definitions = [];
  const callTemplates = [];

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
  }

  const schemas = await loadSchemas(guard);

  return {
    definitions,
    call_templates: callTemplates,
    schemas,
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
    data: item,
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
