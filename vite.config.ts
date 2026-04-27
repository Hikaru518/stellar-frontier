import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: process.env.NODE_ENV === "production" ? "/stellar-frontier/" : "/",
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.mjs"],
    setupFiles: "./src/test/setup.ts",
  },
});
