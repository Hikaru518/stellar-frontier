import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

describe("Editor App", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/map-editor/library")) {
          return new Response(JSON.stringify(createMapLibraryResponse()), { status: 200 });
        }

        return new Response(JSON.stringify(createLibraryResponse()), { status: 200 });
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders top module navigation with map editor enabled", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Game Editor" })).toBeInTheDocument();
    const moduleNav = screen.getByRole("navigation", { name: "Editor modules" });
    expect(within(moduleNav).getByRole("button", { name: "Event Editor" })).toHaveAttribute("aria-current", "page");
    expect(within(moduleNav).getByRole("button", { name: "Character Editor" })).toBeDisabled();
    expect(within(moduleNav).getByRole("button", { name: "Map Editor" })).toBeEnabled();
    expect(within(moduleNav).getByRole("button", { name: "Item Editor" })).toBeDisabled();
    expect(within(moduleNav).getByRole("button", { name: "NPC Editor" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Collapse module sidebar" })).not.toBeInTheDocument();
    expect(screen.getByText("Loading event library...")).toBeInTheDocument();
  });

  it("switches between Event Editor and Map Editor pages", async () => {
    render(<App />);

    const moduleNav = screen.getByRole("navigation", { name: "Editor modules" });
    expect(await screen.findByText("No event assets found")).toBeInTheDocument();

    fireEvent.click(within(moduleNav).getByRole("button", { name: "Map Editor" }));

    expect(within(moduleNav).getByRole("button", { name: "Map Editor" })).toHaveAttribute("aria-current", "page");
    expect(await screen.findByRole("heading", { name: "Default Map" })).toBeInTheDocument();
    expect(screen.getByLabelText("Map file library")).toHaveTextContent("content/maps/default-map.json");

    fireEvent.click(within(moduleNav).getByRole("button", { name: "Event Editor" }));

    expect(within(moduleNav).getByRole("button", { name: "Event Editor" })).toHaveAttribute("aria-current", "page");
    expect(await screen.findByText("No event assets found")).toBeInTheDocument();
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

function createMapLibraryResponse() {
  return {
    maps: [
      {
        id: "default-map",
        file_path: "content/maps/default-map.json",
        data: {
          id: "default-map",
          name: "Default Map",
          version: 1,
          size: { rows: 2, cols: 2 },
          originTileId: "1-1",
          initialDiscoveredTileIds: ["1-1"],
          tiles: [
            createMapTile("1-1", 1, 1),
            createMapTile("1-2", 1, 2),
            createMapTile("2-1", 2, 1),
            createMapTile("2-2", 2, 2),
          ],
          visual: { layers: [] },
        },
      },
    ],
    tileset_registry: { tilesets: [] },
    map_objects: [],
    schemas: {},
  };
}

function createMapTile(id: string, row: number, col: number) {
  return {
    id,
    row,
    col,
    areaName: `Area ${id}`,
    terrain: "plain",
    weather: "clear",
    environment: {
      temperatureCelsius: 20,
      humidityPercent: 40,
      magneticFieldMicroTesla: 50,
      radiationLevel: "none",
      toxicityLevel: "none",
      atmosphericPressureKpa: 101,
    },
    objectIds: [],
    specialStates: [],
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
