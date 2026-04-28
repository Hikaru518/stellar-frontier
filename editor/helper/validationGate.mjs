import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
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

export async function validateContentRoot({
  contentRoot,
  sourceRoot = path.resolve(import.meta.dirname, "../.."),
  target,
} = {}) {
  if (!contentRoot) {
    throw new Error("contentRoot is required for draft validation.");
  }

  const result = await runValidateContent(sourceRoot, contentRoot);
  if (result.exitCode === 0) {
    return {
      passed: true,
      issues: [],
      command: DEFAULT_COMMAND,
    };
  }

  const assetMetadata = await buildAssetMetadata(contentRoot);
  return {
    passed: false,
    issues: parseValidationOutput(`${result.stderr}\n${result.stdout}`, { assetMetadata, target }),
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

function runValidateContent(sourceRoot, contentRoot) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(sourceRoot, "apps/pc-client/scripts/validate-content.mjs")], {
      cwd: sourceRoot,
      env: {
        ...process.env,
        VALIDATE_CONTENT_ROOT: contentRoot,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({ exitCode, stdout, stderr });
    });
  });
}

function parseValidationOutput(output, { assetMetadata, target }) {
  const issues = [];
  let schemaFilePath = null;
  let inManifestSection = false;

  for (const rawLine of output.split(/\r?\n/)) {
    const line = stripAnsi(rawLine);
    if (!line.trim()) {
      continue;
    }

    const schemaHeader = line.match(/^Schema validation failed: (.+)$/);
    if (schemaHeader) {
      schemaFilePath = schemaHeader[1];
      inManifestSection = false;
      continue;
    }

    if (line === "Event manifest validation failed:") {
      schemaFilePath = null;
      inManifestSection = true;
      continue;
    }

    const referenceIssue = line.match(
      /^  \[(error|warning)\] (event_definition|call_template):([^ ]+) ([^ ]+) ([^:]+): (.+)$/,
    );
    if (referenceIssue) {
      const [, severity, assetType, assetId, issuePath, code, message] = referenceIssue;
      const metadata = assetMetadata.get(`${assetType}:${assetId}`);
      issues.push({
        severity,
        code,
        message,
        file_path: metadata?.file_path,
        asset_type: assetType,
        asset_id: assetId,
        json_path: toJsonPointer(issuePath),
      });
      continue;
    }

    if (schemaFilePath && line.startsWith("  ")) {
      const schemaIssue = line.match(/^  (\S+) (.+)$/);
      if (!schemaIssue) {
        continue;
      }
      const [, jsonPath, message] = schemaIssue;
      const metadata = resolveMetadataForJsonPath(assetMetadata, schemaFilePath, jsonPath, target);
      issues.push({
        severity: "error",
        code: "schema_validation_failed",
        message,
        file_path: schemaFilePath,
        asset_type: metadata?.asset_type,
        asset_id: metadata?.asset_id,
        json_path: jsonPath,
      });
      continue;
    }

    if (inManifestSection && line.startsWith("  ")) {
      issues.push({
        severity: "error",
        code: "manifest_validation_failed",
        message: line.trim(),
        file_path: "content/events/manifest.json",
        asset_type: "manifest",
        json_path: "/",
      });
    }
  }

  if (issues.length === 0) {
    issues.push({
      severity: "error",
      code: "content_validation_failed",
      message: output.trim() || "Content validation failed.",
    });
  }

  return issues;
}

async function buildAssetMetadata(contentRoot) {
  const metadata = new Map();
  const manifestPath = path.join(contentRoot, "content/events/manifest.json");
  let manifest;
  try {
    manifest = JSON.parse(await fsPromises.readFile(manifestPath, "utf8"));
  } catch {
    return metadata;
  }

  for (const domain of manifest.domains ?? []) {
    await addAssetMetadata(metadata, contentRoot, {
      filePath: path.posix.join("content/events", domain.definitions),
      collectionName: "event_definitions",
      assetType: "event_definition",
    });
    await addAssetMetadata(metadata, contentRoot, {
      filePath: path.posix.join("content/events", domain.call_templates),
      collectionName: "call_templates",
      assetType: "call_template",
    });
  }

  return metadata;
}

async function addAssetMetadata(metadata, contentRoot, { filePath, collectionName, assetType }) {
  let data;
  try {
    data = JSON.parse(await fsPromises.readFile(path.join(contentRoot, filePath), "utf8"));
  } catch {
    return;
  }

  (data[collectionName] ?? []).forEach((asset, index) => {
    if (!asset?.id) {
      return;
    }
    metadata.set(`${assetType}:${asset.id}`, {
      asset_type: assetType,
      asset_id: asset.id,
      file_path: filePath,
      json_path: `/${collectionName}/${index}`,
    });
  });
}

function resolveMetadataForJsonPath(assetMetadata, filePath, jsonPath, target) {
  if (target?.file_path === filePath && jsonPath.startsWith(target.json_path)) {
    return {
      asset_type: target.asset_type,
      asset_id: target.asset_id,
      file_path: target.file_path,
      json_path: target.json_path,
    };
  }

  for (const metadata of assetMetadata.values()) {
    if (metadata.file_path === filePath && jsonPath.startsWith(metadata.json_path)) {
      return metadata;
    }
  }

  return undefined;
}

function stripAnsi(value) {
  return value.replace(/\u001B\[[0-9;]*m/g, "");
}
