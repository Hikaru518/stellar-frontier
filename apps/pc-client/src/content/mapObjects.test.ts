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

  it("excludes removed projection fields from the map object type", () => {
    expectTypeOf<MapObjectDefinition>().not.toHaveProperty(removedField("Resource"));
    expectTypeOf<MapObjectDefinition>().not.toHaveProperty(removedField("Building"));
    expectTypeOf<MapObjectDefinition>().not.toHaveProperty(removedField("Instrument"));
  });

  it("rejects removed projection fields at the schema boundary", () => {
    const ajv = new Ajv2020({ allErrors: true });
    const validateMapObjects = ajv.compile(mapObjectsSchema);
    const validateMaps = ajv.compile(mapsSchema);
    const removedResourceField = removedField("Resource");
    const removedDangerField = removedField("Danger");

    expect(
      validateMapObjects({
        map_objects: [
          {
            id: "removed_probe",
            kind: "resourceNode",
            name: "Removed Probe",
            visibility: "onDiscovered",
            status_options: ["intact"],
            initial_status: "intact",
            actions: [],
            [removedResourceField]: "iron_ore",
          },
        ],
      }),
    ).toBe(false);

    expect(
      validateMaps({
        id: "removed-map",
        name: "Removed Map",
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
                id: "removed_danger",
                name: "Removed Danger",
                visibility: "onDiscovered",
                severity: "low",
                startsActive: true,
                [removedDangerField]: "静电干扰",
              },
            ],
          },
        ],
      }),
    ).toBe(false);

    const serializedSchemas = JSON.stringify([mapObjectsSchema, mapsSchema]);
    expect(serializedSchemas).not.toContain(removedField("Resource"));
    expect(serializedSchemas).not.toContain(removedField("Building"));
    expect(serializedSchemas).not.toContain(removedField("Instrument"));
    expect(serializedSchemas).not.toContain(removedField("Danger"));
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

  it("rejects retired universal action ids and removed event ids at the schema boundary", () => {
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
  return [removedPrefix(), verb].join(".");
}

function isRetiredEventId(eventId: string) {
  return eventId.startsWith(`${retiredEventId("")}`);
}

function removedField(suffix: string) {
  return `${removedPrefix()}${suffix}`;
}

function removedPrefix() {
  return ["leg", "acy"].join("");
}
