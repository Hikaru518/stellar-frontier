import fs from "node:fs/promises";
import path from "node:path";
import { createPathGuard } from "./pathGuard.mjs";

const EVENT_ROOT = "content/events";
const MANIFEST_PATH = "content/events/manifest.json";
const DEFINITIONS_DIR = "content/events/definitions";
const CALL_TEMPLATES_DIR = "content/events/call_templates";
const MANIFEST_SCHEMA_VERSION = "event-manifest.v1";
const DOMAIN_ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

export class EventManifestStoreError extends Error {
  constructor(code, message, { status = 400, details = {} } = {}) {
    super(message);
    this.name = "EventManifestStoreError";
    this.code = code;
    this.status = status;
    this.statusCode = status;
    this.details = details;
  }
}

export function createEventManifestStore({
  repoRoot = path.resolve(import.meta.dirname, "../../.."),
} = {}) {
  const guard = createPathGuard(repoRoot, [EVENT_ROOT]);

  async function loadManifest() {
    return readJson(guard, MANIFEST_PATH);
  }

  async function loadDomainSummaries({ manifest } = {}) {
    return buildEventDomainSummaries(guard, manifest ?? (await loadManifest()));
  }

  async function createDomain(domainId) {
    assertValidDomainId(domainId);

    const manifest = await loadManifest();
    assertManifestDomainsArray(manifest);

    if (manifest.domains.some((domain) => domain?.id === domainId)) {
      throw new EventManifestStoreError("duplicate_domain_id", `Event domain already exists: ${domainId}`, {
        status: 409,
        details: { domain_id: domainId },
      });
    }

    const domainEntry = createManifestDomainEntry(domainId);
    const definitionsFilePath = eventRelativePath(domainEntry.definitions);
    const callTemplatesFilePath = eventRelativePath(domainEntry.call_templates);
    const writtenFiles = [];

    await assertFilesDoNotExist(guard, [definitionsFilePath, callTemplatesFilePath]);

    await writeJsonNewFile(guard, definitionsFilePath, { event_definitions: [] });
    writtenFiles.push(definitionsFilePath);
    await writeJsonNewFile(guard, callTemplatesFilePath, { call_templates: [] });
    writtenFiles.push(callTemplatesFilePath);

    manifest.domains.push(domainEntry);
    await writeJson(guard, MANIFEST_PATH, manifest);
    writtenFiles.push(MANIFEST_PATH);

    const validation = await validateManifest();
    const domains = await loadDomainSummaries({ manifest });

    return {
      created: true,
      domain: domains.find((domain) => domain.id === domainId) ?? null,
      written_files: writtenFiles,
      issues: validation.issues,
    };
  }

  async function validateManifest() {
    return validateEventManifestWithGuard(guard);
  }

  return {
    loadManifest,
    loadDomainSummaries,
    createDomain,
    validateManifest,
  };
}

export async function loadEventManifest(options = {}) {
  return createEventManifestStore(options).loadManifest();
}

export async function loadEventDomainSummaries(options = {}) {
  return createEventManifestStore(options).loadDomainSummaries();
}

export async function createEventDomain({ repoRoot, domainId } = {}) {
  return createEventManifestStore({ repoRoot }).createDomain(domainId);
}

export async function validateEventManifest(options = {}) {
  return createEventManifestStore(options).validateManifest();
}

export function isValidEventDomainId(domainId) {
  return typeof domainId === "string" && DOMAIN_ID_PATTERN.test(domainId);
}

export async function buildEventDomainSummaries(guard, manifest) {
  assertManifestDomainsArray(manifest);

  const summaries = [];
  for (const [index, domainEntry] of manifest.domains.entries()) {
    const definitionsFilePath = eventRelativePath(domainEntry.definitions);
    const callTemplatesFilePath = eventRelativePath(domainEntry.call_templates);
    const presetsFilePath = typeof domainEntry.presets === "string" ? eventRelativePath(domainEntry.presets) : null;
    const definitions = await readJson(guard, definitionsFilePath);
    const callTemplates = await readJson(guard, callTemplatesFilePath);
    const presets = presetsFilePath ? await readJson(guard, presetsFilePath) : null;

    summaries.push({
      id: domainEntry.id,
      manifest_path: MANIFEST_PATH,
      manifest_json_path: `/domains/${index}`,
      definitions_file_path: definitionsFilePath,
      call_templates_file_path: callTemplatesFilePath,
      presets_file_path: presetsFilePath,
      definition_count: countCollection(definitions, "event_definitions"),
      call_template_count: countCollection(callTemplates, "call_templates"),
      preset_count: presets ? countCollection(presets, "presets") : 0,
      has_presets: Boolean(presetsFilePath),
      editable: true,
    });
  }

  return summaries;
}

