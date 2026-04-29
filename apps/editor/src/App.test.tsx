import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

describe("Editor App", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(createLibraryResponse()), { status: 200 })),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders top module navigation with future editors disabled", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Game Editor" })).toBeInTheDocument();
    const moduleNav = screen.getByRole("navigation", { name: "Editor modules" });
    expect(within(moduleNav).getByRole("button", { name: "Event Editor" })).toHaveAttribute("aria-current", "page");
    expect(within(moduleNav).getByRole("button", { name: "Character Editor" })).toBeDisabled();
    expect(within(moduleNav).getByRole("button", { name: "Map Editor" })).toBeDisabled();
    expect(within(moduleNav).getByRole("button", { name: "Item Editor" })).toBeDisabled();
    expect(within(moduleNav).getByRole("button", { name: "NPC Editor" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Collapse module sidebar" })).not.toBeInTheDocument();
    expect(screen.getByText("Loading event library...")).toBeInTheDocument();
  });
});

function createLibraryResponse() {
  return {
    definitions: [],
    call_templates: [],
    presets: [],
    handlers: [],
    schemas: {},
  };
}

function installMemoryLocalStorage(): void {
  const values = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
      key: (index: number) => Array.from(values.keys())[index] ?? null,
      get length() {
        return values.size;
      },
    } satisfies Storage,
  });
}
