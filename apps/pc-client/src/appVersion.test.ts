import { describe, expect, it } from "vitest";
import pkg from "../package.json" with { type: "json" };

describe("__APP_VERSION__ build-time constant", () => {
  it("is defined as a non-empty string in the test environment", () => {
    const version = (globalThis as { __APP_VERSION__?: unknown }).__APP_VERSION__;
    expect(typeof version).toBe("string");
    expect(version).not.toBe("");
  });

  it("can be read directly via the bare identifier (declared globally)", () => {
    // The declaration in vite-env.d.ts must allow direct access in any .ts file.
    // If the declaration is missing, this file would fail to type-check (lint).
    expect(typeof __APP_VERSION__).toBe("string");
    expect(__APP_VERSION__.length).toBeGreaterThan(0);
  });

  it("matches the version field of pc-client's package.json", () => {
    // AC1: reading __APP_VERSION__ yields the package.json version (e.g. "0.1.0").
    expect(__APP_VERSION__).toBe(pkg.version);
  });
});
