import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createPathGuard } from "./pathGuard.mjs";

export const EVENT_DRAFT_SCHEMA_VERSION = "event-editor-draft-v1";

const EVENT_ROOT = "content/events";
const MANIFEST_PATH = "content/events/manifest.json";
const DRAFT_ROOT = "content/events/drafts";
const DRAFT_ARCHIVE_ROOT = "content/events/drafts/archive";
const SAFE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

export class EventDraftStoreError extends Error {
  constructor(code, message, { status = 400, details = {} } = {}) {
    super(message);
    this.name = "EventDraftStoreError";
    this.code = code;
    this.status = status;
    this.statusCode = status;
    this.details = details;
  }
}

export function createEventDraftStore({
  repoRoot = path.resolve(import.meta.dirname, "../../.."),
  now = () => new Date(),
} = {}) {
  const guard = createPathGuard(repoRoot, [EVENT_ROOT]);

  async function createDraft(request = {}) {
    if (request?.mode === "new") {
      return createNewDraft(request);
    }

    if (request?.mode === "edit_existing") {
      return createEditExistingDraft(request);
    }

    throw new EventDraftStoreError("invalid_draft_mode", "Draft mode must be new or edit_existing.", {
      details: { mode: request?.mode },
    });
  }

  async function loadDraft(draftId, { includeArchived = false } = {}) {
    assertValidDraftId(draftId);

    const activePath = activeDraftPath(draftId);
    if (await fileExists(guard, activePath)) {
      return readJson(guard, activePath);
    }

    if (includeArchived) {
      const archivedPath = archivedDraftPath(draftId);
      if (await fileExists(guard, archivedPath)) {
        return readJson(guard, archivedPath);
      }
    }

    throw new EventDraftStoreError("draft_not_found", `Event draft not found: ${draftId}`, {
      status: 404,
      details: { draft_id: draftId },
    });
  }

  async function loadActiveDraft(draftId) {
    const filePath = activeDraftPath(draftId);
    if (await fileExists(guard, filePath)) {
      return readJson(guard, filePath);
    }

    throw new EventDraftStoreError("draft_not_found", `Active event draft not found: ${draftId}`, {
      status: 404,
      details: { draft_id: draftId, file_path: filePath },
    });
  }

  async function saveDraft({ draftId, draft, expectedDraftHash = null } = {}) {
    assertValidDraftId(draftId);
    assertJsonValue(draft, "/draft");

    const currentDraft = await loadActiveDraft(draftId);
    const currentDraftHash = computeEventDraftHash(currentDraft);

    if (expectedDraftHash != null && expectedDraftHash !== currentDraftHash) {
      throw new EventDraftStoreError("draft_hash_conflict", "Draft has changed on disk.", {
        status: 409,
        details: {
          draft_id: draftId,
          expected_draft_hash: expectedDraftHash,
          actual_draft_hash: currentDraftHash,
        },
      });
    }

    assertDraftCanReplaceCurrentDraft(draftId, draft, currentDraft);

    const nextDraft = {
      ...cloneJson(draft),
      schema_version: EVENT_DRAFT_SCHEMA_VERSION,
      draft_id: currentDraft.draft_id,
      mode: currentDraft.mode,
      status: "active",
      source: cloneJson(currentDraft.source),
      target: cloneJson(currentDraft.target),
      hashes: sourceHashesFromDraft(currentDraft),
      created_at: currentDraft.created_at,
      updated_at: currentIsoTimestamp(),
      published_at: null,
      published_files: [],
    };
    const savedDraft = withGeneratedDraftHash(nextDraft);
    const filePath = activeDraftPath(draftId);

    await writeJson(guard, filePath, savedDraft);

    return {
      saved: true,
      file_path: filePath,
      draft_hash: savedDraft.hashes.draft,
      issues: [],
      draft: savedDraft,
    };
  }

  async function listActiveDraftSummaries() {
    const draftPaths = await listJsonFiles(guard, DRAFT_ROOT);
    const summaries = [];

    for (const filePath of draftPaths) {
      const draft = await readJson(guard, filePath);
      if (draft?.status !== "active") {
        continue;
      }
      summaries.push(toDraftSummary(draft, filePath));
    }

    return summaries.sort((left, right) => {
      const updated = String(right.updated_at ?? "").localeCompare(String(left.updated_at ?? ""));
      return updated === 0 ? String(left.draft_id).localeCompare(String(right.draft_id)) : updated;
    });
  }

  async function archiveDraft({ draftId, publishedAt = null, publishedFiles = [] } = {}) {
    assertValidDraftId(draftId);
    assertPublishedFiles(publishedFiles);

    const activeFilePath = activeDraftPath(draftId);
    const archivedFilePath = archivedDraftPath(draftId);
    const activeDraft = await loadActiveDraft(draftId);

    if (await fileExists(guard, archivedFilePath)) {
      throw new EventDraftStoreError("archive_draft_exists", `Archived draft already exists: ${draftId}`, {
        status: 409,
        details: { draft_id: draftId, file_path: archivedFilePath },
      });
    }

    const archiveTimestamp = publishedAt ?? currentIsoTimestamp();
    if (typeof archiveTimestamp !== "string" || Number.isNaN(Date.parse(archiveTimestamp))) {
      throw new EventDraftStoreError("invalid_published_at", "publishedAt must be an ISO timestamp string.", {
        details: { published_at: publishedAt },
      });
    }

    const archivedDraft = withGeneratedDraftHash({
      ...activeDraft,
      status: "archived",
      updated_at: archiveTimestamp,
      published_at: archiveTimestamp,
      published_files: [...publishedFiles],
    });

    await writeJsonNewFile(guard, archivedFilePath, archivedDraft);
    await fs.unlink(guard.resolveAllowedPath(activeFilePath));

    return {
      archived: true,
      active_file_path: activeFilePath,
      archived_file_path: archivedFilePath,
      draft: archivedDraft,
    };
  }

  async function createNewDraft(request) {
    const domain = request.target_domain;
    const definitionId = request.definition_id;
    assertValidDomainId(domain);
    assertValidDefinitionId(definitionId);

    const { manifest } = await loadManifestWithText(guard);
    const domainEntry = findManifestDomain(manifest, domain);
    const target = buildDraftTarget(domainEntry, domain, definitionId);
    const createdAt = currentDate();
    const draftId = createDraftId(definitionId, createdAt);
    const draft = withGeneratedDraftHash({
      schema_version: EVENT_DRAFT_SCHEMA_VERSION,
      draft_id: draftId,
      mode: "new",
      status: "active",
      source: null,
      target,
      working_definition: createNewWorkingDefinition({
        domain,
        definitionId,
        title: request.title,
        summary: request.summary,
      }),
      working_call_templates: [],
      editor_state: createDefaultEditorState(),
      hashes: {
        source_definition_file: null,
        source_call_template_file: null,
        source_manifest: null,
        draft: null,
      },
      created_at: createdAt.toISOString(),
      updated_at: createdAt.toISOString(),
      published_at: null,
      published_files: [],
    });
    const filePath = activeDraftPath(draftId);

    await writeJsonNewFile(guard, filePath, draft);

    return { draft, file_path: filePath };
  }

  async function createEditExistingDraft(request) {
    const domain = request.domain;
    const definitionId = request.definition_id;
    assertValidDomainId(domain);
    assertValidDefinitionId(definitionId);

    const { manifest, text: manifestText } = await loadManifestWithText(guard);
    const domainEntry = findManifestDomain(manifest, domain);
    const target = buildDraftTarget(domainEntry, domain, definitionId);
    const definitionFilePath = target.definition_file_path;
    const callTemplateFilePath = target.call_template_file_path;
    const definitionFileText = await readText(guard, definitionFilePath);
    const callTemplateFileText = await readText(guard, callTemplateFilePath);
    const definitionFile = JSON.parse(definitionFileText);
    const callTemplateFile = JSON.parse(callTemplateFileText);
    const eventDefinitions = Array.isArray(definitionFile?.event_definitions) ? definitionFile.event_definitions : [];
    const definitionIndex = eventDefinitions.findIndex((definition) => definition?.id === definitionId);

    if (definitionIndex < 0) {
      throw new EventDraftStoreError("unknown_definition", `Event definition not found: ${definitionId}`, {
        status: 404,
        details: { domain, definition_id: definitionId },
      });
    }

    const callTemplates = Array.isArray(callTemplateFile?.call_templates) ? callTemplateFile.call_templates : [];
    const matchingCallTemplates = callTemplates
      .map((callTemplate, index) => ({ callTemplate, index }))
      .filter(({ callTemplate }) => callTemplate?.event_definition_id === definitionId);
    const createdAt = currentDate();
    const draftId = createDraftId(definitionId, createdAt);
    const draft = withGeneratedDraftHash({
      schema_version: EVENT_DRAFT_SCHEMA_VERSION,
      draft_id: draftId,
      mode: "edit_existing",
      status: "active",
      source: {
        definition_id: definitionId,
        domain,
        definition_file_path: definitionFilePath,
        definition_json_path: `/event_definitions/${definitionIndex}`,
        call_template_file_path: callTemplateFilePath,
        call_template_ids: matchingCallTemplates.map(({ callTemplate }) => callTemplate.id),
        call_template_json_paths: matchingCallTemplates.map(({ index }) => `/call_templates/${index}`),
        manifest_file_path: MANIFEST_PATH,
      },
      target,
      working_definition: cloneJson(eventDefinitions[definitionIndex]),
      working_call_templates: matchingCallTemplates.map(({ callTemplate }) => cloneJson(callTemplate)),
      editor_state: createDefaultEditorState(),
      hashes: {
        source_definition_file: sha256(definitionFileText),
        source_call_template_file: sha256(callTemplateFileText),
        source_manifest: sha256(manifestText),
        draft: null,
      },
      created_at: createdAt.toISOString(),
      updated_at: createdAt.toISOString(),
      published_at: null,
      published_files: [],
    });
    const filePath = activeDraftPath(draftId);

    await writeJsonNewFile(guard, filePath, draft);

    return { draft, file_path: filePath };
  }

  function currentDate() {
    const value = now();
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new EventDraftStoreError("invalid_clock", "Draft store clock returned an invalid date.", {
        status: 500,
      });
    }
    return date;
  }

  function currentIsoTimestamp() {
    return currentDate().toISOString();
  }

  return {
    createDraft,
    loadDraft,
    saveDraft,
    listActiveDraftSummaries,
    archiveDraft,
  };
}

