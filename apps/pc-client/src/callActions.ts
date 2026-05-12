import { defaultMapConfig, type FeatureActionDefinition, type MapFeatureDefinition } from "./content/contentData";
import { mapObjectDefinitionById, universalActions, type ActionDef, type MapObjectDefinition } from "./content/mapObjects";
import { buildCallActionContext } from "./conditions/callActionContext";
import { generateHint } from "./conditions/hintTemplates";
import { evaluateCondition } from "./events/conditions";
import type { Condition, CrewActionState, RuntimeCall } from "./events/types";
import type { CrewMember, GameState, MapTile } from "./data/gameData";
import { buildFeatureTileIndex, getInvestigatableFeaturesAtTile, selectTopInvestigatableFeatures } from "./mapFeatureSystem";
import { formatMapObjectStatus, getFeatureRuntimeStatus } from "./mapSystem";

const HIDDEN_UNIVERSAL_ACTION_IDS = new Set(["universal:standby"]);

export interface CallActionGroup {
  title: string;
  actions: CallActionView[];
}

export interface CallActionTargetView {
  kind: "feature" | "object";
  id: string;
  name: string;
  status?: string;
  statusLabel?: string;
}

export interface CallFeatureContextView {
  kind: "feature";
  id: string;
  name: string;
  priority: number;
  isActionTarget: boolean;
  status?: string;
  statusLabel?: string;
}

export interface CallActionView {
  /** The unique action id from `ActionDef.id`. The dispatch layer parses this. */
  id: string;
  /** Same as `id` for now; kept on the view shape to ease future identity rewrites. */
  defId: string;
  label: string;
  tone: ActionDef["tone"] | FeatureActionDefinition["tone"];
  objectId?: string;
  featureId?: string;
  target?: CallActionTargetView;
  disabled?: boolean;
  disabledReason?: string;
}

export interface BuildCallViewArgs {
  member: CrewMember;
  tile: MapTile;
  gameState: GameState;
}

interface ActionCandidate {
  action: ActionDef | FeatureActionDefinition;
  /** Present iff the action came from a map object (i.e. `category === "object"`). */
  object?: MapObjectDefinition;
  /** Present iff the action came from a map feature (i.e. `category === "feature"`). */
  feature?: MapFeatureDefinition;
}

/**
 * Builds the call-page action view for a member at a tile.
 *
 * The pipeline (see `docs/plans/2026-04-29-01-40/technical-design.md` §4):
 *
 * 1. Collect candidates: every universal action, top-priority visible Feature
 *    inline action, plus revealed object actions that already point at
 *    structured event content.
 * 2. Build a single `ConditionEvaluationContext` via `buildCallActionContext`.
 * 3. Evaluate each candidate's `conditions[]`. The decision matrix:
 *    - all pass               → visible + enabled.
 *    - fail, no display flag  → drop the action entirely.
 *    - fail, `"disabled"`     → visible + disabled with `disabledReason`.
 * 4. Group output by category: universal first ("基础行动"), then one group
 *    per visible Feature / revealed object that has at least one visible
 *    action. Empty groups are suppressed.
 *
 * Pure data-driven — there is no hard-coded "if busy / if has tag X" filter
 * here; conditions express that.
 */
