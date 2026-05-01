import { describe, expect, it } from "vitest";
import type { CrewMember, MapTile } from "../data/gameData";
import type { CrewActionState } from "../events/types";
import type { VisibleTileWindow } from "../mapSystem";
import {
  TILE_GAP,
  TILE_SIZE,
  buildPhaserCrewMarkers,
  buildPhaserTileViews,
  buildTileCenters,
  findTilePath,
  getCrewMarkerLabel,
  getCrewMarkerPosition,
  getGridNeighborIds,
  getTerrainFillColor,
  getTileTooltipText,
} from "./mapView";

describe("mapView", () => {
  describe("getTerrainFillColor", () => {
    it("maps discovered forest terrain and frontier fallback colors", () => {
      expect(getTerrainFillColor("森林", "discovered")).toBe("#2f8f46");
      expect(getTerrainFillColor(undefined, "frontier")).toBe("#6f7378");
      expect(getTerrainFillColor("草原", "unknownHole")).toBe("#6f7378");
    });

    it("maps known terrain keywords to stable colors", () => {
      expect(getTerrainFillColor("浅水", "discovered")).toBe("#2f80ed");
      expect(getTerrainFillColor("沙漠", "discovered")).toBe("#d8b45f");
      expect(getTerrainFillColor("岩丘", "discovered")).toBe("#777b82");
      expect(getTerrainFillColor("平原", "discovered")).toBe("#7fbf69");
      expect(getTerrainFillColor("坠毁残骸", "discovered")).toBe("#8c8174");
      expect(getTerrainFillColor("未知地貌", "discovered")).toBe("#8c8174");
    });
  });

  describe("getTileTooltipText", () => {
    it("describes discovered, frontier, and unknown tiles without throwing", () => {
      expect(getTileTooltipText("(0,0)", "discovered", "森林", "营地")).toBe("营地 | 森林 | (0,0)");
      expect(getTileTooltipText("(1,0)", "frontier", "沙漠", "边缘")).toBe("边缘 | 沙漠 | (1,0) | 边境未调查");
      expect(getTileTooltipText("(2,0)", "unknownHole")).toBe("未探索区域 | (2,0)");
    });
  });

  describe("getCrewMarkerLabel", () => {
    it("uses the first visible character of a crew name or id", () => {
      expect(getCrewMarkerLabel({ id: "mike", name: "Mike" } as CrewMember)).toBe("M");
      expect(getCrewMarkerLabel({ id: "amy", name: " 艾米" } as CrewMember)).toBe("艾");
      expect(getCrewMarkerLabel({ id: "garry", name: "" } as CrewMember)).toBe("G");
    });
  });

  describe("findTilePath", () => {
    const tiles: MapTile[] = [
      tile("1-1", 1, 1),
      tile("1-2", 1, 2),
      tile("1-3", 1, 3),
      tile("2-1", 2, 1),
      tile("2-2", 2, 2, false),
      tile("2-3", 2, 3),
      tile("3-1", 3, 1),
      tile("3-2", 3, 2),
      tile("3-3", 3, 3),
    ];

    it("returns a non-empty four-neighbor path including both endpoints", () => {
      const path = findTilePath(tiles, "1-1", "3-3");

      expect(path.length).toBeGreaterThan(0);
      expect(path[0]).toBe("1-1");
      expect(path[path.length - 1]).toBe("3-3");
      expect(path).not.toContain("2-2");
    });

    it("returns an empty path when either endpoint is missing or blocked", () => {
      expect(findTilePath(tiles, "2-2", "3-3")).toEqual([]);
      expect(findTilePath(tiles, "1-1", "2-2")).toEqual([]);
      expect(findTilePath(tiles, "missing", "3-3")).toEqual([]);
      expect(findTilePath(tiles, "1-1", "missing")).toEqual([]);
    });

    it("returns the single tile when start equals end and it is walkable", () => {
      expect(findTilePath([tile("X", 1, 1)], "X", "X")).toEqual(["X"]);
    });
  });

  describe("grid and tile view derivation", () => {
    it("returns four-neighbor ids from grid coordinates", () => {
      expect(getGridNeighborIds({ row: 2, col: 3 })).toEqual(["1-3", "3-3", "2-2", "2-4"]);
    });

    it("builds Phaser tile views and tile centers from a visible window", () => {
      const views = buildPhaserTileViews(visibleWindow(), {
        selectedId: "1-1",
        selectedMoveTargetId: "1-2",
        movePreviewRoute: ["1-1", "1-2"],
        crewPositions: { "1-1": ["mike"] },
      });

      expect(views).toMatchObject([
        {
          id: "1-1",
          row: 0,
          col: 0,
          displayCoord: "(0,0)",
          fillColor: "#2f8f46",
          label: "营地",
          areaName: "营地",
          crewLabels: ["M"],
          isSelected: true,
          isRoute: true,
        },
        {
          id: "1-2",
          row: 0,
          col: 1,
          displayCoord: "(1,0)",
          fillColor: "#6f7378",
          label: "?",
          isTarget: true,
        },
      ]);

      expect(buildTileCenters(views)["1-2"]).toEqual({ x: TILE_SIZE + TILE_GAP + TILE_SIZE / 2, y: TILE_SIZE / 2 });
    });

    it("derives visible visual sprite layers for discovered tiles in map layer order", () => {
      const views = buildPhaserTileViews(visibleWindowWithUnknown(), {
        visual: {
          layers: [
            {
              id: "base",
              name: "Base",
              visible: true,
              locked: false,
              opacity: 1,
              cells: {
                "1-1": { tilesetId: "kenney-tiny-battle", tileIndex: 4 },
                "1-2": { tilesetId: "kenney-tiny-battle", tileIndex: 5 },
                "1-3": { tilesetId: "kenney-tiny-battle", tileIndex: 6 },
              },
            },
            {
              id: "hidden-detail",
              name: "Hidden Detail",
              visible: false,
              locked: false,
              opacity: 0.4,
              cells: {
                "1-1": { tilesetId: "kenney-tiny-battle", tileIndex: 7 },
              },
            },
            {
              id: "detail",
              name: "Detail",
              visible: true,
              locked: true,
              opacity: 0.6,
              cells: {
                "1-1": { tilesetId: "kenney-tiny-battle", tileIndex: 8 },
              },
            },
          ],
        },
      });

      expect(views.find((view) => view.id === "1-1")?.visualLayers).toEqual([
        { layerId: "base", layerName: "Base", order: 0, opacity: 1, tilesetId: "kenney-tiny-battle", tileIndex: 4 },
        { layerId: "detail", layerName: "Detail", order: 2, opacity: 0.6, tilesetId: "kenney-tiny-battle", tileIndex: 8 },
      ]);
      expect(views.find((view) => view.id === "1-2")?.visualLayers).toEqual([]);
      expect(views.find((view) => view.id === "1-3")?.visualLayers).toEqual([]);
    });

    it("keeps terrain fill fallback when a discovered tile has no visual cell", () => {
      const [view] = buildPhaserTileViews(visibleWindow(), {
        visual: {
          layers: [
            {
              id: "base",
              name: "Base",
              visible: true,
              locked: false,
              opacity: 1,
              cells: {
                "2-2": { tilesetId: "kenney-tiny-battle", tileIndex: 1 },
              },
            },
          ],
        },
      });

      expect(view?.id).toBe("1-1");
      expect(view?.visualLayers).toEqual([]);
      expect(view?.fillColor).toBe("#2f8f46");
    });
  });

  describe("getCrewMarkerPosition", () => {
    const centers = {
      "1-1": { x: 64, y: 64 },
      "1-2": { x: 194, y: 64 },
    };

    it("interpolates by elapsed game seconds at progress 0, 0.5, and 1", () => {
      const action = crewAction({ from_tile_id: "1-1", to_tile_id: "1-2", started_at: 10, ends_at: 20 });

      expect(getCrewMarkerPosition({ currentTileId: "1-1", action, tileCenters: centers, elapsedGameSeconds: 10 })).toEqual(centers["1-1"]);
      expect(getCrewMarkerPosition({ currentTileId: "1-1", action, tileCenters: centers, elapsedGameSeconds: 20 })).toEqual(centers["1-2"]);
      const midpoint = getCrewMarkerPosition({ currentTileId: "1-1", action, tileCenters: centers, elapsedGameSeconds: 15 });
      expect(midpoint.x).toBeCloseTo(129, 0);
      expect(midpoint.y).toBeCloseTo(64, 0);
    });

    it("falls back to current tile center when movement data is missing", () => {
      expect(getCrewMarkerPosition({ currentTileId: "1-1", action: null, tileCenters: centers, elapsedGameSeconds: 15 })).toEqual(centers["1-1"]);
      expect(
        getCrewMarkerPosition({ currentTileId: "1-1", action: crewAction({ from_tile_id: "missing" }), tileCenters: centers, elapsedGameSeconds: 15 }),
      ).toEqual(centers["1-1"]);
    });
  });

  describe("buildPhaserCrewMarkers", () => {
    it("builds semantic crew marker coordinates with same-tile offsets", () => {
      const markers = buildPhaserCrewMarkers(
        [
          { id: "mike", name: "Mike", currentTile: "1-1" } as CrewMember,
          { id: "amy", name: "Amy", currentTile: "1-1" } as CrewMember,
        ],
        {},
        { "1-1": { x: 64, y: 64 } },
        0,
      );

      expect(markers).toEqual([
        { crewId: "mike", label: "M", x: 64, y: 64 },
        { crewId: "amy", label: "A", x: 82, y: 64 },
      ]);
    });
  });
});

