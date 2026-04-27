import type { Id } from "./types";

export interface WeightedBranch {
  id: Id;
  weight: number;
}

export interface WeightedPickResult<TBranch extends WeightedBranch> {
  branch: TBranch | null;
  roll: number;
  seed: string;
}

export function stableRandom(seed: string): number {
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) / 0x100000000;
}

export function pickWeightedBranch<TBranch extends WeightedBranch>(
  branches: TBranch[],
  seed: string,
): WeightedPickResult<TBranch> {
  const weightedBranches = branches.filter((branch) => branch.weight > 0);
  const totalWeight = weightedBranches.reduce((total, branch) => total + branch.weight, 0);
  const roll = stableRandom(seed);

  if (totalWeight <= 0) {
    return { branch: null, roll, seed };
  }

  let cursor = roll * totalWeight;
  for (const branch of weightedBranches) {
    cursor -= branch.weight;
    if (cursor < 0) {
      return { branch, roll, seed };
    }
  }

  return { branch: weightedBranches[weightedBranches.length - 1] ?? null, roll, seed };
}
