import type { EditorEventAsset, EventEditorLibraryResponse } from "./types";

export interface EventBrowserFilters {
  domain?: string;
  assetType?: string;
  trigger?: string;
  handler?: string;
  query?: string;
}

export interface EventBrowserItem {
  asset: EditorEventAsset<unknown>;
  trigger: string | null;
  handlers: string[];
  linkedCallTemplateIds: string[];
  eventDefinitionId: string | null;
  nodeId: string | null;
  searchText: string;
}

export function buildEventBrowserItems(library: EventEditorLibraryResponse): EventBrowserItem[] {
  const callTemplates = library.call_templates as EditorEventAsset<unknown>[];
  const assets: EditorEventAsset<unknown>[] = [
    ...(library.definitions as EditorEventAsset<unknown>[]),
    ...callTemplates,
    ...library.presets,
    ...library.handlers,
  ];

  return assets.map((asset) => {
    const eventDefinitionId = readString(asset.data, "event_definition_id");
    const nodeId = readString(asset.data, "node_id");
    const linkedCallTemplateIds =
      asset.asset_type === "event_definition"
        ? callTemplates.filter((template) => getCallTemplateDefinitionId(template) === asset.id).map((template) => template.id)
        : [];
    const trigger = readNestedString(asset.data, ["trigger", "type"]);
    const handlers = extractStringValuesByKey(asset.data, "handler_type");

    return {
      asset,
      trigger,
      handlers,
      linkedCallTemplateIds,
      eventDefinitionId,
      nodeId,
      searchText: buildSearchText(asset, { trigger, handlers, linkedCallTemplateIds, eventDefinitionId, nodeId }),
    };
  });
}

export function filterEventBrowserItems(items: EventBrowserItem[], filters: EventBrowserFilters): EventBrowserItem[] {
  const query = normalize(filters.query ?? "");

  return items.filter((item) => {
    if (filters.domain && item.asset.domain !== filters.domain) {
      return false;
    }

    if (filters.assetType && item.asset.asset_type !== filters.assetType) {
      return false;
    }

    if (filters.trigger && item.trigger !== filters.trigger) {
      return false;
    }

    if (filters.handler && !item.handlers.includes(filters.handler)) {
      return false;
    }

    return query.length === 0 || item.searchText.includes(query);
  });
}

export function getBrowserItemKey(item: EventBrowserItem): string {
  return `${item.asset.asset_type}:${item.asset.file_path}:${item.asset.id}`;
}

function getCallTemplateDefinitionId(template: EditorEventAsset<unknown>): string | null {
  return readString(template.data, "event_definition_id");
}

function buildSearchText(
  asset: EditorEventAsset<unknown>,
  metadata: {
    trigger: string | null;
    handlers: string[];
    linkedCallTemplateIds: string[];
    eventDefinitionId: string | null;
    nodeId: string | null;
  },
): string {
  const textParts = [
    asset.id,
    asset.domain,
    asset.asset_type,
    asset.file_path,
    readString(asset.data, "title"),
    readString(asset.data, "summary"),
    metadata.trigger,
    metadata.eventDefinitionId,
    metadata.nodeId,
    ...metadata.handlers,
    ...metadata.linkedCallTemplateIds,
  ];

  return normalize(textParts.filter((part): part is string => Boolean(part)).join(" "));
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function readString(value: unknown, key: string): string | null {
  if (!isRecord(value)) {
    return null;
  }

  const candidate = value[key];
  return typeof candidate === "string" ? candidate : null;
}

function readNestedString(value: unknown, path: string[]): string | null {
  let current = value;

  for (const key of path) {
    if (!isRecord(current)) {
      return null;
    }
    current = current[key];
  }

  return typeof current === "string" ? current : null;
}

function extractStringValuesByKey(value: unknown, key: string): string[] {
  const values = new Set<string>();
  collectStringValuesByKey(value, key, values);
  return Array.from(values).sort();
}

function collectStringValuesByKey(value: unknown, key: string, values: Set<string>): void {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectStringValuesByKey(entry, key, values));
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (entryKey === key && typeof entryValue === "string") {
      values.add(entryValue);
    }
    collectStringValuesByKey(entryValue, key, values);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