export function buildCallView({ member, tile, gameState }: BuildCallViewArgs): {
  groups: CallActionGroup[];
  featureContexts: CallFeatureContextView[];
  runtimeCall?: RuntimeCall;
} {
  const runtimeCall = findRuntimeCallForMember(member, gameState);
  const investigatableFeatures = getInvestigatableFeatures(tile, gameState);
  const topInvestigatableFeatures = selectTopInvestigatableFeatures(investigatableFeatures);
  const topFeatureIds = new Set(topInvestigatableFeatures.map((feature) => feature.id));
  const featureContexts = investigatableFeatures.map((feature) => toFeatureContextView(feature, gameState, topFeatureIds.has(feature.id)));
  const candidates = collectCandidates(tile, gameState, topInvestigatableFeatures);
  const evaluated = candidates.flatMap((candidate) => {
    const context = buildCallActionContext({ member, tile, gameState, feature: candidate.feature });
    const view = evaluateCandidate(candidate, context, gameState, member);
    return view ? [{ candidate, view }] : [];
  });

  const universalViews = evaluated
    .filter(({ candidate }) => candidate.action.category === "universal")
    .map(({ view }) => view);

  const groups: CallActionGroup[] = [];
  groups.push({ title: "基础行动", actions: universalViews });

  const featureViewsByFeatureId = new Map<string, { feature: MapFeatureDefinition; views: CallActionView[] }>();
  for (const { candidate, view } of evaluated) {
    if (candidate.action.category !== "feature" || !candidate.feature) {
      continue;
    }
    const entry = featureViewsByFeatureId.get(candidate.feature.id) ?? { feature: candidate.feature, views: [] };
    entry.views.push(view);
    featureViewsByFeatureId.set(candidate.feature.id, entry);
  }

  for (const feature of topInvestigatableFeatures) {
    const entry = featureViewsByFeatureId.get(feature.id);
    if (!entry || entry.views.length === 0) {
      continue;
    }
    groups.push({ title: formatFeatureGroupTitle(entry.feature, gameState), actions: entry.views });
  }

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
    groups.push({ title: formatObjectGroupTitle(entry.object, gameState), actions: entry.views });
  }

  return runtimeCall ? { groups, featureContexts, runtimeCall } : { groups, featureContexts };
}

function formatFeatureGroupTitle(feature: MapFeatureDefinition, gameState: GameState): string {
  const status = getFeatureRuntimeStatus(gameState.map, feature);
  const statusLabel = formatMapObjectStatus(status);
  return statusLabel ? `${feature.name}（${statusLabel}）` : feature.name;
}

function formatObjectGroupTitle(object: MapObjectDefinition, gameState: GameState): string {
  const status = gameState.map.mapObjects?.[object.id]?.status_enum ?? object.initial_status;
  const statusLabel = formatMapObjectStatus(status);
  return statusLabel ? `${object.name}（${statusLabel}）` : object.name;
}

function collectCandidates(
  tile: MapTile,
  gameState: GameState,
  topInvestigatableFeatures: readonly MapFeatureDefinition[],
): ActionCandidate[] {
  const candidates: ActionCandidate[] = universalActions.filter((action) => !HIDDEN_UNIVERSAL_ACTION_IDS.has(action.id)).map((action) => ({ action }));

  for (const feature of topInvestigatableFeatures) {
    if (feature.investigatable !== true) {
      continue;
    }
    for (const action of feature.actions) {
      candidates.push({ action, feature });
    }
  }

  for (const objectId of getRevealedObjectIds(tile, gameState)) {
    const definition = mapObjectDefinitionById.get(objectId);
    if (!definition) {
      // Defensive (R7): unknown object id in `revealedObjectIds` should not
      // crash the call page. Drop silently — the migration script enforces
      // referential integrity at content build time.
      continue;
    }
    for (const action of definition.actions) {
      candidates.push({ action, object: definition });
    }
  }

  return candidates;
}

function evaluateCandidate(
  candidate: ActionCandidate,
  context: ReturnType<typeof buildCallActionContext>,
  gameState: GameState,
  member: CrewMember,
): CallActionView | null {
  const { action, object, feature } = candidate;
  const failed: Condition[] = [];
  let passed = true;

  for (const [index, condition] of action.conditions.entries()) {
    const result = evaluateCondition(condition, context, `actions[${action.id}].conditions[${index}]`);
    if (!result.passed || result.errors.length > 0) {
      passed = false;
      failed.push(condition);
    }
  }

  const repairLockReason =
    action.local_action?.kind === "timed_repair" && (feature || object)
      ? getTimedRepairLockReason(gameState.crew_actions, member.id, feature?.id ?? object!.id)
      : undefined;
  if (repairLockReason) {
    return toView(action, object, feature, gameState, {
      disabled: true,
      disabledReason: repairLockReason,
    });
  }

  if (passed) {
    return toView(action, object, feature, gameState, { disabled: false });
  }

  if (action.display_when_unavailable !== "disabled") {
    return null;
  }

  return toView(action, object, feature, gameState, {
    disabled: true,
    disabledReason: generateHint(action as ActionDef, failed),
  });
}

