import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MapEditorApiError } from "./apiClient";
import MapEditorPage from "./MapEditorPage";
import { createMapEditorDraft, createVisualLayer } from "./mapEditorModel";
import type { MapEditorLibraryResponse } from "./apiClient";

describe("MapEditorPage", () => {
  afterEach(() => {
    cleanup();
  });

  it("loads the helper library, lists map files, and selects the first map", async () => {
    const loadLibrary = vi.fn(async () =>
      createLibraryResponse({
        maps: [
          createMapAsset("default-map", "Default Map", "content/maps/default-map.json"),
          createMapAsset("second-map", "Second Map", "content/maps/second-map.json"),
        ],
        tileset_registry: {
          tilesets: [
            {
              id: "kenney-tiny-battle",
              name: "Kenney Tiny Battle",
              assetPath: "assets/kenney_tiny-battle/Tilemap/tilemap_packed.png",
              tileWidth: 16,
              tileHeight: 16,
              columns: 18,
              tileCount: 198,
            },
          ],
        },
      }),
    );

    render(<MapEditorPage loadLibrary={loadLibrary} />);

    expect(screen.getByText("Loading map library...")).toBeInTheDocument();
    const status = await screen.findByLabelText("Map library status");
    expect(within(status).getByText("2 maps")).toBeInTheDocument();
    expect(within(status).getByText("1 tileset")).toBeInTheDocument();

    const fileLibrary = screen.getByLabelText("Map file library");
    expect(within(fileLibrary).getByRole("button", { name: "Select default-map" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: "Default Map" })).toBeInTheDocument();
    expect(within(fileLibrary).getByText("content/maps/default-map.json")).toBeInTheDocument();
    expect(screen.getByText("Kenney Tiny Battle · 198 tiles")).toBeInTheDocument();
  });

  it("updates the selected map from the file list", async () => {
    const loadLibrary = vi.fn(async () =>
      createLibraryResponse({
        maps: [
          createMapAsset("default-map", "Default Map", "content/maps/default-map.json"),
          createMapAsset("second-map", "Second Map", "content/maps/second-map.json"),
        ],
      }),
    );

    render(<MapEditorPage loadLibrary={loadLibrary} />);

    expect(await screen.findByRole("heading", { name: "Default Map" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Select second-map" }));

    expect(screen.getByRole("heading", { name: "Second Map" })).toBeInTheDocument();
    expect(screen.getByLabelText("Map editor summary")).toHaveTextContent("second-map");
  });

  it("shows the helper startup hint when loading fails", async () => {
    const loadLibrary = vi.fn(async () =>
      Promise.reject(
        new MapEditorApiError("helper_unavailable", "Unable to reach helper. Start it with npm run editor:helper.", { status: 0 }),
      ),
    );

    render(<MapEditorPage loadLibrary={loadLibrary} />);

    expect(await screen.findByText("Helper unavailable")).toBeInTheDocument();
    expect(screen.getAllByText(/npm run editor:helper/).length).toBeGreaterThan(0);
  });

  it("shows an empty state when the library has no maps", async () => {
    const loadLibrary = vi.fn(async () => createLibraryResponse());

    render(<MapEditorPage loadLibrary={loadLibrary} />);

    expect(await screen.findByText("No map draft open")).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "New Map" })).toBeInTheDocument();
  });

  it("creates a new map draft from valid form input", async () => {
    const loadLibrary = vi.fn(async () => createLibraryResponse());

    render(<MapEditorPage loadLibrary={loadLibrary} />);

    await screen.findByText("No map draft open");
    const form = screen.getByRole("form", { name: "New Map" });
    fireEvent.change(within(form).getByLabelText("ID"), { target: { value: "crash-site" } });
    fireEvent.change(within(form).getByLabelText("Name"), { target: { value: "Crash Site" } });
    fireEvent.change(within(form).getByLabelText("Rows"), { target: { value: "3" } });
    fireEvent.change(within(form).getByLabelText("Cols"), { target: { value: "4" } });
    fireEvent.click(within(form).getByRole("button", { name: "New Map" }));

    expect(screen.getByRole("heading", { name: "Crash Site" })).toBeInTheDocument();
    expect(screen.getByLabelText("Map editor summary")).toHaveTextContent("3 x 4");
    expect(screen.getByLabelText("Crash Site grid preview")).toBeInTheDocument();
    expect(screen.getByLabelText("Map editor summary")).toHaveTextContent("2-2");
  });

  it("accepts map ids that match the content schema pattern", async () => {
    const loadLibrary = vi.fn(async () => createLibraryResponse());

    render(<MapEditorPage loadLibrary={loadLibrary} />);

    await screen.findByText("No map draft open");
    const form = screen.getByRole("form", { name: "New Map" });
    fireEvent.change(within(form).getByLabelText("ID"), { target: { value: "crash_site_02" } });
    fireEvent.change(within(form).getByLabelText("Name"), { target: { value: "Crash Site 02" } });
    fireEvent.change(within(form).getByLabelText("Rows"), { target: { value: "1" } });
    fireEvent.change(within(form).getByLabelText("Cols"), { target: { value: "1" } });
    fireEvent.click(within(form).getByRole("button", { name: "New Map" }));

    expect(screen.getByLabelText("Map editor summary")).toHaveTextContent("crash_site_02");
  });

  it("shows form errors and keeps the current draft when new map input is invalid", async () => {
    const loadLibrary = vi.fn(async () =>
      createLibraryResponse({
        maps: [createMapAsset("default-map", "Default Map", "content/maps/default-map.json")],
      }),
    );

    render(<MapEditorPage loadLibrary={loadLibrary} />);

    expect(await screen.findByRole("heading", { name: "Default Map" })).toBeInTheDocument();
    const form = screen.getByRole("form", { name: "New Map" });
    fireEvent.change(within(form).getByLabelText("ID"), { target: { value: "Bad Id" } });
    fireEvent.change(within(form).getByLabelText("Name"), { target: { value: "Broken" } });
    fireEvent.change(within(form).getByLabelText("Rows"), { target: { value: "0" } });
    fireEvent.change(within(form).getByLabelText("Cols"), { target: { value: "-1" } });
    fireEvent.click(within(form).getByRole("button", { name: "New Map" }));

    expect(screen.getByLabelText("New Map errors")).toHaveTextContent("Map id must start");
    expect(screen.getByLabelText("New Map errors")).toHaveTextContent("Map rows must be at least 1");
    expect(screen.getByLabelText("New Map errors")).toHaveTextContent("Map cols must be at least 1");
    expect(screen.getByRole("heading", { name: "Default Map" })).toBeInTheDocument();
  });

  it("paints, erases, fills, rectangle fills, and picks visible visual cells from the palette", async () => {
    const loadLibrary = vi.fn(async () =>
      createLibraryResponse({
        maps: [createMapAsset("default-map", "Default Map", "content/maps/default-map.json", { withLayer: true })],
        tileset_registry: createTilesetRegistry(),
      }),
    );

    const { container } = render(<MapEditorPage loadLibrary={loadLibrary} />);

    expect(await screen.findByRole("heading", { name: "Default Map" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Select tile index 3" }));
    paintTile("1-1");
    expect(container.querySelectorAll(".map-grid-visual-layer .tile-sprite")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Eraser" }));
    paintTile("1-1");
    expect(container.querySelectorAll(".map-grid-visual-layer .tile-sprite")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Select tile index 4" }));
    fireEvent.click(screen.getByRole("button", { name: "Bucket Fill" }));
    paintTile("1-1");
    expect(container.querySelectorAll(".map-grid-visual-layer .tile-sprite")).toHaveLength(6);

    fireEvent.click(screen.getByRole("button", { name: "Select tile index 5" }));
    fireEvent.click(screen.getByRole("button", { name: "Rectangle Fill" }));
    pointerDown(screen.getByRole("button", { name: "Select tile 1-1" }));
    pointerUp(screen.getByRole("button", { name: "Select tile 2-2" }));
    expect(container.querySelectorAll(".map-grid-visual-layer .tile-sprite")).toHaveLength(6);

    fireEvent.click(screen.getByRole("button", { name: "Eyedropper" }));
    paintTile("2-2");
    expect(screen.getByRole("button", { name: "Select tile index 5" })).toHaveAttribute("aria-pressed", "true");

    function paintTile(tileId: string) {
      const tile = screen.getByRole("button", { name: `Select tile ${tileId}` });
      pointerDown(tile);
      pointerUp(tile);
    }
  });

  it("does not paint locked active layers and shows a lightweight notice", async () => {
    const loadLibrary = vi.fn(async () =>
      createLibraryResponse({
        maps: [createMapAsset("default-map", "Default Map", "content/maps/default-map.json", { withLayer: true })],
        tileset_registry: createTilesetRegistry(),
      }),
    );

    const { container } = render(<MapEditorPage loadLibrary={loadLibrary} />);

    expect(await screen.findByRole("heading", { name: "Default Map" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Select tile index 3" }));
    fireEvent.click(screen.getByLabelText("Locked"));
    const tile = screen.getByRole("button", { name: "Select tile 1-1" });
    pointerDown(tile);
    pointerUp(tile);

    expect(screen.getByRole("status")).toHaveTextContent('Layer "Base" is locked.');
    expect(container.querySelectorAll(".map-grid-visual-layer .tile-sprite")).toHaveLength(0);
  });
});

function pointerDown(element: HTMLElement) {
  fireEvent.pointerDown(element, { button: 0, pointerId: 1, pointerType: "mouse" });
}

function pointerUp(element: HTMLElement) {
  fireEvent.pointerUp(element, { button: 0, pointerId: 1, pointerType: "mouse" });
}

function createLibraryResponse(overrides: Partial<MapEditorLibraryResponse> = {}): MapEditorLibraryResponse {
  return {
    maps: [],
    tileset_registry: { tilesets: [] },
    map_objects: [],
    schemas: {},
    ...overrides,
  };
}

function createMapAsset(
  id: string,
  name: string,
  filePath: string,
  options: { withLayer?: boolean } = {},
): MapEditorLibraryResponse["maps"][number] {
  const data = createMapEditorDraft({ id, name, rows: 2, cols: 3 });
  if (options.withLayer) {
    data.visual.layers = [createVisualLayer("base", "Base")];
  }
  return {
    id,
    file_path: filePath,
    data,
  };
}

function createTilesetRegistry(): MapEditorLibraryResponse["tileset_registry"] {
  return {
    tilesets: [
      {
        id: "kenney-tiny-battle",
        name: "Kenney Tiny Battle",
        assetPath: "assets/kenney_tiny-battle/Tilemap/tilemap_packed.png",
        publicPath: "maps/tilesets/kenney-tiny-battle/tilemap_packed.png",
        tileWidth: 16,
        tileHeight: 16,
        columns: 4,
        tileCount: 8,
        categories: [{ id: "terrain", name: "Terrain", tileIndexes: [0, 1, 2, 3, 4, 5, 6, 7] }],
      },
    ],
  };
}
