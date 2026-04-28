import { describe, expect, it } from "vitest";
import type { eventContentLibrary } from "./contentData";

type JsonModule<T> = T | { default: T };

describe("event content exports", () => {
  it("aggregates event definitions, call templates, and presets from content globs", async () => {
    const contentData = (await import("./contentData")) as unknown as {
      eventContentLibrary: typeof eventContentLibrary;
    };
    const definitionModules = import.meta.glob("../../../../content/events/definitions/*.json", { eager: true }) as Record<
      string,
      JsonModule<{ event_definitions: unknown[] }>
    >;
    const callTemplateModules = import.meta.glob("../../../../content/events/call_templates/*.json", { eager: true }) as Record<
      string,
      JsonModule<{ call_templates: unknown[] }>
    >;
    const presetModules = import.meta.glob("../../../../content/events/presets/*.json", { eager: true }) as Record<
      string,
      JsonModule<{ presets: unknown[] }>
    >;

    expect(contentData.eventContentLibrary.event_definitions).toHaveLength(collectContentArray(definitionModules, "event_definitions").length);
    expect(contentData.eventContentLibrary.call_templates).toHaveLength(collectContentArray(callTemplateModules, "call_templates").length);
    expect(contentData.eventContentLibrary.presets).toHaveLength(collectContentArray(presetModules, "presets").length);
    expect(contentData.eventContentLibrary.handlers.length).toBeGreaterThan(0);
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

function collectContentArray<T extends string>(modules: Record<string, JsonModule<Record<T, unknown[]>>>, key: T) {
  return Object.values(modules).flatMap((module) => ("default" in module ? module.default : module)[key]);
}
