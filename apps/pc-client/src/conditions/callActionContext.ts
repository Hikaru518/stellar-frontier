import type { ConditionEvaluationContext } from "../events/conditions";
import type { CrewMember, GameState, MapTile } from "../data/gameData";

/**
 * Builds a {@link ConditionEvaluationContext} suitable for evaluating call-page
 * action conditions. The action pipeline is described in
 * `docs/plans/2026-04-29-01-40/technical-design.md` §4 step 3 — universal and
 * object actions both go through `events/conditions.ts:evaluateConditions`, so
 * we expose:
 *
 * - the crew array (so `primary_crew` / `crew_id` targets resolve and
 *   `inventory_has_item` can find a crew inventory via the legacy `inventory`
 *   field),
 * - at minimum the current tile under `state.tiles`,
 * - the runtime map-objects table under `state.map.mapObjects`, so the
 *   `object_status_equals` handler condition can read `status_enum`,
 * - the standard runtime collections (`active_events`, `active_calls`,
 *   `crew_actions`, `inventories`, `world_flags`, `world_history`, …) so any
 *   future condition author can lean on them without rebuilding the bridge.
 *
 * The returned context omits `trigger_context.event_id` because we are *not*
 * inside an event evaluation — these conditions decide whether an action
 * button is shown on the call page.
 */
export interface BuildCallActionContextArgs {
  member: CrewMember;
  tile: MapTile;
  gameState: GameState;
}

export function buildCallActionContext({
  member,
  tile,
  gameState,
}: BuildCallActionContextArgs): ConditionEvaluationContext {
  const stateMap = gameState.map as GameState["map"] & { mapObjects?: Record<string, { id: string; status_enum: string; tags?: string[] }> };
  // Bridge each crew member's runtime view to the shape `events/conditions.ts`
  // expects. In particular `crew_action_status` reads `current_action_id` /
  // `currentActionId` and looks up `crew_actions[currentActionId].status`.
  // The call-page `CrewMember` model exposes the same data via
  // `activeAction.{id,status}`; we synthesise both fields so universal action
  // conditions like `crew_action_status not_equals active` resolve correctly
  // when a crew member is idle (treated as `completed`).
  const synthesisedCrewActions: Record<string, { id: string; status: string; crew_id: string }> = {
    ...((gameState.crew_actions as Record<string, { id: string; status: string; crew_id: string }>) ?? {}),
  };
  const bridgedCrew = gameState.crew.map((entry) => {
    const syntheticActionId = `__call_view_idle__:${entry.id}`;
    if (!entry.activeAction) {
      synthesisedCrewActions[syntheticActionId] = {
        id: syntheticActionId,
        status: "completed",
        crew_id: entry.id,
      };
      return { ...entry, current_action_id: syntheticActionId };
    }
    if (!synthesisedCrewActions[entry.activeAction.id]) {
      synthesisedCrewActions[entry.activeAction.id] = {
        id: entry.activeAction.id,
        status: mapActiveActionStatusToCrewActionStatus(entry.activeAction.status),
        crew_id: entry.id,
      };
    }
    return { ...entry, current_action_id: entry.activeAction.id };
  });
  return {
    state: {
      crew: bridgedCrew,
      crew_actions: synthesisedCrewActions as ConditionEvaluationContext["state"]["crew_actions"],
      tiles: { [tile.id]: tile },
      active_events: gameState.active_events,
      active_calls: gameState.active_calls,
      inventories: gameState.inventories,
      world_flags: gameState.world_flags,
      world_history: gameState.world_history,
      objectives: gameState.objectives,
      event_logs: gameState.event_logs,
      elapsedGameSeconds: gameState.elapsedGameSeconds,
      // Pass the runtime map-objects table through under `state.map.mapObjects`
      // — that is exactly the path the `object_status_equals` handler reads.
      map: {
        mapObjects: stateMap?.mapObjects ?? {},
      },
    } as ConditionEvaluationContext["state"],
    trigger_context: {
      trigger_type: "call_choice",
      occurred_at: gameState.elapsedGameSeconds,
      source: "call",
      crew_id: member.id,
      tile_id: tile.id,
    },
  };
}

/**
 * Map the call-page `ActiveAction.status` strings into the event-runtime
 * `CrewActionState.status` vocabulary. The two systems use overlapping but not
 * identical status enums; we collapse "inProgress" to "active" so
 * `crew_action_status equals active` reads truthfully.
 */
function mapActiveActionStatusToCrewActionStatus(status: string): string {
  switch (status) {
    case "inProgress":
      return "active";
    case "completed":
      return "completed";
    case "interrupted":
      return "interrupted";
    case "failed":
      return "failed";
    default:
      return "completed";
  }
}
