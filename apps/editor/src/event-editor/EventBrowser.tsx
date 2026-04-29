import { useMemo, useState } from "react";
import {
  buildEventBrowserItems,
  filterEventBrowserItems,
  getBrowserItemKey,
  type EventBrowserFilters,
  type EventBrowserItem,
} from "./eventFilters";
import type { EditorEventAsset, EventEditorLibraryResponse } from "./types";

interface EventBrowserProps {
  library: EventEditorLibraryResponse;
  selectedAsset: EditorEventAsset<unknown> | null;
  onSelectAsset: (asset: EditorEventAsset<unknown>) => void;
}

const ASSET_TYPE_OPTIONS = [
  { value: "event_definition", label: "Definitions" },
  { value: "call_template", label: "Call templates" },
];

export default function EventBrowser({ library, selectedAsset, onSelectAsset }: EventBrowserProps) {
  const [filters, setFilters] = useState<Required<EventBrowserFilters>>({
    domain: "",
    assetType: "",
    trigger: "",
    handler: "",
    query: "",
  });

  const items = useMemo(() => buildEventBrowserItems(library), [library]);
  const filteredItems = useMemo(() => filterEventBrowserItems(items, filters), [filters, items]);
  const domains = useMemo(() => uniqueSorted(items.map((item) => item.asset.domain)), [items]);
  const triggers = useMemo(() => uniqueSorted(items.map((item) => item.trigger).filter(isPresent)), [items]);
  const handlers = useMemo(() => uniqueSorted(items.flatMap((item) => item.handlers)), [items]);
  const selectedKey = selectedAsset ? `${selectedAsset.asset_type}:${selectedAsset.file_path}:${selectedAsset.id}` : null;

  return (
    <aside className="event-browser" aria-label="Event Browser">
      <div className="event-browser-heading">
        <div>
          <h3>Event Browser</h3>
          <p className="muted-text">
            {filteredItems.length} of {items.length} assets
          </p>
        </div>
      </div>

      <div className="event-browser-filters">
        <label>
          Search
          <input
            aria-label="Browser search"
            value={filters.query}
            onChange={(event) => updateFilter("query", event.target.value)}
            placeholder="ID, title, keyword"
          />
        </label>

        <label>
          Domain
          <select aria-label="Domain filter" value={filters.domain} onChange={(event) => updateFilter("domain", event.target.value)}>
            <option value="">All domains</option>
            {domains.map((domain) => (
              <option key={domain} value={domain}>
                {domain}
              </option>
            ))}
          </select>
        </label>

        <label>
          Asset type
          <select
            aria-label="Asset type filter"
            value={filters.assetType}
            onChange={(event) => updateFilter("assetType", event.target.value)}
          >
            <option value="">All asset types</option>
            {ASSET_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Trigger
          <select aria-label="Trigger filter" value={filters.trigger} onChange={(event) => updateFilter("trigger", event.target.value)}>
            <option value="">All triggers</option>
            {triggers.map((trigger) => (
              <option key={trigger} value={trigger}>
                {trigger}
              </option>
            ))}
          </select>
        </label>

        <label>
          Handler
          <select aria-label="Handler filter" value={filters.handler} onChange={(event) => updateFilter("handler", event.target.value)}>
            <option value="">All handlers</option>
            {handlers.map((handler) => (
              <option key={handler} value={handler}>
                {handler}
              </option>
            ))}
          </select>
        </label>
      </div>

      {filteredItems.length > 0 ? (
        <ul className="event-browser-list" aria-label="Event assets">
          {filteredItems.map((item) => (
            <li key={getBrowserItemKey(item)}>
              <button
                type="button"
                className={`event-browser-row ${selectedKey === getBrowserItemKey(item) ? "event-browser-row-selected" : ""}`}
                aria-label={`Select ${item.asset.id}`}
                onClick={() => onSelectAsset(item.asset)}
              >
                <AssetRow item={item} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted-text">No event assets match the current filters.</p>
      )}
    </aside>
  );

  function updateFilter<Key extends keyof Required<EventBrowserFilters>>(key: Key, value: Required<EventBrowserFilters>[Key]): void {
    setFilters((current) => ({ ...current, [key]: value }));
  }
}

function AssetRow({ item }: { item: EventBrowserItem }) {
  return (
    <>
      <span className="event-browser-row-topline">
        <strong>{item.asset.id}</strong>
      </span>
      <span className="event-browser-meta">
        <span>{formatAssetType(item.asset.asset_type)}</span>
        <span>{item.asset.domain}</span>
        {item.trigger ? <span>{item.trigger}</span> : null}
        {item.handlers.length > 0 ? <span>handler: {item.handlers.join(", ")}</span> : null}
      </span>
      {item.asset.asset_type === "event_definition" && item.linkedCallTemplateIds.length > 0 ? (
        <span className="event-browser-meta">call templates: {item.linkedCallTemplateIds.join(", ")}</span>
      ) : null}
      {item.asset.asset_type === "call_template" ? (
        <span className="event-browser-meta">
          {item.eventDefinitionId ? <span>event_definition_id: {item.eventDefinitionId}</span> : null}
          {item.nodeId ? <span>node_id: {item.nodeId}</span> : null}
        </span>
      ) : null}
    </>
  );
}

function formatAssetType(assetType: EditorEventAsset<unknown>["asset_type"]): string {
  switch (assetType) {
    case "event_definition":
      return "definition";
    case "call_template":
      return "call template";
    case "legacy_event":
      return "legacy event";
    case "handler":
      return "handler";
    case "preset":
      return "preset";
  }
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((first, second) => first.localeCompare(second));
}

function isPresent(value: string | null): value is string {
  return typeof value === "string" && value.length > 0;
}
