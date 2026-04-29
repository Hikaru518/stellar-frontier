import type { Condition } from "../events/types";

/**
 * Map object types and content loaders for the map-object-action-refactor.
 *
 * Task 1 introduced the type definitions; Task 2 wires up the glob loaders for
 * `content/map-objects/*.json` and `content/universal-actions/*.json` and
 * exports the `mapObjectDefinitionById` index plus the `universalActions`
 * array.
 *
 * See docs/plans/2026-04-29-01-40/technical-design.md §2 / §3.
 */

// Visibility enum reused from existing map content; `hidden` means the object
// is only revealed by an explicit event effect.
export type MapVisibility = "onDiscovered" | "onInvestigated" | "hidden";

// Object major-class — kept in sync with current `MapObjectKind` enum so
// `has_tag` / `compare_field` conditions can fall back to it.
export type MapObjectKind =
  | "resourceNode"
  | "structure"
  | "signal"
  | "hazard"
  | "facility"
  | "ruin"
  | "landmark";

/** Action grouping dimension. universal = not bound to any object; object = inlined under `MapObjectDefinition.actions[]`. */
export type ActionCategory = "universal" | "object";

/** Display strategy when an action's conditions fail. `undefined` = hide (default); `"disabled"` = show greyed-out with hint. */
export type ActionUnavailableDisplay = "disabled";

export interface ActionDef {
  /** Globally unique string id; for object-inline actions, prefix with the object id; for universal actions, prefix with `"universal:"` (convention, not enforced). */
  id: string;
  category: ActionCategory;
  /** Call-page button label; supports the `"{objectName}"` placeholder. */
  label: string;
  /** Button colour token, reusing the existing tone palette. */
  tone?: "neutral" | "muted" | "accent" | "danger" | "success";
  /** Visibility/availability conditions; an empty array = always visible. Evaluator: `events/conditions.ts`. */
  conditions: Condition[];
  /** Event id launched on selection; references `EventDefinition.id` from `events/types.ts`. */
  event_id: string;
  /** Display mode when conditions fail; omit = hide. */
  display_when_unavailable?: ActionUnavailableDisplay;
  /** Override hint text shown when greyed-out; if absent, generated from the failed condition. */
  unavailable_hint?: string;
  /** Reserved for a future shared-action table. The schema accepts it but the loader ignores it this round. */
  action_ref?: string;
}

export interface MapObjectDefinition {
  /** Globally unique id; same as the `RuntimeMapObjectsState` key. */
  id: string;
  /** Major class, used as a fallback for condition / UI grouping. */
  kind: MapObjectKind;
  /** Player-visible name. */
  name: string;
  /** Optional description, referenceable from event text. */
  description?: string;
  /** Static tags; runtime tags live on `MapObjectRuntime.tags`. */
  tags?: string[];
  /** Allowed status set; at least one entry; the global enum is intentionally not locked. */
  status_options: string[];
  /** Initial status; must belong to `status_options`. */
  initial_status: string;
  /** Inline action list for this object; every entry's `category` must be `"object"`. */
  actions: ActionDef[];
  /** Synonymous with the existing visibility — controls when the call page can see it. */
  visibility: MapVisibility;
}

export interface MapObjectRuntime {
  /** Same as `definition.id`. */
  id: string;
  /** Current status; value is expected to belong to `definition.status_options` (not enforced at runtime). */
  status_enum: string;
  /** Runtime-added tags. The MVP keeps the field but does not write to it (see plan Q5). */
  tags?: string[];
}

/** Flat by-id index; mirrors `RuntimeMapState.tilesById` for save/load symmetry. */
export type RuntimeMapObjectsState = Record<string, MapObjectRuntime>;

type JsonModule<T> = T | { default: T };

const mapObjectModules = import.meta.glob("../../../../content/map-objects/*.json", { eager: true }) as Record<
  string,
  JsonModule<{ map_objects: MapObjectDefinition[] }>
>;

const universalActionModules = import.meta.glob("../../../../content/universal-actions/*.json", { eager: true }) as Record<
  string,
  JsonModule<{ universal_actions: ActionDef[] }>
>;

function unwrapJsonModule<T extends object>(module: JsonModule<T>): T {
  return "default" in module ? module.default : module;
}

function collectGlob<TKey extends string, TValue>(
  modules: Record<string, JsonModule<Record<TKey, TValue[]>>>,
  key: TKey,
): TValue[] {
  return Object.keys(modules)
    .sort()
    .flatMap((path) => unwrapJsonModule(modules[path])[key] ?? []);
}

/** Flat list of every map object definition discovered under `content/map-objects/*.json`. */
export const mapObjectDefinitions: MapObjectDefinition[] = collectGlob(mapObjectModules, "map_objects");

/** By-id index; the canonical lookup point for `set_object_status`, callActions, and mapSystem. */
export const mapObjectDefinitionById: Map<string, MapObjectDefinition> = new Map(
  mapObjectDefinitions.map((definition) => [definition.id, definition]),
);

export function getMapObjectDefinition(id: string): MapObjectDefinition | undefined {
  return mapObjectDefinitionById.get(id);
}

/** Flat list of universal `ActionDef` entries discovered under `content/universal-actions/*.json`. */
export const universalActions: ActionDef[] = collectGlob(universalActionModules, "universal_actions");