async function validateEventManifestWithGuard(guard) {
  const issues = [];
  let manifest;

  try {
    manifest = await readJson(guard, MANIFEST_PATH);
  } catch (error) {
    issues.push(issue("missing_manifest", `Missing or unreadable event manifest: ${MANIFEST_PATH}`, { file_path: MANIFEST_PATH }));
    return { valid: false, issues };
  }

  if (manifest?.schema_version !== MANIFEST_SCHEMA_VERSION) {
    issues.push(
      issue("invalid_manifest_schema_version", `Event manifest schema_version must be ${MANIFEST_SCHEMA_VERSION}`, {
        file_path: MANIFEST_PATH,
        json_path: "/schema_version",
      }),
    );
  }

  if (!Array.isArray(manifest?.domains)) {
    issues.push(
      issue("invalid_manifest_domains", "Event manifest domains must be an array", {
        file_path: MANIFEST_PATH,
        json_path: "/domains",
      }),
    );
    return { valid: false, issues };
  }

  const domainIds = new Set();
  const registeredDefinitions = new Set();
  const registeredCallTemplates = new Set();

  for (const [index, domainEntry] of manifest.domains.entries()) {
    const jsonPath = `/domains/${index}`;
    if (!domainEntry || typeof domainEntry !== "object") {
      issues.push(issue("invalid_manifest_domain_entry", "Event manifest domain entry must be an object", { file_path: MANIFEST_PATH, json_path }));
      continue;
    }

    if (!isValidEventDomainId(domainEntry.id)) {
      issues.push(
        issue("invalid_domain_id", `Invalid event domain id: ${String(domainEntry.id)}`, {
          file_path: MANIFEST_PATH,
          json_path: `${jsonPath}/id`,
          domain_id: domainEntry.id,
        }),
      );
    } else if (domainIds.has(domainEntry.id)) {
      issues.push(
        issue("duplicate_domain_id", `Duplicate event domain id: ${domainEntry.id}`, {
          file_path: MANIFEST_PATH,
          json_path: `${jsonPath}/id`,
          domain_id: domainEntry.id,
        }),
      );
    }
    domainIds.add(domainEntry.id);

    const definitionsPath = validateManifestAssetPath(domainEntry, "definitions", "definitions", jsonPath, issues);
    const callTemplatesPath = validateManifestAssetPath(domainEntry, "call_templates", "call_templates", jsonPath, issues);
    const presetsPath =
      domainEntry.presets == null
        ? null
        : validateManifestAssetPath(domainEntry, "presets", "presets", jsonPath, issues, { required: false });

    if (definitionsPath) {
      const filePath = eventRelativePath(definitionsPath);
      registeredDefinitions.add(filePath);
      await validateManifestFileExists(guard, filePath, issues);
    }

    if (callTemplatesPath) {
      const filePath = eventRelativePath(callTemplatesPath);
      registeredCallTemplates.add(filePath);
      await validateManifestFileExists(guard, filePath, issues);
    }

    if (presetsPath) {
      await validateManifestFileExists(guard, eventRelativePath(presetsPath), issues);
    }
  }

  await validateNoUnregisteredFiles(guard, DEFINITIONS_DIR, registeredDefinitions, issues);
  await validateNoUnregisteredFiles(guard, CALL_TEMPLATES_DIR, registeredCallTemplates, issues);

  return {
    valid: issues.length === 0,
    issues,
  };
}

