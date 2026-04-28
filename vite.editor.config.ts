import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL("editor", import.meta.url)),
  plugins: [react()],
  server: {
    port: 5174,
  },
  build: {
    outDir: fileURLToPath(new URL("dist/editor", import.meta.url)),
    emptyOutDir: true,
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