export async function createEventDraft({ repoRoot, now, ...request } = {}) {
  return createEventDraftStore({ repoRoot, now }).createDraft(request);
}

export async function loadEventDraft({ repoRoot, now, draftId, includeArchived = false } = {}) {
  return createEventDraftStore({ repoRoot, now }).loadDraft(draftId, { includeArchived });
}

export async function saveEventDraft({ repoRoot, now, draftId, draft, expectedDraftHash = null } = {}) {
  return createEventDraftStore({ repoRoot, now }).saveDraft({ draftId, draft, expectedDraftHash });
}

export async function listActiveEventDraftSummaries(options = {}) {
  return createEventDraftStore(options).listActiveDraftSummaries();
}

export async function archiveEventDraft({ repoRoot, now, draftId, publishedAt = null, publishedFiles = [] } = {}) {
  return createEventDraftStore({ repoRoot, now }).archiveDraft({ draftId, publishedAt, publishedFiles });
}

export function isValidEventDraftId(draftId) {
  return isSafeId(draftId);
}

export function computeEventDraftHash(draft) {
  const hashableDraft = cloneJson(draft);
  hashableDraft.hashes = {
    ...(isRecord(hashableDraft.hashes) ? hashableDraft.hashes : {}),
    draft: null,
  };
  return sha256(stableStringify(hashableDraft));
}

