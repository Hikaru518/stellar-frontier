import fs from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import eventManifest from "../../../../content/events/manifest.json";
import defaultMapJson from "../../../../content/maps/default-map.json";
import tilesetRegistry from "../../../../content/maps/tilesets/registry.json";
import mapTilesetsSchema from "../../../../content/schemas/map-tilesets.schema.json";
import mapsSchema from "../../../../content/schemas/maps.schema.json";
import { buildEventContentIndex } from "../events/contentIndex";

const repoRoot = path.resolve(process.cwd(), "../..");

describe("generated event content exports", () => {
  const structuredDomains = [
    "crash_site",
    "desert",
    "forest",
    "mainline_crash_site",
    "mainline_ending",
    "mainline_hive",
    "mainline_medical",
    "mainline_resources",
    "mainline_village",
    "mine",
    "mountain",
  ];

  it("tracks every authored structured event domain in the manifest", () => {
    expect(eventManifest.schema_version).toBe("event-manifest.v1");
    expect(eventManifest.domains.map((domain) => domain.id).sort()).toEqual(structuredDomains);
  });

  it("exposes authored definitions, call templates, handlers, and presets through eventContentLibrary", async () => {
    const contentData = await import("./contentData");
    const generatedContent = await import("./generated/eventContentManifest");
    const eventContentLibrary = contentData.eventContentLibrary as typeof contentData.eventContentLibrary & {
      domains?: string[];
    };
    const generatedDomains = generatedContent as typeof generatedContent & {
      generatedEventDomains?: readonly string[];
    };

    expect(contentData.eventProgramDefinitions).toBe(generatedContent.generatedEventProgramDefinitions);
    expect(contentData.callTemplates).toBe(generatedContent.generatedCallTemplates);
    expect(contentData.presetDefinitions).toBe(generatedContent.generatedPresetDefinitions);
    expect(generatedDomains.generatedEventDomains).toEqual(structuredDomains);
    expect(eventContentLibrary.domains).toEqual(structuredDomains);

    expect(new Set(contentData.eventProgramDefinitions.map((definition) => definition.domain))).toEqual(
      new Set(structuredDomains),
    );
    expect(new Set(contentData.callTemplates.map((template) => template.domain))).toEqual(new Set(structuredDomains));
    expect(contentData.eventContentLibrary.handlers.length).toBeGreaterThan(0);

    const indexResult = buildEventContentIndex(contentData.eventContentLibrary);
    expect(indexResult.errors).toEqual([]);
    expect(indexResult.index.definitionsByDomain.size).toBe(structuredDomains.length);
    expect(indexResult.index.presetsById.size).toBe(generatedContent.generatedPresetDefinitions.length);
  });

  it("does not expose unsupported crew references in structured event content", async () => {
    const contentData = await import("./contentData");
    const supportedCrewIds = new Set(["mike", "amy", "garry"]);
    const referencedCrewIds = contentData.eventProgramDefinitions.flatMap((definition) =>
      [...(definition.content_refs?.crew_ids ?? []), ...definition.sample_contexts.map((context) => context.crew_id)].filter(
        (crewId): crewId is string => typeof crewId === "string",
      ),
    );

    expect(referencedCrewIds.every((crewId) => supportedCrewIds.has(crewId))).toBe(true);
  });

  it("does not expose removed event content exports", async () => {
    const contentData = await import("./contentData");

    expect("eventDefinitions" in contentData).toBe(false);
    expect("eventDefinitionById" in contentData).toBe(false);
  });
});

describe("default map config", () => {
  it("exposes tile.objectIds (post-migration) and no inline tile.objects field", async () => {
    const { defaultMapConfig } = await import("./contentData");
    expect(defaultMapConfig.tiles.length).toBeGreaterThan(0);
    for (const tile of defaultMapConfig.tiles) {
      expect(Array.isArray(tile.objectIds)).toBe(true);
      expect("objects" in tile).toBe(false);
    }
  });
});

