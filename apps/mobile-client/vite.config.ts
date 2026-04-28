import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    global: "globalThis",
  },
  plugins: [react()],
  server: {
    port: 5174,
  },
  resolve: {
    alias: {
      "@stellar-frontier/dual-device": fileURLToPath(new URL("../../packages/dual-device/src/index.ts", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: "./src/test/setup.ts",
  },
});
