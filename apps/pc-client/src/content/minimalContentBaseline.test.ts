import { describe, expect, it } from "vitest";

import { crewDefinitions, defaultMapConfig, eventContentLibrary, itemDefinitions } from "./contentData";
import { mapObjectDefinitions, universalActions } from "./mapObjects";

describe("minimal content baseline", () => {
  it("exposes the crash-site bootstrap runtime dataset", () => {
    expect(eventContentLibrary.domains).toEqual(["iafs-inspection", "iafs-scavenger-camp"]);
    expect(eventContentLibrary.event_definitions).toHaveLength(23);
    expect(eventContentLibrary.call_templates).toHaveLength(46);
    expect(mapObjectDefinitions.map((definition) => definition.id)).toEqual([
      "iafs_generator",
      "iafs_life_support",
      "iafs_shuttle_core",
      "iafs_scattered_supplies",
    ]);

    expect(crewDefinitions).toHaveLength(3);
    expect(crewDefinitions[0]).toMatchObject({
      crewId: "mike",
      name: "麦克",
      currentTile: "116-112",
      canCommunicate: true,
    });
    expect(crewDefinitions[1]).toMatchObject({
      crewId: "simon",
      name: "西蒙",
      attributes: { physical: 4, agility: 5, intellect: 3, perception: 2, luck: 3 },
    });
    expect(crewDefinitions[2]).toMatchObject({
      crewId: "alice",
      name: "爱丽丝",
      attributes: { physical: 2, agility: 4, intellect: 3, perception: 4, luck: 5 },
    });

    expect(itemDefinitions.map((item) => item.itemId)).toEqual([
      "repair_kit",
      "emergency_food",
      "ice_pick",
      "violet_perfume",
      "monogrammed_handkerchief",
      "academy_notebook",
      "miners_headlamp",
      "strange_ore_samples",
    ]);
    expect(universalActions.map((action) => action.id)).toEqual([
      "universal:move",
      "universal:standby",
      "universal:stop",
      "universal:survey",
    ]);
    expect(JSON.stringify(eventContentLibrary.event_definitions)).not.toContain("object_status_equals");
    expect(JSON.stringify(eventContentLibrary.event_definitions)).not.toContain("payload.object_id");

    expect(defaultMapConfig.size).toEqual({ rows: 256, cols: 256 });
    expect(defaultMapConfig.originTileId).toBe("129-129");
    expect(defaultMapConfig.initialDiscoveredTileIds).toEqual([
      "129-129",
      "115-111",
      "115-112",
      "115-113",
      "116-111",
      "116-112",
      "116-113",
      "116-114",
      "117-111",
      "117-112",
      "117-113",
      "117-114",
      "118-111",
      "118-112",
      "118-113",
    ]);
    expect(defaultMapConfig.tiles).toHaveLength(65536);
    expect(defaultMapConfig.tiles.find((tile) => tile.id === "129-129")).not.toHaveProperty("objectIds");
    expect(defaultMapConfig.radar.glyphRows).toHaveLength(256);
    expect(defaultMapConfig.radar.toneRows).toHaveLength(256);
    expect(defaultMapConfig.tiles.find((tile) => tile.id === "130-130")).not.toHaveProperty("areaName");
    expect(defaultMapConfig.tiles.every((tile) => tile.specialStates.length === 0)).toBe(true);

    const scatteredSupplies = defaultMapConfig.features.find((feature) => feature.id === "iafs_scattered_supplies");
    expect(scatteredSupplies).toMatchObject({
      id: "iafs_scattered_supplies",
      status_options: ["unsearched", "searched"],
      initial_status: "unsearched",
    });
  });
});
