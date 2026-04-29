import { describe, expect, it } from "vitest";
import { mapObjectDefinitionById } from "../content/mapObjects";
import { createInitialMapState } from "./gameData";

describe("createInitialMapState", () => {
  it("populates map.mapObjects with one entry per definition, using initial_status", () => {
    const map = createInitialMapState();
    const mapObjects = map.mapObjects ?? {};

    expect(Object.keys(mapObjects).length).toBe(mapObjectDefinitionById.size);

    for (const definition of mapObjectDefinitionById.values()) {
      const entry = mapObjects[definition.id];
      expect(entry).toBeDefined();
      expect(entry?.id).toBe(definition.id);
      expect(entry?.status_enum).toBe(definition.initial_status);
    }
  });
});
