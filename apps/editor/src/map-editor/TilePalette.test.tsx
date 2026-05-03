import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TilePalette from "./TilePalette";
import type { MapEditorTilesetRegistry } from "./apiClient";

describe("TilePalette", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders Kenney tile indexes, category filtering, search, preview, and recent tiles", () => {
    const onSelectTile = vi.fn();
    render(
      <TilePalette
        registry={createRegistry()}
        selectedTile={{ tilesetId: "kenney-tiny-battle", tileIndex: 4 }}
        recentTiles={[{ tilesetId: "kenney-tiny-battle", tileIndex: 1 }]}
        onSelectTile={onSelectTile}
      />,
    );

    expect(screen.getByLabelText("Selected tile preview")).toHaveTextContent("Tile index 4");
    expect(screen.getByRole("button", { name: "Select tile index 0" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select tile index 4" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "water" } });
    const grid = screen.getByLabelText("Kenney Tiny Battle tilesheet tile indexes");
    expect(within(grid).queryByRole("button", { name: "Select tile index 0" })).not.toBeInTheDocument();
    expect(within(grid).getByRole("button", { name: "Select tile index 5" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search tile index"), { target: { value: "6" } });
    expect(within(grid).getByRole("button", { name: "Select tile index 6" })).toBeInTheDocument();
    expect(within(grid).queryByRole("button", { name: "Select tile index 5" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Select recent tile index 1" }));
    expect(onSelectTile).toHaveBeenCalledWith({ tilesetId: "kenney-tiny-battle", tileIndex: 1 });
  });
});

function createRegistry(): MapEditorTilesetRegistry {
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
        categories: [
          { id: "terrain", name: "Terrain", tileIndexes: [0, 1, 2, 3, 4] },
          { id: "water", name: "Water", tileIndexes: [5, 6, 7] },
        ],
      },
    ],
  };
}
