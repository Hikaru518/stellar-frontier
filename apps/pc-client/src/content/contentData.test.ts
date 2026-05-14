import fs from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import eventManifest from "../../../../content/events/manifest.json";
import defaultMapJson from "../../../../content/maps/default-map.json";
import defaultMapRadarJson from "../../../../content/maps/ascii/default-map-radar.json";
import mapRadarSchema from "../../../../content/schemas/map-radar.schema.json";
import mapsSchema from "../../../../content/schemas/maps.schema.json";
import { buildEventContentIndex } from "../events/contentIndex";
import type { CallTemplate, EventDefinition, PresetDefinition } from "../events/types";
import * as contentData from "./contentData";

const repoRoot = path.resolve(process.cwd(), "../..");

interface EventManifest {
  schema_version: string;
  domains: Array<{
    id: string;
    definitions: string;
    call_templates: string;
    presets: string | null;
  }>;
}

interface EventDefinitionsContent {
  event_definitions: EventDefinition[];
}

interface CallTemplatesContent {
  call_templates: CallTemplate[];
}

interface PresetsContent {
  presets: PresetDefinition[];
}

const typedEventManifest = eventManifest as EventManifest;

function readEventManifestJson<T>(manifestPath: string): T {
  const filePath = path.join(repoRoot, "content/events", manifestPath);
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function expectedDefinitionsFromManifest(): EventDefinition[] {
  return typedEventManifest.domains.flatMap(
    (domain) => readEventManifestJson<EventDefinitionsContent>(domain.definitions).event_definitions,
  );
}

function expectedCallTemplatesFromManifest(): CallTemplate[] {
  return typedEventManifest.domains.flatMap(
    (domain) => readEventManifestJson<CallTemplatesContent>(domain.call_templates).call_templates,
  );
}

function expectedPresetsFromManifest(): PresetDefinition[] {
  return typedEventManifest.domains.flatMap((domain) =>
    domain.presets ? readEventManifestJson<PresetsContent>(domain.presets).presets : [],
  );
}

describe("event content exports", () => {
  it("tracks every authored structured event domain in the manifest", () => {
    expect(eventManifest.schema_version).toBe("event-manifest.v1");
    expect(new Set(typedEventManifest.domains.map((domain) => domain.id)).size).toBe(typedEventManifest.domains.length);
  });

  it("loads structured event runtime content from manifest-backed Vite globs", () => {
    const contentDataSource = fs.readFileSync(path.join(repoRoot, "apps/pc-client/src/content/contentData.ts"), "utf8");

    expect(contentDataSource).toContain('import eventManifest from "../../../../content/events/manifest.json"');
    expect(contentDataSource).toContain('import.meta.glob("../../../../content/events/definitions/*.json"');
    expect(contentDataSource).toContain('import.meta.glob("../../../../content/events/call_templates/*.json"');
    expect(contentDataSource).toContain('import.meta.glob("../../../../content/events/presets/*.json"');
    expect(contentDataSource).not.toContain("./generated/eventContentManifest");
    expect(contentDataSource).not.toContain("generatedEvent");
    expect(contentDataSource).not.toContain("drafts");
  });

  it("exposes authored definitions, call templates, handlers, and presets through eventContentLibrary", async () => {
    const expectedDomainIds = typedEventManifest.domains.map((domain) => domain.id);
    const expectedEventDefinitions = expectedDefinitionsFromManifest();
    const expectedCallTemplates = expectedCallTemplatesFromManifest();
    const expectedPresets = expectedPresetsFromManifest();

    expect(contentData.eventContentLibrary.domains).toEqual(expectedDomainIds);
    expect(contentData.eventProgramDefinitions).toEqual(expectedEventDefinitions);
    expect(contentData.callTemplates).toEqual(expectedCallTemplates);
    expect(contentData.presetDefinitions).toEqual(expectedPresets);
    expect(contentData.eventContentLibrary.event_definitions).toBe(contentData.eventProgramDefinitions);
    expect(contentData.eventContentLibrary.call_templates).toBe(contentData.callTemplates);
    expect(contentData.eventContentLibrary.presets).toBe(contentData.presetDefinitions);
    expect(new Set(contentData.eventProgramDefinitions.map((definition) => definition.domain))).toEqual(new Set(expectedDomainIds));
    expect(new Set(contentData.callTemplates.map((template) => template.domain))).toEqual(new Set(expectedDomainIds));
    expect(Array.isArray(contentData.eventContentLibrary.handlers)).toBe(true);

    const indexResult = buildEventContentIndex(contentData.eventContentLibrary);
    expect(indexResult.errors).toEqual([]);
    expect(indexResult.index.definitionsByDomain.size).toBe(expectedDomainIds.length);
    expect(indexResult.index.presetsById.size).toBe(expectedPresets.length);
  });

  it("does not expose unsupported crew references in structured event content", async () => {
    const supportedCrewIds = new Set<string>(contentData.crewDefinitions.map((member) => member.crewId));
    const referencedCrewIds = contentData.eventProgramDefinitions.flatMap((definition) =>
      [...(definition.content_refs?.crew_ids ?? []), ...definition.sample_contexts.map((context) => context.crew_id)].filter(
        (crewId): crewId is string => typeof crewId === "string",
      ),
    );

    expect(referencedCrewIds.every((crewId) => supportedCrewIds.has(crewId))).toBe(true);
  });

  it("does not expose removed event content exports", async () => {
    expect("eventDefinitions" in contentData).toBe(false);
    expect("eventDefinitionById" in contentData).toBe(false);
  });
});

describe("default map config", () => {
  it("exposes seeded feature content for the default crash site", async () => {
    const rawFeatures = (defaultMapJson as { features?: unknown }).features;
    expect(Array.isArray(rawFeatures)).toBe(true);

    const features = contentData.defaultMapConfig.features;
    const featureIds = features.map((feature) => feature.id);
    const legacyIafsObjectIds = [
      "iafs_generator",
      "iafs_life_support",
      "iafs_shuttle_core",
      "iafs_scattered_supplies",
    ];

    expect(features.some((feature) => feature.investigatable !== true)).toBe(true);
    expect(features.some((feature) => feature.investigatable === true)).toBe(true);
    expect(featureIds).toEqual(expect.arrayContaining(legacyIafsObjectIds));

    for (const feature of features) {
      for (const span of feature.footprint.spans) {
        expect(span.row).toBeGreaterThanOrEqual(1);
        expect(span.row).toBeLessThanOrEqual(contentData.defaultMapConfig.size.rows);
        expect(span.colStart).toBeGreaterThanOrEqual(1);
        expect(span.colStart).toBeLessThanOrEqual(contentData.defaultMapConfig.size.cols);
        expect(span.colEnd).toBeGreaterThanOrEqual(span.colStart);
        expect(span.colEnd).toBeLessThanOrEqual(contentData.defaultMapConfig.size.cols);
      }
    }
  });

  it("types passive and investigatable map features separately", async () => {
    const passiveFeature: contentData.MapFeatureDefinition = {
      id: "snowfield",
      name: "雪原",
      kind: "biome:snowfield",
      priority: 10,
      visibility: "always",
      footprint: {
        type: "row_spans",
        spans: [{ row: 129, colStart: 129, colEnd: 132 }],
      },
    };

    const investigatableFeature: contentData.MapFeatureDefinition = {
      id: "distress_beacon",
      name: "异常信标",
      kind: "signal:distress",
      priority: 90,
      tags: ["signal"],
      visibility: "onDiscovered",
      footprint: {
        type: "row_spans",
        spans: [{ row: 130, colStart: 130, colEnd: 130 }],
      },
      investigatable: true,
      status_options: ["unread", "decoded"],
      initial_status: "unread",
      actions: [
        {
          id: "distress_beacon:decode",
          category: "feature",
          label: "解析信标",
          conditions: [],
        },
      ],
    };

    expect(passiveFeature.investigatable).toBeUndefined();
    expect(investigatableFeature.investigatable).toBe(true);
    if (investigatableFeature.investigatable !== true) {
      throw new Error("Expected investigatable feature fixture to narrow to the investigatable shape.");
    }
    expect(investigatableFeature.actions[0].category).toBe("feature");
  });

  it("does not expose legacy tile area/object gameplay fields", async () => {
    const tileSchema = (mapsSchema as { $defs: { tile: { required: string[]; properties: Record<string, unknown> } } }).$defs.tile;
    expect(tileSchema.required).not.toEqual(expect.arrayContaining(["areaName", "objectIds"]));
    expect(tileSchema.properties).not.toHaveProperty("areaName");
    expect(tileSchema.properties).not.toHaveProperty("objectIds");

    expect(contentData.defaultMapConfig.tiles.length).toBeGreaterThan(0);
    const sampleTiles = [
      contentData.defaultMapConfig.tiles[0],
      contentData.defaultMapConfig.tiles.find((tile) => tile.id === "129-129"),
      contentData.defaultMapConfig.tiles[contentData.defaultMapConfig.tiles.length - 1],
    ];

    for (const tile of sampleTiles) {
      if (!tile) {
        throw new Error("Expected sampled map tile to exist.");
      }
      expect("areaName" in tile).toBe(false);
      expect("objectIds" in tile).toBe(false);
      expect("objects" in tile).toBe(false);
    }
  });

  it("types split radar presentation rows on MapConfigDefinition", async () => {
    expect(defaultMapJson.radarPath).toBe("content/maps/ascii/default-map-radar.json");
    expect(contentData.defaultMapConfig.radar.world).toMatchObject({ width: 256, height: 256, origin: { x: 128, y: 128 } });
    expect(contentData.defaultMapConfig.radar.glyphRows).toHaveLength(256);
    expect(contentData.defaultMapConfig.radar.toneRows).toHaveLength(256);
  });
});

describe("map radar content contracts", () => {
  const ajv = new Ajv2020({ allErrors: true });
  const validateMap = ajv.compile(mapsSchema);
  const validateRadar = ajv.compile(mapRadarSchema);

  it("accepts authored split radar rows with palette-backed tones", () => {
    expect(validateMap(defaultMapJson)).toBe(true);
    expect(validateRadar(defaultMapRadarJson)).toBe(true);
    expect(defaultMapRadarJson.mapId).toBe(defaultMapJson.id);
  });

  it("rejects removed visual fields", () => {
    const mapWithVisualField = {
      ...structuredClone(defaultMapJson),
      visual: { layers: [] },
    };

    expect(validateMap(mapWithVisualField)).toBe(false);
    expect(validateMap.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keyword: "additionalProperties",
          params: expect.objectContaining({ additionalProperty: "visual" }),
        }),
      ]),
    );
  });
});

describe("crew content exports", () => {
  it("keeps runtime crew exports aligned with the authored baseline", async () => {
    const { initialCrew } = await import("../data/gameData");

    expect(contentData.crewDefinitions.map((member) => member.crewId)).toEqual(["mike", "simon", "alice"]);
    expect(initialCrew.map((member) => member.id)).toEqual(["mike", "simon", "alice"]);
  });

  it("does not expose unsupported crew summary copy", async () => {
    const { initialCrew } = await import("../data/gameData");

    for (const member of contentData.crewDefinitions) {
      expect("summary" in member).toBe(false);
    }

    for (const member of initialCrew) {
      expect("summary" in member).toBe(false);
    }
  });

  it("does not expose removed crew emergency fields", async () => {
    const removedEmergencyField = ["emergency", "Event"].join("");
    const removedEventStatus = ["in", "Event"].join("");

    for (const member of contentData.crewDefinitions) {
      expect(removedEmergencyField in member).toBe(false);
      expect(member.status).not.toBe(removedEventStatus);
    }
  });
});