function validateManifestAssetPath(domainEntry, fieldName, expectedDirectory, domainJsonPath, issues, options = { required: true }) {
  const value = domainEntry[fieldName];
  const jsonPath = `${domainJsonPath}/${fieldName}`;

  if (typeof value !== "string" || value.length === 0) {
    if (options.required) {
      issues.push(
        issue("missing_manifest_path", `Missing ${fieldName} path for event domain ${String(domainEntry.id)}`, {
          file_path: MANIFEST_PATH,
          json_path: jsonPath,
          domain_id: domainEntry.id,
        }),
      );
    }
    return null;
  }

  if (
    !value.endsWith(".json") ||
    path.posix.isAbsolute(value) ||
    value.includes("\\") ||
    value.split("/").includes("..") ||
    path.posix.normalize(value) !== value ||
    !value.startsWith(`${expectedDirectory}/`)
  ) {
    issues.push(
      issue("invalid_manifest_path", `Invalid ${fieldName} path for event domain ${String(domainEntry.id)}: ${value}`, {
        file_path: MANIFEST_PATH,
        json_path,
        domain_id: domainEntry.id,
      }),
    );
    return null;
  }

  return value;
}

async function validateManifestFileExists(guard, filePath, issues) {
  if (!(await fileExists(guard, filePath))) {
    issues.push(issue("missing_manifest_file", `Missing event file listed in manifest: ${filePath}`, { file_path: filePath }));
  }
}

async function validateNoUnregisteredFiles(guard, relativeDirectory, registeredFiles, issues) {
  for (const filePath of await listJsonFiles(guard, relativeDirectory)) {
    if (!registeredFiles.has(filePath)) {
      issues.push(issue("unregistered_domain_file", `Unregistered event domain file: ${filePath}`, { file_path: filePath }));
    }
  }
}

async function assertFilesDoNotExist(guard, filePaths) {
  for (const filePath of filePaths) {
    if (await fileExists(guard, filePath)) {
      throw new EventManifestStoreError("file_exists", `Event domain target file already exists: ${filePath}`, {
        status: 409,
        details: { file_path: filePath },
      });
    }
  }
}

function assertValidDomainId(domainId) {
  if (!isValidEventDomainId(domainId)) {
    throw new EventManifestStoreError("invalid_domain_id", "Event domain id must be lowercase and filename-safe.", {
      status: 400,
      details: { domain_id: domainId },
    });
  }
}

function assertManifestDomainsArray(manifest) {
  if (!Array.isArray(manifest?.domains)) {
    throw new EventManifestStoreError("invalid_manifest", "Event manifest domains must be an array.", {
      status: 500,
      details: { file_path: MANIFEST_PATH },
    });
  }
}

function createManifestDomainEntry(domainId) {
  return {
    id: domainId,
    definitions: `definitions/${domainId}.json`,
    call_templates: `call_templates/${domainId}.json`,
    presets: null,
  };
}

async function listJsonFiles(guard, relativeDirectory) {
  const absoluteDirectory = guard.resolveAllowedPath(relativeDirectory);
  let entries;

  try {
    entries = await fs.readdir(absoluteDirectory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.posix.join(relativeDirectory, entry.name))
    .sort();
}

async function fileExists(guard, relativePath) {
  const absolutePath = guard.resolveAllowedPath(relativePath);
  try {
    await fs.access(absolutePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function readJson(guard, relativePath) {
  const absolutePath = guard.resolveAllowedPath(relativePath);
  return JSON.parse(await fs.readFile(absolutePath, "utf8"));
}

async function writeJson(guard, relativePath, value) {
  const absolutePath = guard.resolveAllowedPath(relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, formatJson(value), "utf8");
}

async function writeJsonNewFile(guard, relativePath, value) {
  const absolutePath = guard.resolveAllowedPath(relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, formatJson(value), { encoding: "utf8", flag: "wx" });
}

function formatJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function countCollection(content, collectionName) {
  return Array.isArray(content?.[collectionName]) ? content[collectionName].length : 0;
}

function eventRelativePath(relativePath) {
  return path.posix.join(EVENT_ROOT, relativePath);
}

function issue(code, message, details = {}) {
  return {
    code,
    message,
    ...details,
  };
}