function assertDraftCanReplaceCurrentDraft(draftId, draft, currentDraft) {
  if (!isRecord(draft)) {
    throw new EventDraftStoreError("invalid_draft_envelope", "Draft envelope must be an object.", {
      details: { draft_id: draftId },
    });
  }

  if (draft.schema_version !== EVENT_DRAFT_SCHEMA_VERSION) {
    throw new EventDraftStoreError("invalid_draft_schema_version", `Draft schema_version must be ${EVENT_DRAFT_SCHEMA_VERSION}.`, {
      details: { draft_id: draftId, schema_version: draft.schema_version },
    });
  }

  if (draft.draft_id !== currentDraft.draft_id || draft.draft_id !== draftId) {
    throw new EventDraftStoreError("immutable_draft_id_changed", "Draft id cannot be changed after creation.", {
      details: { draft_id: draftId, current_draft_id: currentDraft.draft_id, received_draft_id: draft.draft_id },
    });
  }

  if (draft.mode !== currentDraft.mode) {
    throw new EventDraftStoreError("immutable_mode_changed", "Draft mode cannot be changed after creation.", {
      details: { draft_id: draftId, mode: draft.mode },
    });
  }

  if (draft.status !== "active") {
    throw new EventDraftStoreError("invalid_draft_status", "Only active drafts can be saved.", {
      details: { draft_id: draftId, status: draft.status },
    });
  }

  if (!jsonDeepEqual(draft.target, currentDraft.target)) {
    throw new EventDraftStoreError("immutable_target_changed", "Draft target cannot be changed after creation.", {
      details: { draft_id: draftId },
    });
  }

  if (!jsonDeepEqual(draft.source, currentDraft.source)) {
    throw new EventDraftStoreError("immutable_source_changed", "Draft source refs cannot be changed after creation.", {
      details: { draft_id: draftId },
    });
  }

  if (draft.mode === "new" && draft.source !== null) {
    throw new EventDraftStoreError("invalid_draft_source", "New event drafts must not include source refs.", {
      details: { draft_id: draftId },
    });
  }

  if (draft.mode === "edit_existing" && !isRecord(draft.source)) {
    throw new EventDraftStoreError("invalid_draft_source", "Edit-existing drafts must include source refs.", {
      details: { draft_id: draftId },
    });
  }

  if (!isRecord(draft.working_definition)) {
    throw new EventDraftStoreError("invalid_working_definition", "working_definition must be an object.", {
      details: { draft_id: draftId },
    });
  }

  if (!Array.isArray(draft.working_call_templates)) {
    throw new EventDraftStoreError("invalid_working_call_templates", "working_call_templates must be an array.", {
      details: { draft_id: draftId },
    });
  }

  if (!isRecord(draft.editor_state)) {
    throw new EventDraftStoreError("invalid_editor_state", "editor_state must be an object.", {
      details: { draft_id: draftId },
    });
  }

  assertIncomingSourceHashesMatchCurrentDraft(draft, currentDraft);
}

