import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestRelativePath = "content/events/manifest.json";
const defaultOutputRelativePath = "apps/pc-client/src/content/generated/eventContentManifest.ts";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const root = path.resolve(options.root ?? sourceRoot);
    const outputPath = path.resolve(root, options.out ?? defaultOutputRelativePath);
    const generated = generateEventContentManifest(root, outputPath);

    if (options.check) {
      const existing = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
      if (existing !== generated) {
        throw new Error(`Generated event content manifest is stale: ${path.relative(root, outputPath)}`);
      }
    } else {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, generated);
      console.log(`Generated ${path.relative(root, outputPath)}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

export function generateEventContentManifest(root = sourceRoot, outputPath = path.join(root, defaultOutputRelativePath)) {
  const result = validateEventManifest(root);
  if (result.issues.length > 0 || !result.manifest) {
    throw new Error(formatEventManifestIssues(result.issues));
  }

  return renderGeneratedModule(result.manifest, root, outputPath);
}

export function validateEventManifest(root = sourceRoot) {
  const issues = [];
  const manifestPath = path.join(root, manifestRelativePath);

  if (!fs.existsSync(manifestPath)) {
    return {
      manifest: null,
      issues: [`Missing event manifest: ${manifestRelativePath}`],
    };
  }

  const manifest = readJsonFile(manifestPath, manifestRelativePath, issues);
  if (!manifest) {
    return { manifest: null, issues };
  }

  validateManifestShape(manifest, issues);
  if (!Array.isArray(manifest.domains)) {
    return { manifest, issues };
  }

  const definitionFiles = new Set();
  const callTemplateFiles = new Set();
  const domainIds = new Set();

  for (const [domainIndex, domain] of manifest.domains.entries()) {
    const domainPath = `domains[${domainIndex}]`;
    if (!domain || typeof domain !== "object") {
      issues.push(`Invalid domain entry at ${domainPath}`);
      continue;
    }

    if (typeof domain.id !== "string" || domain.id.length === 0) {
      issues.push(`Missing domain id at ${domainPath}.id`);
      continue;
    }

    if (domainIds.has(domain.id)) {
      issues.push(`Duplicate event manifest domain id: ${domain.id}`);
    }
    domainIds.add(domain.id);

    const definitionsPath = validateManifestAssetPath(domain, "definitions", "definitions", domainPath, issues);
    const callTemplatesPath = validateManifestAssetPath(domain, "call_templates", "call_templates", domainPath, issues);
    const presetsPath =
      domain.presets == null
        ? null
        : validateManifestAssetPath(domain, "presets", "presets", domainPath, issues, { required: false });

    if (definitionsPath) {
      definitionFiles.add(toContentEventsRelativePath(definitionsPath));
      validateManifestFileExists(root, definitionsPath, "definitions", issues);
      validateAssetDomains(root, definitionsPath, "event_definitions", domain.id, "definition", issues);
    }

    if (callTemplatesPath) {
      callTemplateFiles.add(toContentEventsRelativePath(callTemplatesPath));
      validateManifestFileExists(root, callTemplatesPath, "call_templates", issues);
      validateAssetDomains(root, callTemplatesPath, "call_templates", domain.id, "call template", issues);
    }

    if (presetsPath) {
      validateManifestFileExists(root, presetsPath, "presets", issues);
    }
  }

  for (const dataPath of listJsonFiles(root, "content/events/definitions")) {
    if (!definitionFiles.has(dataPath)) {
      issues.push(`Unregistered event definition domain file: ${dataPath}`);
    }
  }

  for (const dataPath of listJsonFiles(root, "content/events/call_templates")) {
    if (!callTemplateFiles.has(dataPath)) {
      issues.push(`Unregistered call template domain file: ${dataPath}`);
    }
  }

  return { manifest, issues };
}

export function formatEventManifestIssues(issues) {
  return ["Event manifest validation failed:", ...issues.map((issue) => `  ${issue}`)].join("\n");
}

function parseArgs(args) {
  const options = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--root") {
      options.root = readArgValue(args, (index += 1), arg);
    } else if (arg === "--out") {
      options.out = readArgValue(args, (index += 1), arg);
    } else if (arg === "--check") {
      options.check = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function readArgValue(args, index, flag) {
  const value = args[index];
  if (!value) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function validateManifestShape(manifest, issues) {
  if (manifest.schema_version !== "event-manifest.v1") {
    issues.push("Event manifest schema_version must be event-manifest.v1");
  }

  if (!Array.isArray(manifest.domains)) {
    issues.push("Event manifest domains must be an array");
  }
}

function validateManifestAssetPath(domain, fieldName, expectedDirectory, domainPath, issues, options = { required: true }) {
  const value = domain[fieldName];
  if (typeof value !== "string" || value.length === 0) {
    if (options.required) {
      issues.push(`Missing ${fieldName} path at ${domainPath}.${fieldName}`);
    }
    return null;
  }

  if (!value.endsWith(".json")) {
    issues.push(`Invalid ${fieldName} path for domain ${domain.id}: ${value} must be a JSON file`);
    return null;
  }

  if (path.posix.isAbsolute(value) || value.includes("\\") || value.split("/").includes("..")) {
    issues.push(`Invalid ${fieldName} path for domain ${domain.id}: ${value} must stay under content/events`);
    return null;
  }

  const normalized = path.posix.normalize(value);
  if (normalized !== value || !value.startsWith(`${expectedDirectory}/`)) {
    issues.push(`Invalid ${fieldName} path for domain ${domain.id}: ${value} must be under ${expectedDirectory}/`);
    return null;
  }

  return value;
}

function validateManifestFileExists(root, eventRelativePath, label, issues) {
  const dataPath = toContentEventsRelativePath(eventRelativePath);
  if (!fs.existsSync(path.join(root, dataPath))) {
    issues.push(`Missing ${label} file listed in manifest: ${dataPath}`);
  }
}

function validateAssetDomains(root, eventRelativePath, propertyName, expectedDomain, label, issues) {
  const dataPath = toContentEventsRelativePath(eventRelativePath);
  const data = readJsonFile(path.join(root, dataPath), dataPath, issues);
  const assets = data?.[propertyName];

  if (!Array.isArray(assets)) {
    return;
  }

  assets.forEach((asset, assetIndex) => {
    if (asset?.domain !== expectedDomain) {
      issues.push(
        `Manifest domain ${expectedDomain} does not match ${label} domain in ${dataPath} at ${propertyName}[${assetIndex}]`,
      );
    }
  });
}

function readJsonFile(absolutePath, relativePath, issues) {
  try {
    return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  } catch (error) {
    issues.push(`Invalid JSON in ${relativePath}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function listJsonFiles(root, relativeDirectory) {
  const directory = path.join(root, relativeDirectory);
  if (!fs.existsSync(directory)) {
    return [];
  }

  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.posix.join(relativeDirectory, entry.name))
    .sort();
}

