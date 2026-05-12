import { describe, expect, it } from "vitest";

import type { FeatureFootprint, MapFeatureDefinition } from "./content/contentData";
import {
  buildFeatureTileIndex,
  getFeaturesAtTile,
  getInvestigatableFeaturesAtTile,
  getVisibleFeaturesAtTile,
  selectTopInvestigatableFeatures,
  type MapFeatureQueryConfig,
  type MapFeatureRuntimeMapState,
} from "./mapFeatureSystem";

function rowSpan(row: number, colStart: number, colEnd = colStart): FeatureFootprint {
  return {
    type: "row_spans",
    spans: [{ row, colStart, colEnd }],
  };
}

function passiveFeature(
  overrides: Pick<MapFeatureDefinition, "id"> &
    Partial<Pick<MapFeatureDefinition, "name" | "kind" | "priority" | "visibility" | "footprint">>,
): MapFeatureDefinition {
  return {
    id: overrides.id,
    name: overrides.name ?? overrides.id,
    kind: overrides.kind ?? "test:feature",
    priority: overrides.priority ?? 10,
    visibility: overrides.visibility ?? "always",
    footprint: overrides.footprint ?? rowSpan(2, 2),
  };
}

function investigatableFeature(
  overrides: Pick<MapFeatureDefinition, "id"> &
    Partial<Pick<MapFeatureDefinition, "name" | "kind" | "priority" | "visibility" | "footprint">>,
): MapFeatureDefinition {
  return {
    ...passiveFeature(overrides),
    investigatable: true,
    status_options: ["unknown", "resolved"],
    initial_status: "unknown",
    actions: [],
  };
}

function createConfig(features: MapFeatureDefinition[]): MapFeatureQueryConfig {
  return {
    size: { rows: 4, cols: 4 },
    tiles: Array.from({ length: 4 }, (_, rowIndex) =>
      Array.from({ length: 4 }, (_, colIndex) => ({
        id: `${rowIndex + 1}-${colIndex + 1}`,
        row: rowIndex + 1,
        col: colIndex + 1,
      })),
    ).flat(),
    features,
  };
}

function runtime(overrides: Partial<MapFeatureRuntimeMapState> = {}): MapFeatureRuntimeMapState {
  return {
    discoveredTileIds: [],
    tilesById: {},
    featuresById: {},
    ...overrides,
  };
}

function ids(features: MapFeatureDefinition[]): string[] {
  return features.map((feature) => feature.id);
}

describe("mapFeatureSystem", () => {
  it("expands row_spans footprints so every covered tile returns the feature", () => {
    const feature = passiveFeature({
      id: "ice_field",
      footprint: {
        type: "row_spans",
        spans: [
          { row: 2, colStart: 1, colEnd: 3 },
          { row: 3, colStart: 2, colEnd: 4 },
        ],
      },
    });
    const config = createConfig([feature]);
    const index = buildFeatureTileIndex(config);

    expect(ids(getFeaturesAtTile(config, index, "2-1"))).toEqual(["ice_field"]);
    expect(ids(getFeaturesAtTile(config, index, "2-3"))).toEqual(["ice_field"]);
    expect(ids(getFeaturesAtTile(config, index, "3-2"))).toEqual(["ice_field"]);
    expect(ids(getFeaturesAtTile(config, index, "3-4"))).toEqual(["ice_field"]);
    expect(getFeaturesAtTile(config, index, "3-1")).toEqual([]);
  });

  it("sorts features covering the same tile by priority desc and id asc", () => {
    const config = createConfig([
      passiveFeature({ id: "zeta", priority: 20 }),
      passiveFeature({ id: "low", priority: 5 }),
      passiveFeature({ id: "alpha", priority: 20 }),
    ]);
    const index = buildFeatureTileIndex(config);

    expect(ids(getFeaturesAtTile(config, index, "2-2"))).toEqual(["alpha", "zeta", "low"]);
  });

  it("returns empty results for unknown tile ids, empty footprints, and invalid spans without throwing", () => {
    const config = createConfig([
      passiveFeature({ id: "empty", footprint: { type: "row_spans", spans: [] } }),
      passiveFeature({
        id: "invalid",
        footprint: { type: "row_spans", spans: [{ row: 1, colStart: 3, colEnd: 1 }] },
      }),
    ]);

    expect(() => buildFeatureTileIndex(config)).not.toThrow();
    const index = buildFeatureTileIndex(config);

    expect(getFeaturesAtTile(config, index, "1-1")).toEqual([]);
    expect(getFeaturesAtTile(config, index, "bad-id")).toEqual([]);
    expect(getFeaturesAtTile(config, index, "9-9")).toEqual([]);
  });

  it("filters visible features from tile discovery, investigation, and explicit feature reveal state", () => {
    const config = createConfig([
      passiveFeature({ id: "always", visibility: "always" }),
      passiveFeature({ id: "on-discovered", visibility: "onDiscovered" }),
      passiveFeature({ id: "on-investigated", visibility: "onInvestigated" }),
      passiveFeature({ id: "hidden", visibility: "hidden" }),
    ]);
    const index = buildFeatureTileIndex(config);

    expect(ids(getVisibleFeaturesAtTile(config, index, runtime(), "2-2"))).toEqual(["always"]);
    expect(
      ids(
        getVisibleFeaturesAtTile(
          config,
          index,
          runtime({
            discoveredTileIds: ["2-2"],
            tilesById: { "2-2": { investigated: true } },
            featuresById: { hidden: { id: "hidden", revealed: true } },
          }),
          "2-2",
        ),
      ),
    ).toEqual(["always", "hidden", "on-discovered", "on-investigated"]);
  });

  it("filters investigatable features after visibility is applied", () => {
    const config = createConfig([
      passiveFeature({ id: "passive", priority: 30 }),
      investigatableFeature({ id: "repair", priority: 20 }),
      investigatableFeature({ id: "hidden-investigation", priority: 40, visibility: "hidden" }),
    ]);
    const index = buildFeatureTileIndex(config);

    expect(ids(getInvestigatableFeaturesAtTile(config, index, runtime(), "2-2"))).toEqual(["repair"]);
    expect(
      ids(
        getInvestigatableFeaturesAtTile(
          config,
          index,
          runtime({ featuresById: { "hidden-investigation": { id: "hidden-investigation", revealed: true } } }),
          "2-2",
        ),
      ),
    ).toEqual(["hidden-investigation", "repair"]);
  });

  it("selects only highest-priority investigatable feature candidates", () => {
    const candidates = [
      passiveFeature({ id: "passive-high", priority: 100 }),
      investigatableFeature({ id: "zeta", priority: 30 }),
      investigatableFeature({ id: "low", priority: 10 }),
      investigatableFeature({ id: "alpha", priority: 30 }),
    ];

    expect(ids(selectTopInvestigatableFeatures(candidates))).toEqual(["alpha", "zeta"]);
  });
});