function assertIncomingSourceHashesMatchCurrentDraft(draft, currentDraft) {
  const draftHashes = draft.hashes;
  const currentHashes = currentDraft.hashes;
  if (!isRecord(draftHashes) || !isRecord(currentHashes)) {
    throw new EventDraftStoreError("invalid_draft_hashes", "Draft hashes must be an object.");
  }

  for (const fieldName of ["source_definition_file", "source_call_template_file", "source_manifest"]) {
    if (draftHashes[fieldName] !== currentHashes[fieldName]) {
      throw new EventDraftStoreError("immutable_hashes_changed", "Source hashes cannot be changed by draft save.", {
        details: { field: fieldName },
      });
    }
  }
}

function sourceHashesFromDraft(draft) {
  return {
    source_definition_file: draft.hashes?.source_definition_file ?? null,
    source_call_template_file: draft.hashes?.source_call_template_file ?? null,
    source_manifest: draft.hashes?.source_manifest ?? null,
    draft: null,
  };
}

function withGeneratedDraftHash(draft) {
  const nextDraft = cloneJson(draft);
  nextDraft.hashes = {
    ...(isRecord(nextDraft.hashes) ? nextDraft.hashes : {}),
    draft: null,
  };
  nextDraft.hashes.draft = computeEventDraftHash(nextDraft);
  return nextDraft;
}

