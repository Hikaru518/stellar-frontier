import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MapEditorApiError } from "./apiClient";
import MapEditorPage from "./MapEditorPage";
import { createMapEditorDraft } from "./mapEditorModel";
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
});

function createLibraryResponse(overrides: Partial<MapEditorLibraryResponse> = {}): MapEditorLibraryResponse {
  return {
    maps: [],
    tileset_registry: { tilesets: [] },
    map_objects: [],
    schemas: {},
    ...overrides,
  };
}

function createMapAsset(id: string, name: string, filePath: string): MapEditorLibraryResponse["maps"][number] {
  return {
    id,
    file_path: filePath,
    data: createMapEditorDraft({ id, name, rows: 2, cols: 3 }),
  };
}
