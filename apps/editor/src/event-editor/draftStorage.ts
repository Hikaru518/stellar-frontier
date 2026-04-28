import type { EditorEventAsset } from "./types";

const DRAFT_STORAGE_PREFIX = "stellar-frontier:event-editor:draft:v1";

export function buildDraftStorageKey(asset: Pick<EditorEventAsset<unknown>, "asset_type" | "id" | "file_path" | "base_hash">): string {
  return [
    DRAFT_STORAGE_PREFIX,
    asset.asset_type,
    encodeURIComponent(asset.id),
    encodeURIComponent(asset.file_path),
    asset.base_hash,
  ].join(":");
}

export function saveDraft<T>(asset: EditorEventAsset<unknown>, draft: T): void {
  getStorage()?.setItem(buildDraftStorageKey(asset), JSON.stringify(draft));
}

export function clearDraft(asset: EditorEventAsset<unknown>): void {
  getStorage()?.removeItem(buildDraftStorageKey(asset));
}

export function loadDraft<T>(asset: EditorEventAsset<unknown>): T | null {
  const storage = getStorage();
  const key = buildDraftStorageKey(asset);
  const rawDraft = storage?.getItem(key);

  if (!rawDraft) {
    return null;
  }

  try {
    return JSON.parse(rawDraft) as T;
  } catch {
    storage?.removeItem(key);
    return null;
  }
}

function getStorage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}
