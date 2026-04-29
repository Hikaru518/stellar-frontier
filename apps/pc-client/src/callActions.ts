import { defaultMapConfig } from "./content/contentData";
import { mapObjectDefinitionById, universalActions, type ActionDef, type MapObjectDefinition } from "./content/mapObjects";
import { buildCallActionContext } from "./conditions/callActionContext";
import { generateHint } from "./conditions/hintTemplates";
import { evaluateCondition } from "./events/conditions";
import type { Condition, RuntimeCall } from "./events/types";
import type { CrewMember, GameState, MapTile } from "./data/gameData";

export interface CallActionGroup {
  title: string;
  actions: CallActionView[];
}

export interface CallActionView {
  /** The unique action id from `ActionDef.id`. The dispatch layer parses this. */
  id: string;
  /** Same as `id` for now; kept on the view shape to ease future identity rewrites. */
  defId: string;
  label: string;
  tone: ActionDef["tone"];
  objectId?: string;
  disabled?: boolean;
  disabledReason?: string;
}

export interface BuildCallViewArgs {
  member: CrewMember;
  tile: MapTile;
  gameState: GameState;
}

interface ActionCandidate {
  action: ActionDef;
  /** Present iff the action came from a map object (i.e. `category === "object"`). */
  object?: MapObjectDefinition;
}

const RETIRED_GENERIC_OBJECT_ACTION_VERBS = new Set(["gather", "build", "extract", "scan"]);

/**
 * Builds the call-page action view for a member at a tile.
 *
 * The pipeline (see `docs/plans/2026-04-29-01-40/technical-design.md` §4):
 *
 * 1. Collect candidates: every universal action plus every revealed object's
 *    `actions[]`.
 * 2. Build a single `ConditionEvaluationContext` via `buildCallActionContext`.
 * 3. Evaluate each candidate's `conditions[]`. The decision matrix:
 *    - all pass               → visible + enabled.
 *    - fail, no display flag  → drop the action entirely.
 *    - fail, `"disabled"`     → visible + disabled with `disabledReason`.
 * 4. Group output by category: universal first ("基础行动"), then one group
 *    per revealed object that has at least one visible action. Empty groups
 *    are suppressed.
 *
 * Pure data-driven — there is no hard-coded "if busy / if has tag X" filter
 * here; conditions express that.
 */
export function buildCallView({ member, tile, gameState }: BuildCallViewArgs): {
  groups: CallActionGroup[];
  runtimeCall?: RuntimeCall;
} {
  const runtimeCall = findRuntimeCallForMember(member, gameState);
  const candidates = collectCandidates(tile, gameState);
  const context = buildCallActionContext({ member, tile, gameState });
  const evaluated = candidates.flatMap((candidate) => {
    const view = evaluateCandidate(candidate, context);
    return view ? [{ candidate, view }] : [];
  });

  const universalViews = evaluated
    .filter(({ candidate }) => candidate.action.category === "universal")
    .map(({ view }) => view);

  const groups: CallActionGroup[] = [];
  groups.push({ title: "基础行动", actions: universalViews });

  const objectViewsByObjectId = new Map<string, { object: MapObjectDefinition; views: CallActionView[] }>();
  for (const { candidate, view } of evaluated) {
    if (candidate.action.category !== "object" || !candidate.object) {
      continue;
    }
    const entry = objectViewsByObjectId.get(candidate.object.id) ?? { object: candidate.object, views: [] };
    entry.views.push(view);
    objectViewsByObjectId.set(candidate.object.id, entry);
  }

  for (const objectId of getRevealedObjectIds(tile, gameState)) {
    const entry = objectViewsByObjectId.get(objectId);
    if (!entry || entry.views.length === 0) {
      continue;
    }
    groups.push({ title: entry.object.name, actions: entry.views });
  }

  return runtimeCall ? { groups, runtimeCall } : { groups };
}

function collectCandidates(tile: MapTile, gameState: GameState): ActionCandidate[] {
  const candidates: ActionCandidate[] = universalActions.map((action) => ({ action }));

  for (const objectId of getRevealedObjectIds(tile, gameState)) {
    const definition = mapObjectDefinitionById.get(objectId);
    if (!definition) {
      // Defensive (R7): unknown object id in `revealedObjectIds` should not
      // crash the call page. Drop silently — the migration script enforces
      // referential integrity at content build time.
      continue;
    }
    for (const action of definition.actions) {
      if (isRetiredGenericObjectAction(action)) {
        continue;
      }
      candidates.push({ action, object: definition });
    }
  }

  return candidates;
}

