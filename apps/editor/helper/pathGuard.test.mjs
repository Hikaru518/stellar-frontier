// @vitest-environment node

import path from "node:path";
import { describe, expect, it } from "vitest";
import { createPathGuard } from "./pathGuard.mjs";

describe("pathGuard", () => {
  const repoRoot = path.resolve(import.meta.dirname, "../../..");

  it("resolves repository-relative paths inside allowed directories", () => {
    const guard = createPathGuard(repoRoot, ["content/events"]);

    expect(guard.resolveAllowedPath("content/events/manifest.json")).toBe(path.join(repoRoot, "content/events/manifest.json"));
  });

  it("rejects paths that escape the repository root", () => {
    const guard = createPathGuard(repoRoot, ["content/events"]);

    expect(() => guard.resolveAllowedPath("../package.json")).toThrow(/outside repository root/i);
  });

  it("rejects paths outside the helper whitelist", () => {
    const guard = createPathGuard(repoRoot, ["content/events"]);

    expect(() => guard.resolveAllowedPath("content/crew/crew.json")).toThrow(/not in an allowed directory/i);
  });
});