function toContentEventsRelativePath(eventRelativePath) {
  return path.posix.join("content/events", eventRelativePath);
}

function renderGeneratedModule(manifest, root, outputPath) {
  const domains = manifest.domains;
  const importLines = [];
  const definitionSpreads = [];
  const callTemplateSpreads = [];
  const presetSpreads = [];
  const domainEntries = [];

  for (const domain of domains) {
    const importBase = toImportIdentifier(domain.id);
    const definitionsIdentifier = `${importBase}EventDefinitionsContent`;
    const callTemplatesIdentifier = `${importBase}CallTemplatesContent`;

    domainEntries.push(`  "${domain.id}",`);
    importLines.push(renderJsonImport(definitionsIdentifier, root, outputPath, domain.definitions));
    importLines.push(renderJsonImport(callTemplatesIdentifier, root, outputPath, domain.call_templates));
    definitionSpreads.push(`  ...${definitionsIdentifier}.event_definitions,`);
    callTemplateSpreads.push(`  ...${callTemplatesIdentifier}.call_templates,`);

    if (domain.presets) {
      const presetsIdentifier = `${importBase}PresetsContent`;
      importLines.push(renderJsonImport(presetsIdentifier, root, outputPath, domain.presets));
      presetSpreads.push(`  ...${presetsIdentifier}.presets,`);
    }
  }

  return [
    "/*",
    " * This file is auto-generated by scripts/generate-event-content-manifest.mjs.",
    " * Do not edit by hand. Update content/events/manifest.json, then rerun the generator.",
    " */",
    'import type { CallTemplate, EventDefinition, PresetDefinition } from "../../events/types";',
    ...importLines,
    "",
    "export const generatedEventDomains = [",
    ...domainEntries,
    "] as const;",
    "",
    "export const generatedEventProgramDefinitions = [",
    ...definitionSpreads,
    "] as unknown as EventDefinition[];",
    "",
    "export const generatedCallTemplates = [",
    ...callTemplateSpreads,
    "] as unknown as CallTemplate[];",
    "",
    "export const generatedPresetDefinitions = [",
    ...presetSpreads,
    "] as unknown as PresetDefinition[];",
    "",
  ].join("\n");
}

function renderJsonImport(identifier, root, outputPath, eventRelativePath) {
  const absoluteImportPath = path.join(root, toContentEventsRelativePath(eventRelativePath));
  let importPath = path.relative(path.dirname(outputPath), absoluteImportPath).split(path.sep).join(path.posix.sep);
  if (!importPath.startsWith(".")) {
    importPath = `./${importPath}`;
  }
  return `import ${identifier} from "${importPath}";`;
}

function toImportIdentifier(domainId) {
  return domainId
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part, index) => {
      const lower = part.toLowerCase();
      return index === 0 ? lower : `${lower[0].toUpperCase()}${lower.slice(1)}`;
    })
    .join("");
}
