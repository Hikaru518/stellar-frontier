import react from "@vitejs/plugin-react";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

const nodeLocalStorageExecArgv = process.allowedNodeEnvironmentFlags.has("--localstorage-file")
  ? [
      `--localstorage-file=${path.join(
        os.tmpdir(),
        `stellar-frontier-mobile-client-vitest-localstorage-${process.pid}.json`,
      )}`,
    ]
  : [];

export default defineConfig({
  define: {
    global: "globalThis",
  },
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
  },
  resolve: {
    alias: {
      "@stellar-frontier/dual-device": fileURLToPath(new URL("../../packages/dual-device/src/index.ts", import.meta.url)),
      "fs/promises": fileURLToPath(new URL("../../packages/dual-device/src/browser-node-stubs/empty.ts", import.meta.url)),
      fs: fileURLToPath(new URL("../../packages/dual-device/src/browser-node-stubs/empty.ts", import.meta.url)),
      path: fileURLToPath(new URL("../../packages/dual-device/src/browser-node-stubs/path.ts", import.meta.url)),
      crypto: fileURLToPath(new URL("../../packages/dual-device/src/browser-node-stubs/crypto.ts", import.meta.url)),
      events: fileURLToPath(new URL("../../packages/dual-device/src/browser-node-stubs/events.ts", import.meta.url)),
      util: fileURLToPath(new URL("../../packages/dual-device/src/browser-node-stubs/util.ts", import.meta.url)),
    },
  },
  build: {
    chunkSizeWarningLimit: 2000,
  },
  test: {
    environment: "jsdom",
    execArgv: nodeLocalStorageExecArgv,
    include: ["src/**/*.test.{ts,tsx}", "vite.config.test.ts"],
    setupFiles: "./src/test/setup.ts",
  },
});