function toView(
  action: ActionDef | FeatureActionDefinition,
  object: MapObjectDefinition | undefined,
  feature: MapFeatureDefinition | undefined,
  gameState: GameState,
  options: { disabled: boolean; disabledReason?: string },
): CallActionView {
  const targetName = object?.name ?? feature?.name;
  const label = targetName
    ? action.label.split("{objectName}").join(targetName).split("{featureName}").join(targetName)
    : action.label;
  const view: CallActionView = {
    id: action.id,
    defId: action.id,
    label,
    tone: action.tone,
  };
  if (object) {
    view.objectId = object.id;
  }
  if (feature) {
    view.featureId = feature.id;
  }
  const target = toActionTargetView(object, feature, gameState);
  if (target) {
    view.target = target;
  }
  if (options.disabled) {
    view.disabled = true;
    if (options.disabledReason) {
      view.disabledReason = options.disabledReason;
    }
  }
  return view;
}

function toActionTargetView(
  object: MapObjectDefinition | undefined,
  feature: MapFeatureDefinition | undefined,
  gameState: GameState,
): CallActionTargetView | undefined {
  if (feature) {
    const status = getFeatureRuntimeStatus(gameState.map, feature);
    const statusLabel = formatMapObjectStatus(status);
    return {
      kind: "feature",
      id: feature.id,
      name: feature.name,
      ...(status === undefined ? {} : { status }),
      ...(statusLabel ? { statusLabel } : {}),
    };
  }
  if (object) {
    const status = gameState.map.mapObjects?.[object.id]?.status_enum ?? object.initial_status;
    const statusLabel = formatMapObjectStatus(status);
    return {
      kind: "object",
      id: object.id,
      name: object.name,
      ...(status === undefined ? {} : { status }),
      ...(statusLabel ? { statusLabel } : {}),
    };
  }
  return undefined;
}

function toFeatureContextView(
  feature: MapFeatureDefinition,
  gameState: GameState,
  isActionTarget: boolean,
): CallFeatureContextView {
  const status = getFeatureRuntimeStatus(gameState.map, feature);
  const statusLabel = formatMapObjectStatus(status);
  return {
    kind: "feature",
    id: feature.id,
    name: feature.name,
    priority: feature.priority,
    isActionTarget,
    ...(status === undefined ? {} : { status }),
    ...(statusLabel ? { statusLabel } : {}),
  };
}

function getInvestigatableFeatures(tile: MapTile, gameState: GameState): MapFeatureDefinition[] {
  const index = buildFeatureTileIndex(defaultMapConfig);
  return getInvestigatableFeaturesAtTile(defaultMapConfig, index, gameState.map, tile.id);
}

function getRevealedObjectIds(tile: MapTile, gameState: GameState): string[] {
  const runtimeTile = gameState.map.tilesById?.[tile.id];
  return Array.from(new Set(runtimeTile?.revealedObjectIds ?? []));
}

function findRuntimeCallForMember(member: CrewMember, gameState: GameState) {
  return Object.values(gameState.active_calls).find((call) => call.crew_id === member.id);
}

export function findActiveRepairActionForObject(
  crewActions: Record<string, CrewActionState>,
  objectId: string,
): CrewActionState | undefined {
  return findActiveRepairActionForTarget(crewActions, objectId);
}

export function findActiveRepairActionForTarget(
  crewActions: Record<string, CrewActionState>,
  targetId: string,
): CrewActionState | undefined {
  return Object.values(crewActions)
    .filter(
      (action) =>
        action.type === "repair" &&
        action.status === "active" &&
        (action.action_params.target_feature_id ?? action.action_params.object_id) === targetId,
    )
    .sort((left, right) => (right.started_at ?? 0) - (left.started_at ?? 0) || right.id.localeCompare(left.id))[0];
}

export function getTimedRepairLockReason(
  crewActions: Record<string, CrewActionState>,
  crewId: string,
  targetId: string,
): string | undefined {
  const activeRepair = findActiveRepairActionForTarget(crewActions, targetId);
  if (!activeRepair) {
    return undefined;
  }

  return activeRepair.crew_id === crewId ? "该队员已在维修该对象。" : "该对象正由其他队员维修。";
}

export function isMapObjectRepaired(gameState: Pick<GameState, "map">, objectId: string): boolean {
  return gameState.map.mapObjects?.[objectId]?.status_enum === "repaired";
}
