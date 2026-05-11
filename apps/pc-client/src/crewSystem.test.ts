import { describe, expect, it } from "vitest";

import {
  advanceCrewMoveAction,
  createActiveActionFromCrewAction,
  createMovePreview,
  deriveCrewActionViewModel,
  startCrewMove,
} from "./crewSystem";
import { initialCrew, initialTiles } from "./data/gameData";
import type { CrewMember, MapTile } from "./data/gameData";
import type { CrewActionState, CrewState, RuntimeCall } from "./events/types";

describe("crewSystem", () => {
  it("maps move crew actions into active move actions", () => {
    const member = crewMember("1-1");
    const action = crewAction({
      id: "event-move",
      type: "move",
      from_tile_id: "1-1",
      target_tile_id: "1-2",
      path_tile_ids: ["1-2"],
      started_at: 20,
      duration_seconds: 45,
    });

    expect(createActiveActionFromCrewAction(member, action)).toMatchObject({
      id: "event-move",
      actionType: "move",
      fromTile: "1-1",
      targetTile: "1-2",
      finishTime: 65,
    });
  });

  it("maps event_waiting crew actions into event active actions", () => {
    const member = crewMember("1-1");
    const action = crewAction({
      id: "event-wait",
      type: "event_waiting",
      target_tile_id: "1-1",
      started_at: 120,
      duration_seconds: 180,
      action_params: { reason: "blank_world" },
    });

    expect(createActiveActionFromCrewAction(member, action)).toMatchObject({
      id: "event-wait",
      actionType: "event",
      targetTile: "1-1",
      finishTime: 300,
      params: { reason: "blank_world" },
    });
  });

  it("derives idle and waiting-call view states", () => {
    const member = { ...crewMember("1-1"), status: "待命中。", statusTone: "neutral" as const };

    const idle = deriveCrewActionViewModel({
      member,
      crewActions: {},
      activeCalls: {},
      elapsedGameSeconds: 40,
      tiles: [tile("1-1", "平原")],
    });

    expect(idle).toMatchObject({
      crewId: "mike",
      actionStatus: "idle",
      actionTitle: "原地待命",
      canCommunicate: true,
      canStartCall: true,
    });

    const call = runtimeCall({
      id: "call-1",
      crew_id: "mike",
      status: "incoming",
      expires_at: 130,
      rendered_lines: [{ template_variant_id: "line-1", text: "新的通讯请求。", speaker_crew_id: "mike" }],
    });
    const waiting = deriveCrewActionViewModel({
      member,
      crewActions: {},
      activeCalls: { [call.id]: call },
      elapsedGameSeconds: 100,
      tiles: [tile("1-1", "平原")],
    });

    expect(waiting).toMatchObject({
      actionStatus: "waiting_call",
      actionTitle: "等待通讯接入",
      activeCallId: "call-1",
    });
  });

  it("starts and advances move actions across the blank map", () => {
    const tiles = [tile("1-1", "平原"), tile("1-2", "平原"), tile("1-3", "丘陵")];
    const member = crewMember("1-1");
    const preview = createMovePreview(member, "1-3", tiles);
    const started = startCrewMove(member, preview, tiles, 0);

    expect(started.action).toMatchObject({
      crew_id: "mike",
      type: "move",
      path_tile_ids: ["1-2", "1-3"],
      ends_at: 150,
    });

    const afterFirstStep = advanceCrewMoveAction(started.member, started.action, tiles, [], 60);
    expect(afterFirstStep.member.currentTile).toBe("1-2");
    expect(afterFirstStep.arrived).toBe(false);

    const arrived = advanceCrewMoveAction(afterFirstStep.member, afterFirstStep.action, tiles, afterFirstStep.logs, 150);
    expect(arrived.member.currentTile).toBe("1-3");
    expect(arrived.arrived).toBe(true);
  });

  it("applies wounded movement timing without changing non-move durations", () => {
    const tiles = [tile("1-1", "平原"), tile("1-2", "平原"), tile("1-3", "丘陵")];
    const healthy = crewMember("1-1");
    const wounded = { ...healthy, conditions: ["wounded"] };

    const healthyPreview = createMovePreview(healthy, "1-3", tiles);
    const woundedPreview = createMovePreview(wounded, "1-3", tiles);

    expect(healthyPreview.steps.map((step) => step.durationSeconds)).toEqual([60, 90]);
    expect(woundedPreview.steps.map((step) => step.durationSeconds)).toEqual([90, 135]);

    const member = {
      ...crewMember("1-1"),
      conditions: ["wounded"],
      activeAction: { id: "mike-gather", actionType: "gather" as const, status: "inProgress" as const, startTime: 10, durationSeconds: 180, finishTime: 190 },
    };
    expect(member.activeAction.durationSeconds).toBe(180);
    expect(member.activeAction.finishTime).toBe(190);
  });

  it("blocks move previews into mountain tiles", () => {
    const preview = createMovePreview(crewMember("129-129"), "122-119", initialTiles);

    expect(preview.canMove).toBe(false);
    expect(preview.reason).toBe("当前无法前往 山。");
  });
});

function crewMember(currentTile: string): CrewMember {
  const member = initialCrew.find((item) => item.id === "mike");
  if (!member) {
    throw new Error("Missing crew member mike");
  }
  return { ...member, currentTile, activeAction: undefined };
}

function crewAction(overrides: Partial<CrewActionState>): CrewActionState {
  return {
    id: "event-action",
    crew_id: "mike",
    type: "move",
    status: "active",
    source: "event_action_request",
    parent_event_id: "event-1",
    objective_id: null,
    action_request_id: null,
    from_tile_id: "1-1",
    to_tile_id: null,
    target_tile_id: "1-2",
    path_tile_ids: [],
    started_at: 0,
    ends_at: null,
    progress_seconds: 0,
    duration_seconds: 60,
    can_interrupt: true,
    interrupt_duration_seconds: 10,
    action_params: {},
    ...overrides,
  };
}

function crewRuntime(overrides: Partial<CrewState>): CrewState {
  return {
    id: "mike",
    display_name: "麦克",
    tile_id: "1-1",
    status: "idle",
    attributes: { strength: 3, agility: 3, intelligence: 3, perception: 3, luck: 3 },
    personality_tags: [],
    expertise_tags: [],
    condition_tags: [],
    communication_state: "available",
    current_action_id: null,
    background_event_ids: [],
    inventory_id: "crew:mike",
    diary_entry_ids: [],
    event_history_keys: [],
    ...overrides,
  };
}

function runtimeCall(overrides: Partial<RuntimeCall>): RuntimeCall {
  return {
    id: "call-1",
    event_id: "event-1",
    event_node_id: "node-1",
    call_template_id: "template-1",
    crew_id: "mike",
    status: "incoming",
    created_at: 0,
    render_context_snapshot: {},
    rendered_lines: [],
    available_options: [],
    ...overrides,
  };
}

function tile(id: string, terrain: string): MapTile {
  const [row, col] = id.split("-").map(Number);
  return { id, coord: "(0,0)", row, col, terrain, crew: [], status: "已发现", investigated: false };
}
