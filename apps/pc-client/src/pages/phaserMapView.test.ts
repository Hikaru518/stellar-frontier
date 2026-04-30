import { describe, expect, it } from "vitest";
import {
  getCrewMarkerLabel,
  getCrewMarkerPosition,
  getTerrainFillColor,
  getTileTooltipText,
  type TileCenter,
} from "./phaserMapView";
import type { CrewActionState } from "../events/types";

describe("phaserMapView", () => {
  it("colors visible terrain without revealing unknown tiles", () => {
    expect(getTerrainFillColor({ status: "discovered", terrain: "水面" })).toBe("#2f80ed");
    expect(getTerrainFillColor({ status: "discovered", terrain: "森林 / 山" })).toBe("#2f8f46");
    expect(getTerrainFillColor({ status: "frontier", terrain: "水面", hasCrewSignal: false })).toBe("#6f7378");
    expect(getTerrainFillColor({ status: "frontier", terrain: "水面", hasCrewSignal: true })).toBe("#2f80ed");
  });

  it("builds hover text from only visible tile information", () => {
    expect(
      getTileTooltipText({
        displayCoord: "(0,0)",
        status: "discovered",
        terrain: "水面",
      }),
    ).toBe("坐标：(0,0)\n地形：水面");

    expect(
      getTileTooltipText({
        displayCoord: "(1,0)",
        status: "frontier",
        terrain: "森林",
        hasCrewSignal: false,
      }),
    ).toBe("坐标：(1,0)\n未探索区域");
  });

  it("uses stable single-letter crew markers", () => {
    expect(getCrewMarkerLabel({ id: "mike", name: "Mike" })).toBe("M");
    expect(getCrewMarkerLabel({ id: "amy", name: "Amy" })).toBe("A");
    expect(getCrewMarkerLabel({ id: "garry", name: "Garry" })).toBe("G");
  });

  it("interpolates moving crew markers between route step centers", () => {
    const tileCenters: Record<string, TileCenter> = {
      "4-4": { x: 0, y: 0 },
      "4-5": { x: 100, y: 0 },
      "4-6": { x: 200, y: 0 },
    };
    const action: CrewActionState = {
      id: "mike-move",
      crew_id: "mike",
      type: "move",
      status: "active",
      source: "player_command",
      from_tile_id: "4-4",
      to_tile_id: "4-6",
      target_tile_id: "4-6",
      path_tile_ids: ["4-5", "4-6"],
      started_at: 0,
      ends_at: 120,
      progress_seconds: 30,
      duration_seconds: 120,
      action_params: {
        route_step_index: 0,
        step_started_at: 0,
        step_finish_time: 60,
      },
      can_interrupt: true,
      interrupt_duration_seconds: 10,
    };

    expect(getCrewMarkerPosition({ currentTileId: "4-4", action, tileCenters, elapsedGameSeconds: 30 })).toEqual({
      x: 50,
      y: 0,
    });
  });
});
