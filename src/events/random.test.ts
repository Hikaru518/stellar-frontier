import { describe, expect, it } from "vitest";
import { pickWeightedBranch, stableRandom } from "./random";

describe("deterministic event random helper", () => {
  it("returns the same roll for the same seed", () => {
    const first = stableRandom("evt_1:random_outcome");
    const second = stableRandom("evt_1:random_outcome");

    expect(first).toBe(second);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(1);
  });

  it("picks a weighted branch deterministically from the seed", () => {
    const branches = [
      { id: "low", weight: 1 },
      { id: "high", weight: 3 },
    ];

    const first = pickWeightedBranch(branches, "evt_1:random_outcome");
    const second = pickWeightedBranch(branches, "evt_1:random_outcome");

    expect(first).toEqual(second);
    expect(first.branch?.id).toBeDefined();
    expect(first.roll).toBeGreaterThanOrEqual(0);
    expect(first.roll).toBeLessThan(1);
  });
});
