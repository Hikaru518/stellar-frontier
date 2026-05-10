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
import type { CallTemplate, EventDefinition, PresetDefinition } from "../events/types";
import type { MapConfigDefinition } from "./contentData";

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
    const contentData = await import("./contentData");
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
    const contentData = await import("./contentData");
    const supportedCrewIds = new Set<string>((await import("./contentData")).crewDefinitions.map((member) => member.crewId));
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

  it("types authored visual layers on MapConfigDefinition", () => {
    const mapWithVisual: MapConfigDefinition = {
      ...(structuredClone(defaultMapJson) as MapConfigDefinition),
      visual: {
        layers: [
          {
            id: "base",
            name: "Base",
            visible: true,
            locked: false,
            opacity: 0.75,
            cells: {
              "4-4": {
                tilesetId: "kenney-tiny-battle",
                tileIndex: 12,
              },
            },
          },
        ],
      },
    };

    expect(mapWithVisual.visual?.layers[0]).toMatchObject({
      id: "base",
      opacity: 0.75,
      cells: { "4-4": { tilesetId: "kenney-tiny-battle", tileIndex: 12 } },
    });
  });
});

describe("map visual content contracts", () => {
  const ajv = new Ajv2020({ allErrors: true });
  const validateMap = ajv.compile(mapsSchema);

  it("accepts authored visual layers with tile-id keyed cells", () => {
    const mapWithVisual = structuredClone(defaultMapJson) as MapConfigDefinition;

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
    const mapWithUnknownVisualField = structuredClone(defaultMapJson) as unknown as MapConfigDefinition & {
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
  it("keeps runtime crew exports aligned with the authored baseline", async () => {
    const { crewDefinitions } = await import("./contentData");
    const { initialCrew } = await import("../data/gameData");

    expect(crewDefinitions.map((member) => member.crewId)).toEqual(["mike"]);
    expect(initialCrew.map((member) => member.id)).toEqual(["mike"]);
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
