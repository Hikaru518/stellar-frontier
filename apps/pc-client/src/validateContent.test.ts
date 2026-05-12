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

describe("validate-content map features", () => {
  afterEach(() => {
    while (tempRoots.length > 0) {
      const root = tempRoots.pop();
      if (root) {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  });

  it("accepts legal passive and investigatable map features", () => {
    const root = createTempContentRoot();
    const map = readDefaultMap(root);
    map.features = [passiveFeature("ice_field"), investigatableFeature("iafs_generator")];
    writeDefaultMap(root, map);

    const result = runValidator(root);

    expect(result.status).toBe(0);
    expect(result.output).toContain("Content validation passed.");
  });

  it("rejects duplicate feature ids, invalid status, empty spans, and out-of-bounds spans", () => {
    const root = createTempContentRoot();
    const map = readDefaultMap(root);
    map.features = [
      passiveFeature("duplicate_feature"),
      passiveFeature("duplicate_feature", { footprint: { type: "row_spans", spans: [] } }),
      passiveFeature("outside_feature", { footprint: { type: "row_spans", spans: [{ row: 257, colStart: 1, colEnd: 1 }] } }),
      investigatableFeature("invalid_status_feature", { initial_status: "missing" }),
    ];
    writeDefaultMap(root, map);

    const result = runValidator(root);

    expect(result.status).toBe(1);
    expect(result.output).toContain("Duplicate feature id in map default-map");
    expect(result.output).toContain("feature duplicate_feature field id");
    expect(result.output).toContain("feature duplicate_feature field footprint.spans");
    expect(result.output).toContain("feature outside_feature field footprint.spans[0]");
    expect(result.output).toContain("feature invalid_status_feature field initial_status");
  });

  it("rejects passive features carrying investigatable-only fields", () => {
    const root = createTempContentRoot();
    const map = readDefaultMap(root);
    map.features = [
      passiveFeature("passive_status_feature", { status_options: ["unknown"], initial_status: "unknown" }),
      passiveFeature("passive_actions_feature", {
        actions: [{ id: "passive_actions_feature:inspect", category: "feature", label: "Inspect", conditions: [] }],
      }),
    ];
    writeDefaultMap(root, map);

    const result = runValidator(root);

    expect(result.status).toBe(1);
    expect(result.output).toContain("feature passive_status_feature field status_options");
    expect(result.output).toContain("feature passive_actions_feature field actions");
  });
});

function createTempContentRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stellar-content-"));
  tempRoots.push(root);
  fs.cpSync(path.join(projectRoot, "content"), path.join(root, "content"), { recursive: true });
  return root;
}

function readDefaultMap(root: string) {
  return JSON.parse(fs.readFileSync(defaultMapPath(root), "utf8"));
}

function writeDefaultMap(root: string, map: unknown) {
  fs.writeFileSync(defaultMapPath(root), `${JSON.stringify(map, null, 2)}\n`);
}

function defaultMapPath(root: string): string {
  return path.join(root, "content/maps/default-map.json");
}

function passiveFeature(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: id,
    kind: "test:feature",
    priority: 10,
    visibility: "always",
    footprint: {
      type: "row_spans",
      spans: [{ row: 129, colStart: 129, colEnd: 130 }],
    },
    ...overrides,
  };
}

function investigatableFeature(id: string, overrides: Record<string, unknown> = {}) {
  return {
    ...passiveFeature(id),
    investigatable: true,
    status_options: ["unknown", "resolved"],
    initial_status: "unknown",
    actions: [{ id: `${id}:inspect`, category: "feature", label: "Inspect", conditions: [] }],
    ...overrides,
  };
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
