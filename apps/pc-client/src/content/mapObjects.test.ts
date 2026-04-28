import { describe, expect, it } from "vitest";
import {
  getMapObjectDefinition,
  mapObjectDefinitionById,
  mapObjectDefinitions,
  universalActions,
} from "./mapObjects";

describe("mapObjects content", () => {
  it("loads at least one mainline object via the glob loader", () => {
    const mainlineObjects = mapObjectDefinitions.filter((definition) =>
      (definition.tags ?? []).includes("mainline"),
    );
    expect(mainlineObjects.length).toBeGreaterThan(0);
  });

  it("indexes every loaded definition by id", () => {
    expect(mapObjectDefinitionById.size).toBe(mapObjectDefinitions.length);
    const sampleId = mapObjectDefinitions[0]?.id;
    expect(sampleId).toBeTruthy();
    expect(getMapObjectDefinition(sampleId!)).toEqual(mapObjectDefinitions[0]);
  });

  it("ensures every object has a non-empty status_options containing initial_status", () => {
    for (const definition of mapObjectDefinitions) {
      expect(definition.status_options.length).toBeGreaterThan(0);
      expect(definition.status_options).toContain(definition.initial_status);
    }
  });

  it("loads exactly the four MVP universal actions", () => {
    expect(universalActions).toHaveLength(4);
    const ids = universalActions.map((action) => action.id).sort();
    expect(ids).toEqual([
      "universal:move",
      "universal:standby",
      "universal:stop",
      "universal:survey",
    ]);
    for (const action of universalActions) {
      expect(action.category).toBe("universal");
    }
  });
});
