import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import universalActionsSchema from "../../../../content/schemas/universal-actions.schema.json";
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

  it("does not route current-area survey through the legacy survey event id", () => {
    const survey = universalActions.find((action) => action.id === "universal:survey");
    expect(survey).toBeDefined();
    expect(survey?.event_id).not.toBe("legacy.survey");
  });

  it("does not route any universal action through a legacy event id", () => {
    expect(universalActions.every((action) => !action.event_id.startsWith("legacy."))).toBe(true);
  });

  it("rejects retired universal action ids and legacy event ids at the schema boundary", () => {
    const ajv = new Ajv2020({ allErrors: true });
    const validate = ajv.compile(universalActionsSchema);

    expect(
      validate({
        universal_actions: [
          {
            id: "universal:gather",
            category: "universal",
            label: "采集当前区域",
            conditions: [],
            event_id: "system.generic_gather",
          },
        ],
      }),
    ).toBe(false);

    expect(
      validate({
        universal_actions: [
          {
            id: "universal:move",
            category: "universal",
            label: "移动到指定区域",
            conditions: [],
            event_id: "legacy.move",
          },
        ],
      }),
    ).toBe(false);
  });
});
