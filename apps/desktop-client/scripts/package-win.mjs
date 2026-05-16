import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(appDir, "../..");

const pnpmBinDir = path.resolve(repoRoot, "common/temp/pnpm-local/node_modules/.bin");
const electronCache = path.resolve(repoRoot, "common/temp/electron-cache");
const electronBuilderCache = path.resolve(repoRoot, "common/temp/electron-builder-cache");

mkdirSync(electronCache, { recursive: true });
mkdirSync(electronBuilderCache, { recursive: true });

const env = {
  ...process.env,
  PATH: `${pnpmBinDir}${path.delimiter}${process.env.PATH ?? ""}`,
  ELECTRON_CACHE: electronCache,
  ELECTRON_BUILDER_CACHE: electronBuilderCache,
  CSC_IDENTITY_AUTO_DISCOVERY: "false",
};

function packageScript(packageName, scriptPath) {
  return path.resolve(appDir, "node_modules", packageName, scriptPath);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? appDir,
    env,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(process.execPath, [
  path.resolve(repoRoot, "common/scripts/install-run-rush-pnpm.js"),
  "run",
  "--filter",
  "@stellar-frontier/pc-client",
  "build:desktop",
]);
run(process.execPath, [packageScript("typescript", "bin/tsc"), "-p", "tsconfig.json"]);
run(process.execPath, [
  packageScript("electron-builder", "cli.js"),
  "--win",
  "portable",
  "--x64",
  "--publish",
  "never",
]);
