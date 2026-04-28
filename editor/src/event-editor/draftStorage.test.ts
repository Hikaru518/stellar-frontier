import { beforeEach, describe, expect, it } from "vitest";
import { buildDraftStorageKey, loadDraft, saveDraft } from "./draftStorage";
import type { EditorEventAsset } from "./types";

describe("event editor draft storage", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  it("stores and restores a draft for the same asset file and base hash", () => {
    const asset = createAsset({ base_hash: "base-a" });
    const draft = { id: "forest.signal", status: "draft", notes: "local edit" };

    saveDraft(asset, draft);

    expect(loadDraft(asset)).toEqual(draft);
    expect(window.localStorage.getItem(buildDraftStorageKey(asset))).toContain("local edit");
  });

  it("does not restore a draft when the base hash changes", () => {
    const originalAsset = createAsset({ base_hash: "base-a" });
    const changedAsset = createAsset({ base_hash: "base-b" });

    saveDraft(originalAsset, { id: "forest.signal", status: "draft", notes: "stale edit" });

    expect(loadDraft(changedAsset)).toBeNull();
  });

  it("uses asset id and file path in the key to avoid cross-file draft reuse", () => {
    const firstAsset = createAsset({ id: "forest.signal", file_path: "content/events/definitions/forest.json" });
    const secondAsset = createAsset({ id: "forest.signal", file_path: "content/events/definitions/cave.json" });

    expect(buildDraftStorageKey(firstAsset)).not.toBe(buildDraftStorageKey(secondAsset));
  });
});

function createAsset(overrides: Partial<EditorEventAsset<unknown>> = {}): EditorEventAsset<unknown> {
  return {
    id: "forest.signal",
    domain: "forest",
    asset_type: "event_definition",
    file_path: "content/events/definitions/forest.json",
    json_path: "$.event_definitions[0]",
    base_hash: "base-a",
    data: { id: "forest.signal", status: "ready" },
    editable: true,
    ...overrides,
  };
}

function installMemoryLocalStorage(): void {
  const values = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
      key: (index: number) => Array.from(values.keys())[index] ?? null,
      get length() {
        return values.size;
      },
    } satisfies Storage,
  });
}
