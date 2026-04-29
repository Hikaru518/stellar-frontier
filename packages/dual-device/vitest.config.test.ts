import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import config from "./vitest.config";

describe("vitest config", () => {
  it("passes a valid localStorage file to Node workers that support it", () => {
    const execArgv = config.test?.execArgv ?? [];

    if (!process.allowedNodeEnvironmentFlags.has("--localstorage-file")) {
      expect(execArgv.some((arg) => arg.startsWith("--localstorage-file="))).toBe(false);
      return;
    }

    const localStorageArg = execArgv.find((arg) => arg.startsWith("--localstorage-file="));
    expect(localStorageArg).toBeDefined();

    const localStoragePath = localStorageArg?.slice("--localstorage-file=".length) ?? "";
    expect(path.isAbsolute(localStoragePath)).toBe(true);
    expect(path.dirname(localStoragePath)).toBe(os.tmpdir());
    expect(path.basename(localStoragePath)).toMatch(
      /^stellar-frontier-dual-device-vitest-localstorage-\d+\.json$/,
    );
  });
});
