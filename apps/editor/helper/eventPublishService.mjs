import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createEventDraftStore, computeEventDraftHash } from "./eventDraftStore.mjs";
import { buildEventPublishContent } from "./eventPublishBuilder.mjs";
import { validateEventAssetsForPublish, validateEventManifestForEditor } from "./eventValidation.mjs";
import { createPathGuard } from "./pathGuard.mjs";

const EVENT_ROOT = "content/events";
const MANIFEST_PATH = "content/events/manifest.json";
const HANDLER_REGISTRY_PATH = "content/events/handler_registry.json";
const DRAFT_ARCHIVE_ROOT = "content/events/drafts/archive";

export function createEventPublishService({
  repoRoot = path.resolve(import.meta.dirname, "../../.."),
  now = () => new Date(),
} = {}) {
  const guard = createPathGuard(repoRoot, [EVENT_ROOT]);
  const draftStore = createEventDraftStore({ repoRoot, now });

  async function publishDraft(request = {}) {
    const draftId = request.draftId ?? request.draft_id;
    const expectedDraftHash = request.expectedDraftHash ?? request.expected_draft_hash ?? null;
    const expectedSourceHashes = request.expectedSourceHashes ?? request.expected_source_hashes ?? null;
    const draft = await draftStore.loadDraft(draftId);
    const draftHashIssue = validateExpectedDraftHash({ draft, expectedDraftHash });
    const built = buildEventPublishContent(draft);
    const generated = built.generated ?? null;

    if (!built.valid || !generated) {
      return publishFailure({
        issues: [...(draftHashIssue ? [draftHashIssue] : []), ...(built.issues ?? [])],
        generated,
      });
    }

    const targetDefinitionFilePath = draft.target.definition_file_path;
    const targetCallTemplateFilePath = draft.target.call_template_file_path;
    const currentLibrary = await loadCurrentEventLibrary({
      extraFilePaths: [targetDefinitionFilePath, targetCallTemplateFilePath],
    });
    const targetDomainFiles = getTargetDomainFiles(currentLibrary, {
      definitionFilePath: targetDefinitionFilePath,
      callTemplateFilePath: targetCallTemplateFilePath,
    });
    const composeResult = composeTargetDomainFiles({
      draft,
      generated,
      definitionFile: targetDomainFiles.definitionFile,
      callTemplateFile: targetDomainFiles.callTemplateFile,
    });
    const nextLibrary = replaceTargetDomainFiles(currentLibrary, {
      definitionFilePath: targetDefinitionFilePath,
      callTemplateFilePath: targetCallTemplateFilePath,
      definitionFile: composeResult.definitionFile,
      callTemplateFile: composeResult.callTemplateFile,
    });
    const manifestValidation = await validateEventManifestForEditor({ repoRoot });
    const assetValidation = await validateEventAssetsForPublish({
      repoRoot,
      definitionFile: aggregateDefinitionFile(nextLibrary.definitionFiles),
      callTemplateFile: aggregateCallTemplateFile(nextLibrary.callTemplateFiles),
      handlers: nextLibrary.handlers,
      presets: nextLibrary.presets,
      domains: nextLibrary.domains,
    });
    const sourceHashIssues = validateSourceHashes({
      draft,
      expectedSourceHashes,
      currentLibrary,
    });
    const archiveIssue = await validateArchiveTarget(draft.draft_id);
    const issues = [
      ...(draftHashIssue ? [draftHashIssue] : []),
      ...(built.issues ?? []),
      ...composeResult.issues,
      ...manifestValidation.issues,
      ...assetValidation.issues,
      ...sourceHashIssues,
      ...(archiveIssue ? [archiveIssue] : []),
    ];

    if (hasBlockingIssues(issues)) {
      return publishFailure({ issues, generated });
    }

    const publishedAt = currentIsoTimestamp();
    const writtenFiles = [targetDefinitionFilePath, targetCallTemplateFilePath, MANIFEST_PATH];

    await writeJson(targetDefinitionFilePath, composeResult.definitionFile);
    await writeJson(targetCallTemplateFilePath, composeResult.callTemplateFile);
    await writeJson(MANIFEST_PATH, currentLibrary.manifest);

    const archiveResult = await draftStore.archiveDraft({
      draftId: draft.draft_id,
      publishedAt,
      publishedFiles: writtenFiles,
    });

    return {
      published: true,
      written_files: writtenFiles,
      generated,
      archived_draft_path: archiveResult.archived_file_path,
      issues: [],
    };
  }

  async function loadCurrentEventLibrary({ extraFilePaths = [] } = {}) {
    const manifestFile = await readJsonWithText(MANIFEST_PATH);
    const manifest = manifestFile.json;
    const definitionFiles = [];
    const callTemplateFiles = [];
    const presets = [];

    for (const domainEntry of manifest.domains ?? []) {
      const definitionFilePath = eventRelativePath(domainEntry.definitions);
      const callTemplateFilePath = eventRelativePath(domainEntry.call_templates);

      definitionFiles.push({
        domainId: domainEntry.id,
        filePath: definitionFilePath,
        ...(await readJsonWithText(definitionFilePath)),
      });
      callTemplateFiles.push({
        domainId: domainEntry.id,
        filePath: callTemplateFilePath,
        ...(await readJsonWithText(callTemplateFilePath)),
      });

      if (typeof domainEntry.presets === "string") {
        const presetFile = await readJsonWithText(eventRelativePath(domainEntry.presets));
        presets.push(...(Array.isArray(presetFile.json?.presets) ? presetFile.json.presets : []));
      }
    }

    const handlerRegistry = await readJsonWithText(HANDLER_REGISTRY_PATH);
    await includeExtraDomainFiles({
      files: definitionFiles,
      filePaths: extraFilePaths,
      pathSegment: "/definitions/",
      collectionName: "event_definitions",
    });
    await includeExtraDomainFiles({
      files: callTemplateFiles,
      filePaths: extraFilePaths,
      pathSegment: "/call_templates/",
      collectionName: "call_templates",
    });

    return {
      manifest,
      manifestText: manifestFile.text,
      domains: (manifest.domains ?? []).map((domainEntry) => domainEntry.id).filter((domainId) => typeof domainId === "string"),
      definitionFiles,
      callTemplateFiles,
      handlers: Array.isArray(handlerRegistry.json?.handlers) ? handlerRegistry.json.handlers : [],
      presets,
    };
  }

  async function includeExtraDomainFiles({ files, filePaths, pathSegment, collectionName }) {
    for (const filePath of filePaths) {
      if (!filePath.includes(pathSegment) || files.some((file) => file.filePath === filePath)) {
        continue;
      }

      const file = await tryReadJsonWithText(filePath);
      files.push({
        domainId: null,
        filePath,
        json: file?.json ?? { [collectionName]: [] },
        text: file?.text ?? null,
      });
    }
  }

  async function tryReadJsonWithText(relativePath) {
    try {
      return await readJsonWithText(relativePath);
    } catch (error) {
      if (error?.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async function readJsonWithText(relativePath) {
    const absolutePath = guard.resolveAllowedPath(relativePath);
    const text = await fs.readFile(absolutePath, "utf8");
    return {
      json: JSON.parse(text),
      text,
    };
  }

  async function writeJson(relativePath, value) {
    const absolutePath = guard.resolveAllowedPath(relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, formatJson(value), "utf8");
  }

  async function validateArchiveTarget(draftId) {
    const filePath = path.posix.join(DRAFT_ARCHIVE_ROOT, `${draftId}.json`);
    const absolutePath = guard.resolveAllowedPath(filePath);

    try {
      await fs.access(absolutePath);
      return createIssue({
        code: "archive_draft_exists",
        message: `Archived draft already exists: ${draftId}`,
        asset_type: "draft",
        asset_id: draftId,
        json_path: "/draft_id",
        editor_location: {
          step: "review",
          section: "publish_archive",
          field_path: "/draft_id",
        },
        details: { file_path: filePath },
      });
    } catch (error) {
      if (error?.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  function currentIsoTimestamp() {
    const value = now();
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new Error("Publish service clock returned an invalid date.");
    }
    return date.toISOString();
  }

  return {
    publishDraft,
  };
}

export async function publishEventDraft({
  repoRoot,
  now,
  draftId,
  draft_id,
  expectedDraftHash,
  expected_draft_hash,
  expectedSourceHashes,
  expected_source_hashes,
} = {}) {
  return createEventPublishService({ repoRoot, now }).publishDraft({
    draftId: draftId ?? draft_id,
    expectedDraftHash: expectedDraftHash ?? expected_draft_hash,
    expectedSourceHashes: expectedSourceHashes ?? expected_source_hashes,
  });
}

function composeTargetDomainFiles({ draft, generated, definitionFile, callTemplateFile }) {
  const issues = [];
  const definitionId = draft.target.definition_id;
  const mode = draft.mode;
  const existingDefinitions = Array.isArray(definitionFile.json?.event_definitions)
    ? definitionFile.json.event_definitions
    : [];
  const existingCallTemplates = Array.isArray(callTemplateFile.json?.call_templates)
    ? callTemplateFile.json.call_templates
    : [];

  const definitionFileJson = {
    ...definitionFile.json,
    event_definitions: composeDefinitions({
      mode,
      definitionId,
      existingDefinitions,
      generatedDefinition: generated.definition,
      issues,
    }),
  };
  const callTemplateFileJson = {
    ...callTemplateFile.json,
    call_templates: composeCallTemplates({
      mode,
      definitionId,
      existingCallTemplates,
      generatedCallTemplates: generated.call_templates,
      issues,
    }),
  };

  return {
    definitionFile: definitionFileJson,
    callTemplateFile: callTemplateFileJson,
    issues,
  };
}

function composeDefinitions({ mode, definitionId, existingDefinitions, generatedDefinition, issues }) {
  if (mode === "edit_existing") {
    const matchingIndexes = indexesWhere(existingDefinitions, (definition) => definition?.id === definitionId);
    if (matchingIndexes.length === 0) {
      issues.push(
        createIssue({
          code: "source_definition_missing",
          message: `Source event definition is missing: ${definitionId}`,
          asset_type: "event_definition",
          asset_id: definitionId,
          json_path: "/event_definitions",
          editor_location: {
            step: "review",
            section: "publish_conflict",
            field_path: "/event_definitions",
          },
        }),
      );
      return [...existingDefinitions];
    }

    if (matchingIndexes.length > 1) {
      issues.push(duplicateDefinitionIssue(definitionId));
    }

    return existingDefinitions.map((definition, index) => (index === matchingIndexes[0] ? generatedDefinition : definition));
  }

  if (existingDefinitions.some((definition) => definition?.id === definitionId)) {
    issues.push(duplicateDefinitionIssue(definitionId));
  }

  return [...existingDefinitions, generatedDefinition];
}

function composeCallTemplates({ mode, definitionId, existingCallTemplates, generatedCallTemplates, issues }) {
  const generatedIds = generatedCallTemplates.map((template) => template.id);
  const duplicateGeneratedIds = findDuplicateValues(generatedIds);
  for (const duplicateId of duplicateGeneratedIds) {
    issues.push(
      createIssue({
        code: "duplicate_generated_call_template_id",
        message: `Generated duplicate call template id: ${duplicateId}`,
        asset_type: "call_template",
        asset_id: duplicateId,
        json_path: "/call_templates",
        editor_location: {
          step: "graph",
          section: "call_templates",
          field_path: "/call_templates",
        },
      }),
    );
  }

  const retainedCallTemplates =
    mode === "edit_existing"
      ? existingCallTemplates.filter((template) => template?.event_definition_id !== definitionId)
      : existingCallTemplates;
  const retainedIds = new Set(retainedCallTemplates.map((template) => template?.id).filter((id) => typeof id === "string"));

  for (const generatedId of generatedIds) {
    if (retainedIds.has(generatedId)) {
      issues.push(
        createIssue({
          code: "duplicate_call_template_id",
          message: `Call template id already exists in another event: ${generatedId}`,
          asset_type: "call_template",
          asset_id: generatedId,
          json_path: "/call_templates",
          editor_location: {
            step: "graph",
            section: "call_templates",
            field_path: "/call_templates",
          },
        }),
      );
    }
  }

  return [...retainedCallTemplates, ...generatedCallTemplates];
}

function getTargetDomainFiles(library, { definitionFilePath, callTemplateFilePath }) {
  const definitionFile = library.definitionFiles.find((candidate) => candidate.filePath === definitionFilePath);
  const callTemplateFile = library.callTemplateFiles.find((candidate) => candidate.filePath === callTemplateFilePath);

  if (!definitionFile || !callTemplateFile) {
    throw new Error(`Publish target domain files are not loaded: ${definitionFilePath}, ${callTemplateFilePath}`);
  }

  return { definitionFile, callTemplateFile };
}

function replaceTargetDomainFiles(library, { definitionFilePath, callTemplateFilePath, definitionFile, callTemplateFile }) {
  return {
    ...library,
    definitionFiles: library.definitionFiles.map((candidate) =>
      candidate.filePath === definitionFilePath ? { ...candidate, json: definitionFile } : candidate,
    ),
    callTemplateFiles: library.callTemplateFiles.map((candidate) =>
      candidate.filePath === callTemplateFilePath ? { ...candidate, json: callTemplateFile } : candidate,
    ),
  };
}

function aggregateDefinitionFile(definitionFiles) {
  return {
    event_definitions: definitionFiles.flatMap((file) =>
      Array.isArray(file.json?.event_definitions) ? file.json.event_definitions : [],
    ),
  };
}

function aggregateCallTemplateFile(callTemplateFiles) {
  return {
    call_templates: callTemplateFiles.flatMap((file) =>
      Array.isArray(file.json?.call_templates) ? file.json.call_templates : [],
    ),
  };
}

function validateExpectedDraftHash({ draft, expectedDraftHash }) {
  if (expectedDraftHash == null || expectedDraftHash === computeEventDraftHash(draft)) {
    return null;
  }

  return createIssue({
    code: "draft_hash_conflict",
    message: "Draft has changed on disk.",
    asset_type: "draft",
    asset_id: draft.draft_id,
    json_path: "/hashes/draft",
    editor_location: {
      step: "review",
      section: "publish_conflict",
      field_path: "/hashes/draft",
    },
    details: {
      expected_draft_hash: expectedDraftHash,
      actual_draft_hash: computeEventDraftHash(draft),
    },
  });
}

function validateSourceHashes({ draft, expectedSourceHashes, currentLibrary }) {
  const issues = [];

  for (const sourceRef of sourceHashRefs(draft)) {
    if (sourceRef.expectedHash == null) {
      continue;
    }

    sourceRef.actualHash = currentFileHash(currentLibrary, sourceRef.filePath);
    if (sourceRef.actualHash !== sourceRef.expectedHash) {
      issues.push(sourceHashConflictIssue(sourceRef));
    }
  }

  if (isRecord(expectedSourceHashes)) {
    for (const [filePath, expectedHash] of Object.entries(expectedSourceHashes)) {
      const actualHash = currentFileHash(currentLibrary, filePath);
      if (typeof expectedHash === "string" && typeof actualHash === "string" && actualHash !== expectedHash) {
        issues.push(
          sourceHashConflictIssue({
            filePath,
            hashField: `expected_source_hashes.${filePath}`,
            expectedHash,
            actualHash,
          }),
        );
      }
    }
  }

  return dedupeIssues(issues, (issue) => `${issue.code}:${issue.asset_id}:${issue.details?.hash_field ?? ""}`);
}

function sourceHashRefs(draft) {
  if (draft.mode !== "edit_existing" || !isRecord(draft.source) || !isRecord(draft.hashes)) {
    return [];
  }

  return [
    {
      filePath: draft.source.definition_file_path,
      hashField: "source_definition_file",
      expectedHash: draft.hashes.source_definition_file,
    },
    {
      filePath: draft.source.call_template_file_path,
      hashField: "source_call_template_file",
      expectedHash: draft.hashes.source_call_template_file,
    },
    {
      filePath: draft.source.manifest_file_path,
      hashField: "source_manifest",
      expectedHash: draft.hashes.source_manifest,
    },
  ];
}

function currentFileHash(currentLibrary, filePath) {
  if (filePath === MANIFEST_PATH) {
    return sha256(currentLibrary.manifestText);
  }

  const definitionFile = currentLibrary.definitionFiles.find((candidate) => candidate.filePath === filePath);
  if (typeof definitionFile?.text === "string") {
    return sha256(definitionFile.text);
  }

  const callTemplateFile = currentLibrary.callTemplateFiles.find((candidate) => candidate.filePath === filePath);
  if (typeof callTemplateFile?.text === "string") {
    return sha256(callTemplateFile.text);
  }

  return null;
}

function sourceHashConflictIssue({ filePath, hashField, expectedHash, actualHash }) {
  return createIssue({
    code: "source_hash_conflict",
    message: `Source file changed since this draft was created: ${filePath}`,
    asset_type: "source_file",
    asset_id: filePath,
    json_path: `/hashes/${escapeJsonPointer(hashField)}`,
    editor_location: {
      step: "review",
      section: "publish_conflict",
      field_path: `/hashes/${escapeJsonPointer(hashField)}`,
    },
    details: {
      file_path: filePath,
      hash_field: hashField,
      expected_hash: expectedHash,
      actual_hash: actualHash,
    },
  });
}

function duplicateDefinitionIssue(definitionId) {
  return createIssue({
    code: "duplicate_definition_id",
    message: `Event definition id already exists: ${definitionId}`,
    asset_type: "event_definition",
    asset_id: definitionId,
    json_path: "/event_definitions",
    editor_location: {
      step: "basic",
      section: "identity",
      field_path: "/id",
    },
  });
}

function publishFailure({ issues, generated }) {
  return {
    published: false,
    written_files: [],
    generated: generated ?? undefined,
    issues,
  };
}

function createIssue({ code, message, asset_type, asset_id, json_path, editor_location, details }) {
  return {
    severity: "error",
    code,
    message,
    asset_type,
    asset_id,
    json_path,
    editor_location:
      editor_location ?? {
        step: "review",
        section: "publish",
        field_path: json_path ?? "/",
      },
    ...(details ? { details } : {}),
  };
}

function eventRelativePath(relativePath) {
  return path.posix.join(EVENT_ROOT, assertSafeEventRelativePath(relativePath));
}

function assertSafeEventRelativePath(relativePath) {
  if (
    typeof relativePath !== "string" ||
    relativePath.length === 0 ||
    path.posix.isAbsolute(relativePath) ||
    relativePath.includes("\\") ||
    relativePath.split("/").includes("..") ||
    path.posix.normalize(relativePath) !== relativePath ||
    !relativePath.endsWith(".json")
  ) {
    throw new Error(`Invalid event manifest path: ${String(relativePath)}`);
  }

  return relativePath;
}

function indexesWhere(values, predicate) {
  const indexes = [];
  values.forEach((value, index) => {
    if (predicate(value)) {
      indexes.push(index);
    }
  });
  return indexes;
}

function findDuplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }

  return [...duplicates];
}

function dedupeIssues(issues, keyForIssue) {
  const seen = new Set();
  return issues.filter((issue) => {
    const key = keyForIssue(issue);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function hasBlockingIssues(issues) {
  return issues.some((issue) => issue.severity === "error");
}

function formatJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function escapeJsonPointer(value) {
  return String(value).replaceAll("~", "~0").replaceAll("/", "~1");
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