describe("map visual content contracts", () => {
  const ajv = new Ajv2020({ allErrors: true });
  const validateMap = ajv.compile(mapsSchema);

  it("accepts authored visual layers with tile-id keyed cells", () => {
    const mapWithVisual = structuredClone(defaultMapJson) as typeof defaultMapJson & {
      visual: {
        layers: Array<{
          id: string;
          name: string;
          visible: boolean;
          locked: boolean;
          opacity: number;
          cells: Record<string, { tilesetId: string; tileIndex: number }>;
        }>;
      };
    };

    mapWithVisual.visual = {
      layers: [
        {
          id: "base",
          name: "Base",
          visible: true,
          locked: false,
          opacity: 1,
          cells: {
            "4-4": {
              tilesetId: "kenney-tiny-battle",
              tileIndex: 0,
            },
          },
        },
      ],
    };

    expect(validateMap(mapWithVisual)).toBe(true);
  });

  it("rejects unknown visual fields", () => {
    const mapWithUnknownVisualField = structuredClone(defaultMapJson) as typeof defaultMapJson & {
      visual: {
        layers: [];
        unknownVisualField: boolean;
      };
    };

    mapWithUnknownVisualField.visual = {
      layers: [],
      unknownVisualField: true,
    };

    expect(validateMap(mapWithUnknownVisualField)).toBe(false);
    expect(validateMap.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          instancePath: "/visual",
          keyword: "additionalProperties",
        }),
      ]),
    );
  });
});

describe("map tileset registry", () => {
  const ajv = new Ajv2020({ allErrors: true });
  const validateRegistry = ajv.compile(mapTilesetsSchema);

  it("registers the Kenney Tiny Battle packed spritesheet", () => {
    expect(validateRegistry(tilesetRegistry)).toBe(true);

    const kenneyTileset = tilesetRegistry.tilesets.find((tileset) => tileset.id === "kenney-tiny-battle");
    expect(kenneyTileset).toMatchObject({
      tileWidth: 16,
      tileHeight: 16,
      spacing: 0,
      columns: 18,
      tileCount: 198,
      publicPath: "maps/tilesets/kenney-tiny-battle/tilemap_packed.png",
    });
    expect(kenneyTileset).toBeDefined();

    const tileIndexes = kenneyTileset?.categories.flatMap((category) => category.tileIndexes) ?? [];
    expect(tileIndexes.length).toBeGreaterThan(0);
    expect(tileIndexes.every((tileIndex) => tileIndex >= 0 && tileIndex < 198)).toBe(true);
    expect(fs.existsSync(path.join(repoRoot, "apps/pc-client/public", kenneyTileset?.publicPath ?? ""))).toBe(true);
  });
});

describe("crew content exports", () => {
  it("only exposes the three supported runtime crew ids", async () => {
    const { crewDefinitions } = await import("./contentData");
    const { initialCrew } = await import("../data/gameData");

    expect(crewDefinitions.map((member) => member.crewId)).toEqual(["mike", "amy", "garry"]);
    expect(initialCrew.map((member) => member.id)).toEqual(["mike", "amy", "garry"]);
  });

  it("does not expose unsupported crew summary copy", async () => {
    const { crewDefinitions } = await import("./contentData");
    const { initialCrew } = await import("../data/gameData");

    for (const member of crewDefinitions) {
      expect("summary" in member).toBe(false);
    }

    for (const member of initialCrew) {
      expect("summary" in member).toBe(false);
    }
  });

  it("does not expose removed crew emergency fields", async () => {
    const { crewDefinitions } = await import("./contentData");
    const removedEmergencyField = ["emergency", "Event"].join("");
    const removedEventStatus = ["in", "Event"].join("");

    for (const member of crewDefinitions) {
      expect(removedEmergencyField in member).toBe(false);
      expect(member.status).not.toBe(removedEventStatus);
    }
  });
});
