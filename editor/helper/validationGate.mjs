import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_COMMAND = "npm run validate:content";
let validationModulePromise;
let contentIndexModulePromise;

export async function buildValidationReport(library, { repoRoot = path.resolve(import.meta.dirname, "../..") } = {}) {
  const [validationModule, contentIndexModule] = await Promise.all([
    loadValidationModule(repoRoot),
    loadContentIndexModule(repoRoot),
  ]);
  const issues = [];
  const indexResult = contentIndexModule.buildEventContentIndex(library);

  for (const issue of indexResult.errors) {
    issues.push(mapIndexIssue(issue, library));
  }

  for (const issue of validationModule.validateEventContentLibrary(library)) {
    issues.push({
      severity: issue.severity,
      code: issue.code,
      message: issue.message,
      asset_type: issue.asset_type,
      asset_id: issue.asset_id,
      json_path: toJsonPointer(issue.path),
    });
  }

  return {
    passed: issues.length === 0,
    issues,
    command: DEFAULT_COMMAND,
  };
}

async function loadValidationModule(repoRoot) {
  validationModulePromise ??= loadTsModule(path.join(repoRoot, "apps/pc-client/src/events/validation.ts"));
  return validationModulePromise;
}

async function loadContentIndexModule(repoRoot) {
  contentIndexModulePromise ??= loadTsModule(path.join(repoRoot, "apps/pc-client/src/events/contentIndex.ts"));
  return contentIndexModulePromise;
}

async function loadTsModule(modulePath) {
  try {
    return await import(pathToFileURL(modulePath).href);
  } catch (error) {
    if (!(error instanceof TypeError) || !String(error.message).includes("Unknown file extension")) {
      throw error;
    }
  }

  const tsModule = await import("typescript");
  const ts = tsModule.default ?? tsModule;
  const source = fs.readFileSync(modulePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2020,
      target: ts.ScriptTarget.ES2020,
    },
  });
  return import(`data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`);
}

function mapIndexIssue(issue, library) {
  const assetType = issue.path.startsWith("event_definitions")
    ? "event_definition"
    : issue.path.startsWith("call_templates")
      ? "call_template"
      : issue.path.startsWith("handlers")
        ? "handler"
        : undefined;

  return {
    severity: "error",
    code: issue.code,
    message: issue.message,
    asset_type: assetType,
    asset_id: resolveAssetId(issue.path, library),
    json_path: toJsonPointer(issue.path),
  };
}

function resolveAssetId(issuePath, library) {
  const match = issuePath.match(/^(event_definitions|call_templates|handlers|presets)\[(\d+)\]/);
  if (!match) {
    return undefined;
  }

  const [, collectionName, indexText] = match;
  const item = library[collectionName]?.[Number(indexText)];
  return item?.id ?? item?.handler_type;
}

function toJsonPointer(issuePath) {
  return `/${issuePath
    .split(".")
    .filter(Boolean)
    .flatMap((segment) => segment.split(/\[(\d+)\]/).filter(Boolean))
    .map(escapeJsonPointer)
    .join("/")}`;
}

function escapeJsonPointer(value) {
  return String(value).replaceAll("~", "~0").replaceAll("/", "~1");
}
