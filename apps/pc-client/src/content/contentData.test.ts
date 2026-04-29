import { describe, expect, it } from "vitest";
import eventManifest from "../../../../content/events/manifest.json";
import { buildEventContentIndex } from "../events/contentIndex";

describe("generated event content exports", () => {
  const structuredDomains = [
    "crash_site",
    "crew_kael",
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
});

describe("default map config", () => {
  it("exposes tile.objectIds (post-migration) and no legacy tile.objects field", async () => {
    const { defaultMapConfig } = await import("./contentData");
    expect(defaultMapConfig.tiles.length).toBeGreaterThan(0);
    for (const tile of defaultMapConfig.tiles) {
      expect(Array.isArray(tile.objectIds)).toBe(true);
      // The legacy `tile.objects` projection must be gone — Task 3 deleted it.
      expect("objects" in tile).toBe(false);
    }
  });
});
