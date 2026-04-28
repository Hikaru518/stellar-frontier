import os from "node:os";
import path from "node:path";
import { defineConfig } from "vitest/config";

const nodeLocalStorageExecArgv = process.allowedNodeEnvironmentFlags.has("--localstorage-file")
  ? [
      `--localstorage-file=${path.join(
        os.tmpdir(),
        `stellar-frontier-dual-device-vitest-localstorage-${process.pid}.json`,
      )}`,
    ]
  : [];

export default defineConfig({
  test: {
    environment: "node",
    execArgv: nodeLocalStorageExecArgv,
    include: ["src/**/*.test.ts", "vitest.config.test.ts"],
  },
});
