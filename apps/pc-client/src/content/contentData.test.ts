import { describe, expect, it } from "vitest";
import type { CallActionDef, eventContentLibrary } from "./contentData";

type JsonModule<T> = T | { default: T };

describe("call-actions content exports", () => {
  it("exports typed call actions from basic and object content", async () => {
    const contentData = (await import("./contentData")) as unknown as {
      callActionsContent?: CallActionDef[];
    };

    expect(contentData.callActionsContent?.map((action) => action.id)).toEqual(
      expect.arrayContaining(["survey", "move", "standby", "stop", "gather", "build", "extract", "scan"]),
    );
    expect(contentData.callActionsContent?.find((action) => action.id === "stop")).toMatchObject({
      category: "universal",
      availableWhenBusy: true,
    });
    expect(contentData.callActionsContent?.filter((action) => action.category === "object_action")).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "gather", applicableObjectKinds: expect.any(Array) })]),
    );
  });
});

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

function collectContentArray<T extends string>(modules: Record<string, JsonModule<Record<T, unknown[]>>>, key: T) {
  return Object.values(modules).flatMap((module) => ("default" in module ? module.default : module)[key]);
}