function isRetiredGenericObjectAction(action: ActionDef): boolean {
  if (action.category !== "object") {
    return false;
  }
  const actionIdParts = action.id.split(":");
  const actionVerb = actionIdParts[actionIdParts.length - 1];
  return actionVerb ? RETIRED_GENERIC_OBJECT_ACTION_VERBS.has(actionVerb) : false;
}

function evaluateCandidate(candidate: ActionCandidate, context: ReturnType<typeof buildCallActionContext>): CallActionView | null {
  const { action, object } = candidate;
  const failed: Condition[] = [];
  let passed = true;

  for (const [index, condition] of action.conditions.entries()) {
    const result = evaluateCondition(condition, context, `actions[${action.id}].conditions[${index}]`);
    if (!result.passed || result.errors.length > 0) {
      passed = false;
      failed.push(condition);
    }
  }

  if (passed) {
    return toView(action, object, { disabled: false });
  }

  if (action.display_when_unavailable !== "disabled") {
    return null;
  }

  return toView(action, object, {
    disabled: true,
    disabledReason: generateHint(action, failed),
  });
}

function toView(
  action: ActionDef,
  object: MapObjectDefinition | undefined,
  options: { disabled: boolean; disabledReason?: string },
): CallActionView {
  const label = object ? action.label.split("{objectName}").join(object.name) : action.label;
  const view: CallActionView = {
    id: action.id,
    defId: action.id,
    label,
    tone: action.tone,
  };
  if (object) {
    view.objectId = object.id;
  }
  if (options.disabled) {
    view.disabled = true;
    if (options.disabledReason) {
      view.disabledReason = options.disabledReason;
    }
  }
  return view;
}

function getRevealedObjectIds(tile: MapTile, gameState: GameState): string[] {
  // Reveal logic mirrors `mapSystem.ts` — `revealedObjectIds[]` is the
  // authoritative runtime list, plus the `onDiscovered` / `onInvestigated`
  // visibility shortcuts based on the tile's discovery / investigation state.
  const runtimeTile = gameState.map.tilesById?.[tile.id];
  const runtimeIds = new Set<string>(runtimeTile?.revealedObjectIds ?? []);
  const isDiscovered = Boolean(
    (tile as MapTile & { discovered?: boolean }).discovered ||
      runtimeTile?.discovered ||
      gameState.map.discoveredTileIds.includes(tile.id),
  );
  const isInvestigated = Boolean(tile.investigated || runtimeTile?.investigated);

  // We need the tile's static `objectIds` list to know which non-runtime-explicit
  // objects the visibility shortcuts apply to. The `MapTile` runtime view does
  // not carry it; we look it up via the by-id index, walking each candidate
  // definition. Visibility checks are done individually below.
  const visible: string[] = [];

  // Build the candidate id list. Universal definition table is the only source
  // of truth for object existence — but the tile is what scopes "what could be
  // here". We rely on `runtimeTile?.revealedObjectIds` (always populated for
  // explicit reveals) plus the static `objectIds` list when available.
  const tileWithObjectIds = tile as MapTile & { objectIds?: string[] };
  const staticObjectIds = tileWithObjectIds.objectIds ?? lookupStaticObjectIds(tile.id);

  for (const objectId of staticObjectIds) {
    const def = mapObjectDefinitionById.get(objectId);
    if (!def) {
      continue;
    }
    if (
      runtimeIds.has(objectId) ||
      (def.visibility === "onDiscovered" && isDiscovered) ||
      (def.visibility === "onInvestigated" && isInvestigated)
    ) {
      visible.push(objectId);
    }
  }

  // Anything in `revealedObjectIds` that isn't already counted (e.g. a hidden
  // object explicitly revealed by an event effect) is added at the end.
  for (const objectId of runtimeIds) {
    if (!visible.includes(objectId)) {
      visible.push(objectId);
    }
  }

  return visible;
}

let staticObjectIdsByTile: Map<string, string[]> | null = null;
function lookupStaticObjectIds(tileId: string): string[] {
  if (!staticObjectIdsByTile) {
    staticObjectIdsByTile = new Map(defaultMapConfig.tiles.map((tile) => [tile.id, tile.objectIds]));
  }
  return staticObjectIdsByTile.get(tileId) ?? [];
}

function findRuntimeCallForMember(member: CrewMember, gameState: GameState) {
  return Object.values(gameState.active_calls).find((call) => call.crew_id === member.id);
}
