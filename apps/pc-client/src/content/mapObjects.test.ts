import Ajv2020 from "ajv/dist/2020";
import { describe, expect, expectTypeOf, it } from "vitest";
import mapObjectsSchema from "../../../../content/schemas/map-objects.schema.json";
import mapsSchema from "../../../../content/schemas/maps.schema.json";
import universalActionsSchema from "../../../../content/schemas/universal-actions.schema.json";
import {
  getMapObjectDefinition,
  mapObjectDefinitionById,
  type MapObjectDefinition,
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

  it("excludes legacy projection fields from the map object type", () => {
    expectTypeOf<MapObjectDefinition>().not.toHaveProperty("legacyResource");
    expectTypeOf<MapObjectDefinition>().not.toHaveProperty("legacyBuilding");
    expectTypeOf<MapObjectDefinition>().not.toHaveProperty("legacyInstrument");
  });

  it("rejects legacy projection fields at the schema boundary", () => {
    const ajv = new Ajv2020({ allErrors: true });
    const validateMapObjects = ajv.compile(mapObjectsSchema);
    const validateMaps = ajv.compile(mapsSchema);

    expect(
      validateMapObjects({
        map_objects: [
          {
            id: "legacy_probe",
            kind: "resourceNode",
            name: "Legacy Probe",
            visibility: "onDiscovered",
            status_options: ["intact"],
            initial_status: "intact",
            actions: [],
            legacyResource: "iron_ore",
          },
        ],
      }),
    ).toBe(false);

    expect(
      validateMaps({
        id: "legacy-map",
        name: "Legacy Map",
        version: 1,
        size: { rows: 1, cols: 1 },
        originTileId: "1-1",
        initialDiscoveredTileIds: ["1-1"],
        tiles: [
          {
            id: "1-1",
            row: 1,
            col: 1,
            areaName: "Landing Zone",
            terrain: "平原",
            weather: "晴朗",
            environment: {
              temperatureCelsius: 20,
              humidityPercent: 50,
              magneticFieldMicroTesla: 40,
              radiationLevel: "low",
            },
            objectIds: [],
            specialStates: [
              {
                id: "legacy_danger",
                name: "Legacy Danger",
                visibility: "onDiscovered",
                severity: "low",
                startsActive: true,
                legacyDanger: "静电干扰",
              },
            ],
          },
        ],
      }),
    ).toBe(false);

    const serializedSchemas = JSON.stringify([mapObjectsSchema, mapsSchema]);
    expect(serializedSchemas).not.toContain("legacyResource");
    expect(serializedSchemas).not.toContain("legacyBuilding");
    expect(serializedSchemas).not.toContain("legacyInstrument");
    expect(serializedSchemas).not.toContain("legacyDanger");
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

  it("does not route current-area survey through a retired event id", () => {
    const survey = universalActions.find((action) => action.id === "universal:survey");
    expect(survey).toBeDefined();
    expect(survey?.event_id).not.toBe(retiredEventId("survey"));
  });

  it("does not route any universal action through a retired event id", () => {
    expect(universalActions.every((action) => !isRetiredEventId(action.event_id))).toBe(true);
  });

  it("does not route any map-object action through a retired event id", () => {
    const eventIds = mapObjectDefinitions.flatMap((definition) => definition.actions.map((action) => action.event_id));
    expect(eventIds.every((eventId) => !isRetiredEventId(eventId))).toBe(true);
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
            event_id: retiredEventId("move"),
          },
        ],
      }),
    ).toBe(false);
  });
});

function retiredEventId(verb: string) {
  return ["legacy", verb].join(".");
}

function isRetiredEventId(eventId: string) {
  return eventId.startsWith(`${retiredEventId("")}`);
}
