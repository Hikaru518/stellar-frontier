import type { Condition } from "../events/types";

/**
 * Map object types — Task 1 of map-object-action-refactor.
 *
 * This module currently only exports type definitions; the glob loader,
 * `mapObjectDefinitionById` index, and `universalActions` array are added
 * in Task 2.
 *
 * See docs/plans/2026-04-29-01-40/technical-design.md §2 for the spec.
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
  /** Compatibility fields kept to minimise the `mapSystem.ts` change surface (read-only derived display). */
  legacyResource?: string;
  legacyBuilding?: string;
  legacyInstrument?: string;
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

// TODO(Task 2): glob loader, mapObjectDefinitionById, universalActions
