/// <reference types="vitest" />
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL("./package.json", import.meta.url)), "utf8"),
) as { version: string };

// 通过 process.env 注入，Vite 会把 VITE_* 自动挂到 import.meta.env 上。
// 不用 `define` 是因为 Vite 8 在本项目的 dev 路径下不替换裸标识符。
process.env.VITE_APP_VERSION = pkg.version;

export default defineConfig({
  base: process.env.NODE_ENV === "production" ? "/stellar-frontier/" : "/",
  define: {
    global: "globalThis",
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [react()],
  server: {
    port: 5173,
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
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: "./src/test/setup.ts",
  },
});
