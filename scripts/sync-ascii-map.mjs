import { cp, mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const dryRun = process.argv.includes("--dry-run");

const mappings = [
  {
    from: "art/ascii-lab/maps/radar",
    to: "content/maps/radar",
  },
  {
    from: "art/ascii-lab/maps/ascii",
    to: "content/maps/ascii",
  },
];

let copiedCount = 0;

for (const mapping of mappings) {
  const sourceDir = path.join(projectRoot, mapping.from);
  const targetDir = path.join(projectRoot, mapping.to);
  await copyJsonTree(sourceDir, targetDir, mapping.from, mapping.to);
}

const verb = dryRun ? "Would sync" : "Synced";
console.log(`${verb} ${copiedCount} ASCII map JSON file${copiedCount === 1 ? "" : "s"}.`);

async function copyJsonTree(sourceDir, targetDir, sourceLabel, targetLabel) {
  const sourceStat = await stat(sourceDir).catch(() => null);
  if (!sourceStat?.isDirectory()) {
    throw new Error(`Source directory not found: ${sourceLabel}`);
  }

  await mkdir(targetDir, { recursive: true });

  const entries = await readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    const nextSourceLabel = `${sourceLabel}/${entry.name}`;
    const nextTargetLabel = `${targetLabel}/${entry.name}`;

    if (entry.isDirectory()) {
      await copyJsonTree(sourcePath, targetPath, nextSourceLabel, nextTargetLabel);
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }

    copiedCount += 1;
    console.log(`${dryRun ? "[dry-run]" : "[copy]"} ${nextSourceLabel} -> ${nextTargetLabel}`);
    if (!dryRun) {
      await mkdir(path.dirname(targetPath), { recursive: true });
      await cp(sourcePath, targetPath);
    }
  }
}
