import { describe, expect, it } from "vitest";

import { crewDefinitions, defaultMapConfig, eventContentLibrary, itemDefinitions } from "./contentData";
import { mapObjectDefinitions, universalActions } from "./mapObjects";

describe("minimal content baseline", () => {
  it("exposes the crash-site bootstrap runtime dataset", () => {
    expect(eventContentLibrary.domains).toEqual(["iafs-inspection"]);
    expect(eventContentLibrary.event_definitions).toHaveLength(11);
    expect(eventContentLibrary.call_templates).toHaveLength(8);
    expect(mapObjectDefinitions.map((definition) => definition.id)).toEqual([
      "iafs_generator",
      "iafs_life_support",
      "iafs_shuttle_core",
    ]);

    expect(crewDefinitions).toHaveLength(1);
    expect(crewDefinitions[0]).toMatchObject({
      crewId: "mike",
      currentTile: "4-4",
      canCommunicate: true,
    });

    expect(itemDefinitions).toEqual([]);
    expect(universalActions.map((action) => action.id)).toEqual([
      "universal:move",
      "universal:standby",
      "universal:stop",
      "universal:survey",
    ]);

    expect(defaultMapConfig.size).toEqual({ rows: 8, cols: 8 });
    expect(defaultMapConfig.originTileId).toBe("4-4");
    expect(defaultMapConfig.initialDiscoveredTileIds).toEqual([
      "3-3",
      "3-4",
      "3-5",
      "4-3",
      "4-4",
      "4-5",
      "4-6",
      "5-3",
      "5-4",
      "5-5",
      "5-6",
      "6-3",
      "6-4",
      "6-5",
    ]);
    expect(defaultMapConfig.tiles).toHaveLength(64);
    expect(defaultMapConfig.tiles.find((tile) => tile.id === "4-4")?.objectIds).toEqual([
      "iafs_generator",
      "iafs_life_support",
      "iafs_shuttle_core",
    ]);
    expect(defaultMapConfig.tiles.every((tile) => tile.specialStates.length === 0)).toBe(true);
  });
});
