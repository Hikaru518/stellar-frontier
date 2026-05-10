import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const tempRoots: string[] = [];

describe("validate-content quest references", () => {
  afterEach(() => {
    while (tempRoots.length > 0) {
      const root = tempRoots.pop();
      if (root) {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  });

  it("rejects completed_node_id references to non-completed quest nodes", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "stellar-content-"));
    tempRoots.push(root);
    fs.cpSync(path.join(projectRoot, "content"), path.join(root, "content"), { recursive: true });
    createReferencedTilesetFiles(root);

    const questPath = path.join(root, "content/quests/quests.json");
    const quests = JSON.parse(fs.readFileSync(questPath, "utf8"));
    quests.quests[0].completed_node_id = "repair_targets_revealed";
    fs.writeFileSync(questPath, `${JSON.stringify(quests, null, 2)}\n`);

    const result = runValidator(root);

    expect(result.status).toBe(1);
    expect(result.output).toContain("completed_node_id must reference a completed node");
    expect(result.output).toContain("repair_targets_revealed");
  });
});

function createReferencedTilesetFiles(root: string): void {
  const registry = JSON.parse(fs.readFileSync(path.join(root, "content/maps/tilesets/registry.json"), "utf8"));
  for (const tileset of registry.tilesets ?? []) {
    for (const relativePath of [tileset.assetPath, path.join("apps/pc-client/public", tileset.publicPath)]) {
      const filePath = path.join(root, relativePath);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, "");
    }
  }
}

function runValidator(root: string): { status: number; output: string } {
  try {
    const output = execFileSync("node", [path.join(projectRoot, "scripts/validate-content.mjs")], {
      cwd: projectRoot,
      env: { ...process.env, VALIDATE_CONTENT_ROOT: root },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, output };
  } catch (error) {
    return {
      status: typeof error === "object" && error && "status" in error && typeof error.status === "number" ? error.status : 1,
      output: typeof error === "object" && error && "stdout" in error && "stderr" in error ? `${error.stdout ?? ""}${error.stderr ?? ""}` : String(error),
    };
  }
}