function toDraftSummary(draft, filePath) {
  const workingDefinition = isRecord(draft.working_definition) ? draft.working_definition : {};
  const target = isRecord(draft.target) ? draft.target : {};

  return {
    draft_id: draft.draft_id,
    mode: draft.mode,
    status: draft.status,
    file_path: filePath,
    domain: target.domain ?? null,
    definition_id: target.definition_id ?? null,
    target: cloneJson(draft.target),
    source: cloneJson(draft.source),
    title: typeof workingDefinition.title === "string" ? workingDefinition.title : null,
    summary: typeof workingDefinition.summary === "string" ? workingDefinition.summary : null,
    active_step: typeof draft.editor_state?.active_step === "string" ? draft.editor_state.active_step : null,
    created_at: draft.created_at ?? null,
    updated_at: draft.updated_at ?? null,
    published_at: draft.published_at ?? null,
    draft_hash: computeEventDraftHash(draft),
  };
}

async function loadManifestWithText(guard) {
  const text = await readText(guard, MANIFEST_PATH);
  return {
    manifest: JSON.parse(text),
    text,
  };
}

function findManifestDomain(manifest, domain) {
  if (!Array.isArray(manifest?.domains)) {
    throw new EventDraftStoreError("invalid_manifest", "Event manifest domains must be an array.", {
      status: 500,
      details: { file_path: MANIFEST_PATH },
    });
  }

  const domainEntry = manifest.domains.find((candidate) => candidate?.id === domain);
  if (!domainEntry) {
    throw new EventDraftStoreError("unknown_domain", `Event domain not found: ${domain}`, {
      status: 404,
      details: { domain },
    });
  }
  return domainEntry;
}

function buildDraftTarget(domainEntry, domain, definitionId) {
  const definitionsPath = validateManifestAssetPath(domainEntry, "definitions", "definitions");
  const callTemplatesPath = validateManifestAssetPath(domainEntry, "call_templates", "call_templates");

  return {
    domain,
    definition_id: definitionId,
    definition_file_path: eventRelativePath(definitionsPath),
    call_template_file_path: eventRelativePath(callTemplatesPath),
  };
}

function validateManifestAssetPath(domainEntry, fieldName, expectedDirectory) {
  const value = domainEntry?.[fieldName];
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    !value.endsWith(".json") ||
    path.posix.isAbsolute(value) ||
    value.includes("\\") ||
    value.split("/").includes("..") ||
    path.posix.normalize(value) !== value ||
    !value.startsWith(`${expectedDirectory}/`)
  ) {
    throw new EventDraftStoreError("invalid_manifest_path", `Invalid ${fieldName} path for event domain ${String(domainEntry?.id)}.`, {
      status: 500,
      details: {
        domain_id: domainEntry?.id,
        field: fieldName,
        path: value,
      },
    });
  }
  return value;
}

function createNewWorkingDefinition({ domain, definitionId, title, summary }) {
  const definition = {
    id: definitionId,
    domain,
  };

  if (typeof title === "string") {
    definition.title = title;
  }

  if (typeof summary === "string") {
    definition.summary = summary;
  }

  return definition;
}

function createDefaultEditorState() {
  return {
    active_step: "basic",
    selection: null,
    collapsed_sections: [],
  };
}

function createDraftId(definitionId, date) {
  return `${definitionId}_${formatDraftTimestamp(date)}`;
}

