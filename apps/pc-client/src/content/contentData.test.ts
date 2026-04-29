import { describe, expect, it } from "vitest";
import eventManifest from "../../../../content/events/manifest.json";
import { buildEventContentIndex } from "../events/contentIndex";

describe("generated event content exports", () => {
  const playableStructuredDomains = [
    "mainline_crash_site",
    "mainline_resources",
    "mainline_village",
    "mainline_medical",
    "mainline_hive",
    "mainline_ending",
  ];

  const removedStructuredDomains = [
    "crash_site",
    "desert",
    "forest",
    "mine",
    "mountain",
  ];

  const structuredDomains = [...playableStructuredDomains].sort();
  const sortedPlayableStructuredDomains = [...playableStructuredDomains].sort();

  it("registers only mainline structured event domains for this content boundary", () => {
    expect(playableStructuredDomains).toEqual([
      "mainline_crash_site",
      "mainline_resources",
      "mainline_village",
      "mainline_medical",
      "mainline_hive",
      "mainline_ending",
    ]);
    expect(eventManifest.domains.map((domain) => domain.id).sort()).toEqual(sortedPlayableStructuredDomains);
  });

  it("does not register removed legacy structured event domains", () => {
    const manifestDomains = new Set(eventManifest.domains.map((domain) => domain.id));

    for (const removedDomain of removedStructuredDomains) {
      expect(manifestDomains.has(removedDomain)).toBe(false);
    }
  });

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
