import { describe, expect, it } from "vitest";
import { defaultMapConfig } from "../content/contentData";
import { getFeatureRuntimeStatus } from "../mapSystem";
import { createInitialMapState } from "./gameData";

describe("createInitialMapState", () => {
  it("populates map.featuresById for investigatable features, using initial_status", () => {
    const map = createInitialMapState();
    const featuresById = map.featuresById ?? {};
    const investigatableFeatures = defaultMapConfig.features.filter((feature) => feature.investigatable === true);

    expect(Object.keys(featuresById).sort()).toEqual(investigatableFeatures.map((feature) => feature.id).sort());

    for (const definition of investigatableFeatures) {
      const entry = featuresById[definition.id];
      expect(entry).toBeDefined();
      expect(entry?.id).toBe(definition.id);
      expect(entry?.status).toBe(definition.initial_status);
    }
  });

  it("falls back to a feature initial_status when runtime state is missing", () => {
    const feature = defaultMapConfig.features.find((definition) => definition.id === "iafs_generator");
    if (!feature || feature.investigatable !== true) {
      throw new Error("iafs_generator investigatable feature fixture is missing");
    }

    const map = createInitialMapState();
    const { [feature.id]: _removed, ...featuresById } = map.featuresById ?? {};

    expect(getFeatureRuntimeStatus({ ...map, featuresById }, feature)).toBe(feature.initial_status);
  });
});