function formatDraftTimestamp(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    "_",
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
  ].join("");
}

function assertValidDraftId(draftId) {
  if (!isSafeId(draftId)) {
    throw new EventDraftStoreError("invalid_draft_id", "Draft id must be lowercase and filename-safe.", {
      details: { draft_id: draftId },
    });
  }
}

function assertValidDomainId(domainId) {
  if (!isSafeId(domainId)) {
    throw new EventDraftStoreError("invalid_domain_id", "Event domain id must be lowercase and filename-safe.", {
      details: { domain_id: domainId },
    });
  }
}

function assertValidDefinitionId(definitionId) {
  if (!isSafeId(definitionId)) {
    throw new EventDraftStoreError("invalid_definition_id", "Event definition id must be lowercase and filename-safe.", {
      details: { definition_id: definitionId },
    });
  }
}

function assertPublishedFiles(publishedFiles) {
  if (!Array.isArray(publishedFiles)) {
    throw new EventDraftStoreError("invalid_published_files", "publishedFiles must be an array of repository-relative event paths.");
  }

  for (const filePath of publishedFiles) {
    if (typeof filePath !== "string" || path.posix.isAbsolute(filePath) || filePath.includes("\\") || filePath.split("/").includes("..")) {
      throw new EventDraftStoreError("invalid_published_file_path", "Published file paths must be repository-relative event paths.", {
        details: { file_path: filePath },
      });
    }
  }
}

function assertJsonValue(value, jsonPath) {
  if (value === null) {
    return;
  }

  const valueType = typeof value;
  if (valueType === "string" || valueType === "boolean") {
    return;
  }

  if (valueType === "number") {
    if (!Number.isFinite(value)) {
      throw new EventDraftStoreError("invalid_json_value", "Draft envelope contains a non-finite number.", {
        details: { json_path: jsonPath },
      });
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonValue(item, `${jsonPath}/${index}`));
    return;
  }

  if (valueType === "object") {
    if (!isRecord(value)) {
      throw new EventDraftStoreError("invalid_json_value", "Draft envelope must contain only plain JSON objects.", {
        details: { json_path: jsonPath },
      });
    }
    for (const [key, child] of Object.entries(value)) {
      assertJsonValue(child, `${jsonPath}/${escapeJsonPointerToken(key)}`);
    }
    return;
  }

  throw new EventDraftStoreError("invalid_json_value", "Draft envelope must be JSON serializable.", {
    details: { json_path: jsonPath },
  });
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
  return JSON.parse(await readText(guard, relativePath));
}

async function readText(guard, relativePath) {
  const absolutePath = guard.resolveAllowedPath(relativePath);
  return fs.readFile(absolutePath, "utf8");
}

async function writeJson(guard, relativePath, value) {
  const absolutePath = guard.resolveAllowedPath(relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, formatJson(value), "utf8");
}

async function writeJsonNewFile(guard, relativePath, value) {
  const absolutePath = guard.resolveAllowedPath(relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  try {
    await fs.writeFile(absolutePath, formatJson(value), { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new EventDraftStoreError("draft_file_exists", `Draft file already exists: ${relativePath}`, {
        status: 409,
        details: { file_path: relativePath },
      });
    }
    throw error;
  }
}

function activeDraftPath(draftId) {
  return path.posix.join(DRAFT_ROOT, `${draftId}.json`);
}

function archivedDraftPath(draftId) {
  return path.posix.join(DRAFT_ARCHIVE_ROOT, `${draftId}.json`);
}

function eventRelativePath(relativePath) {
  return path.posix.join(EVENT_ROOT, relativePath);
}

function formatJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function isSafeId(value) {
  return typeof value === "string" && SAFE_ID_PATTERN.test(value);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function jsonDeepEqual(left, right) {
  return stableStringify(left) === stableStringify(right);
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function escapeJsonPointerToken(token) {
  return token.replaceAll("~", "~0").replaceAll("/", "~1");
}
