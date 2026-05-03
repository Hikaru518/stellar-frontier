import fs from "node:fs/promises";
import path from "node:path";
import { createPathGuard } from "./pathGuard.mjs";

const MAP_ROOT = "content/maps";
const MAP_OBJECT_ROOT = "content/map-objects";
const SCHEMA_ROOT = "content/schemas";
const TILESET_REGISTRY_PATH = "content/maps/tilesets/registry.json";
const SCHEMA_PATHS = [
  "content/schemas/maps.schema.json",
  "content/schemas/map-tilesets.schema.json",
  "content/schemas/map-objects.schema.json",
];

export async function loadMapEditorLibrary({
  repoRoot = path.resolve(import.meta.dirname, "../../.."),
} = {}) {
  const guard = createPathGuard(repoRoot, [MAP_ROOT, MAP_OBJECT_ROOT, SCHEMA_ROOT]);
  const [maps, tilesetRegistry, mapObjects, schemas] = await Promise.all([
    loadMaps(guard),
    readJson(guard, TILESET_REGISTRY_PATH),
    loadMapObjects(guard),
    loadSchemas(guard),
  ]);

  return {
    maps,
    tileset_registry: tilesetRegistry,
    map_objects: mapObjects,
    schemas,
  };
}

async function loadMaps(guard) {
  const mapPaths = await listJsonFiles(guard, MAP_ROOT, { recursive: false });
  const maps = [];

  for (const filePath of mapPaths) {
    const data = await readJson(guard, filePath);
    maps.push({
      id: data.id ?? path.posix.basename(filePath, ".json"),
      file_path: filePath,
      data,
    });
  }

  return maps.sort((left, right) => left.file_path.localeCompare(right.file_path));
}

async function loadMapObjects(guard) {
  const objectPaths = await listJsonFiles(guard, MAP_OBJECT_ROOT, { recursive: false });
  const mapObjects = [];

  for (const filePath of objectPaths) {
    const content = await readJson(guard, filePath);
    for (const [index, definition] of (content.map_objects ?? []).entries()) {
      mapObjects.push({
        id: definition.id,
        name: definition.name,
        kind: definition.kind,
        visibility: definition.visibility,
        file_path: filePath,
        json_path: `/map_objects/${index}`,
        data: definition,
      });
    }
  }

  return mapObjects.sort((left, right) => left.id.localeCompare(right.id));
}

async function loadSchemas(guard) {
  const schemas = {};
  for (const schemaPath of SCHEMA_PATHS) {
    schemas[schemaPath] = await readJson(guard, schemaPath);
  }
  return schemas;
}

async function listJsonFiles(guard, relativeDirectory, { recursive }) {
  const absoluteDirectory = guard.resolveAllowedPath(relativeDirectory);
  const entries = await fs.readdir(absoluteDirectory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(relativePath);
      continue;
    }

    if (recursive && entry.isDirectory()) {
      files.push(...(await listJsonFiles(guard, relativePath, { recursive })));
    }
  }

  return files.sort();
}

async function readJson(guard, relativePath) {
  const absolutePath = guard.resolveAllowedPath(relativePath);
  return JSON.parse(await fs.readFile(absolutePath, "utf8"));
}
