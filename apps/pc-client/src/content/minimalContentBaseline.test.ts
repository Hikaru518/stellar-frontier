import { describe, expect, it } from "vitest";

import { crewDefinitions, defaultMapConfig, eventContentLibrary, itemDefinitions } from "./contentData";
import { mapObjectDefinitions, universalActions } from "./mapObjects";

describe("minimal content baseline", () => {
  it("exposes the crash-site bootstrap runtime dataset", () => {
    expect(eventContentLibrary.domains).toEqual(["iafs-inspection"]);
    expect(eventContentLibrary.event_definitions).toHaveLength(12);
    expect(eventContentLibrary.call_templates).toHaveLength(12);
    expect(mapObjectDefinitions.map((definition) => definition.id)).toEqual([
      "iafs_generator",
      "iafs_life_support",
      "iafs_shuttle_core",
    ]);

    expect(crewDefinitions).toHaveLength(1);
    expect(crewDefinitions[0]).toMatchObject({
      crewId: "mike",
      currentTile: "129-129",
      canCommunicate: true,
    });

    expect(itemDefinitions).toEqual([]);
    expect(universalActions.map((action) => action.id)).toEqual([
      "universal:move",
      "universal:standby",
      "universal:stop",
      "universal:survey",
    ]);

    expect(defaultMapConfig.size).toEqual({ rows: 256, cols: 256 });
    expect(defaultMapConfig.originTileId).toBe("129-129");
    expect(defaultMapConfig.initialDiscoveredTileIds).toEqual([
      "128-128",
      "128-129",
      "128-130",
      "129-128",
      "129-129",
      "129-130",
      "129-131",
      "130-128",
      "130-129",
      "130-130",
      "130-131",
      "131-128",
      "131-129",
      "131-130",
    ]);
    expect(defaultMapConfig.tiles).toHaveLength(65536);
    expect(defaultMapConfig.tiles.find((tile) => tile.id === "129-129")?.objectIds).toEqual([
      "iafs_generator",
      "iafs_life_support",
      "iafs_shuttle_core",
    ]);
    expect(defaultMapConfig.radar.glyphRows).toHaveLength(256);
    expect(defaultMapConfig.radar.toneRows).toHaveLength(256);
    expect(defaultMapConfig.tiles.every((tile) => tile.specialStates.length === 0)).toBe(true);
  });
});
