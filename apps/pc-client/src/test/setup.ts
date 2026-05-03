import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import pkg from "../../package.json" with { type: "json" };

// Vite's `define` injection does not run under vitest, so mirror it here so that
// any module relying on `__APP_VERSION__` (logger envelope, etc.) keeps working
// in unit tests. Use the real package.json version to stay in sync with builds.
(globalThis as { __APP_VERSION__?: string }).__APP_VERSION__ = pkg.version;

const localStorageValues = new Map<string, string>();

Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: {
    get length() {
      return localStorageValues.size;
    },
    key: (index: number) => Array.from(localStorageValues.keys())[index] ?? null,
    getItem: (key: string) => localStorageValues.get(key) ?? null,
    setItem: (key: string, value: string) => {
      localStorageValues.set(key, String(value));
    },
    removeItem: (key: string) => {
      localStorageValues.delete(key);
    },
    clear: () => {
      localStorageValues.clear();
    },
  },
});

afterEach(() => {
  cleanup();
});
