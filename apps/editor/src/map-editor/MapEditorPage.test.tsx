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

  it("loads the helper library and opens the first semantic map", async () => {
    const loadLibrary = vi.fn(async () =>
      createLibraryResponse({
        maps: [
          createMapAsset("default-map", "Default Map", "content/maps/default-map.json"),
          createMapAsset("second-map", "Second Map", "content/maps/second-map.json"),
        ],
      }),
    );

    render(<MapEditorPage loadLibrary={loadLibrary} />);

    expect(screen.getByText("Loading map library...")).toBeInTheDocument();
    const status = await screen.findByLabelText("Map library status");
    expect(within(status).getByText("2 maps")).toBeInTheDocument();
    expect(within(status).getByText("0 map objects")).toBeInTheDocument();

    const fileLibrary = screen.getByLabelText("Map file library");
    expect(within(fileLibrary).getByRole("button", { name: "Select default-map" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: "Default Map" })).toBeInTheDocument();
    expect(screen.getByLabelText("Default Map grid preview")).toBeInTheDocument();
  });

  it("uses a windowed grid and can edit radar glyph/tone for the selected tile", async () => {
    const loadLibrary = vi.fn(async () =>
      createLibraryResponse({
        maps: [createMapAsset("default-map", "Default Map", "content/maps/default-map.json", { rows: 40, cols: 40 })],
      }),
    );

    render(<MapEditorPage loadLibrary={loadLibrary} />);

    await screen.findByRole("heading", { name: "Default Map" });
    const tileButtons = screen.getAllByRole("button", { name: /^Select tile / });
    expect(tileButtons.length).toBeLessThan(1000);
    expect(tileButtons.length).toBeGreaterThan(100);

    fireEvent.click(screen.getByRole("button", { name: "Select tile 20-20" }));
    const inspector = screen.getByLabelText("Tile gameplay inspector");
    fireEvent.change(within(inspector).getByLabelText("Radar glyph"), { target: { value: "#" } });
    fireEvent.change(within(inspector).getByLabelText("Tone"), { target: { value: "r" } });

    expect(within(inspector).getByLabelText("Radar glyph")).toHaveValue("#");
    expect(within(inspector).getByLabelText("Tone")).toHaveValue("r");
  });

  it("applies semantic brush edits through the grid", async () => {
    const loadLibrary = vi.fn(async () =>
      createLibraryResponse({
        maps: [createMapAsset("default-map", "Default Map", "content/maps/default-map.json")],
      }),
    );

    render(<MapEditorPage loadLibrary={loadLibrary} />);

    await screen.findByRole("heading", { name: "Default Map" });
    fireEvent.change(screen.getByLabelText("Terrain brush"), { target: { value: "水" } });
    fireEvent.pointerDown(screen.getByRole("button", { name: "Select tile 1-1" }), { button: 0, pointerType: "mouse" });

    expect(screen.getByLabelText("Tile gameplay inspector")).toHaveTextContent("水");
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
});

function createLibraryResponse(overrides: Partial<MapEditorLibraryResponse> = {}): MapEditorLibraryResponse {
  return {
    maps: [],
    map_objects: [],
    schemas: {},
    ...overrides,
  };
}

function createMapAsset(id: string, name: string, filePath: string, size: { rows: number; cols: number } = { rows: 2, cols: 2 }) {
  return {
    id,
    file_path: filePath,
    data: createMapEditorDraft({ id, name, rows: size.rows, cols: size.cols }),
  };
}