function tile(id: string, row: number, col: number, walkable = true): MapTile {
  return {
    id,
    coord: id,
    row,
    col,
    terrain: "森林",
    crew: [],
    status: walkable ? "discovered" : "blocked",
    investigated: true,
    ...(walkable ? {} : { walkable: false }),
  } as MapTile;
}

function crewAction(overrides: Partial<CrewActionState>): CrewActionState {
  return {
    id: "action-1",
    crew_id: "mike",
    type: "move",
    status: "active",
    source: "player_command",
    from_tile_id: "1-1",
    to_tile_id: "1-2",
    target_tile_id: "1-2",
    path_tile_ids: ["1-1", "1-2"],
    started_at: 10,
    ends_at: 20,
    progress_seconds: 0,
    duration_seconds: 10,
    action_params: {},
    can_interrupt: true,
    interrupt_duration_seconds: 10,
    ...overrides,
  };
}

function visibleWindow(): VisibleTileWindow {
  return {
    minRow: 1,
    maxRow: 1,
    minCol: 1,
    maxCol: 2,
    cells: [
      {
        id: "1-1",
        row: 1,
        col: 1,
        displayX: 0,
        displayY: 0,
        status: "discovered",
        tile: {
          id: "1-1",
          row: 1,
          col: 1,
          areaName: "营地",
          terrain: "森林",
          weather: "晴",
          environment: { temperatureCelsius: 20, humidityPercent: 40, magneticFieldMicroTesla: 31, radiationLevel: "low" },
          objectIds: [],
          specialStates: [],
        },
      },
      {
        id: "1-2",
        row: 1,
        col: 2,
        displayX: 1,
        displayY: 0,
        status: "frontier",
        tile: {
          id: "1-2",
          row: 1,
          col: 2,
          areaName: "边缘",
          terrain: "沙漠",
          weather: "晴",
          environment: { temperatureCelsius: 28, humidityPercent: 20, magneticFieldMicroTesla: 31, radiationLevel: "low" },
          objectIds: [],
          specialStates: [{ id: "danger", name: "危险", severity: "high", visibility: "onDiscovered", startsActive: true }],
        },
      },
    ],
  };
}

function visibleWindowWithUnknown(): VisibleTileWindow {
  const baseWindow = visibleWindow();
  return {
    ...baseWindow,
    maxCol: 3,
    cells: [
      ...baseWindow.cells,
      {
        id: "1-3",
        row: 1,
        col: 3,
        displayX: 2,
        displayY: 0,
        status: "unknownHole",
      },
    ],
  };
}
