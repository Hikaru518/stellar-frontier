import { describe, expect, it } from "vitest";
import {
  advanceCrewMoveAction,
  createActiveActionFromCrewAction,
  createMovePreview,
  deriveCrewActionViewModel,
  startCrewMove,
} from "./crewSystem";
import type { CrewMember, MapTile } from "./data/gameData";
import { initialCrew } from "./data/gameData";
import type { CrewActionState, CrewState, RuntimeCall } from "./events/types";

describe("createActiveActionFromCrewAction", () => {
  it("maps event move crew actions to active move actions with timing", () => {
    const member = crewMember("mike", "1-1");
    const action = crewAction({
      id: "event-move",
      crew_id: member.id,
      type: "move",
      from_tile_id: "1-1",
      target_tile_id: "1-2",
      path_tile_ids: ["1-2"],
      started_at: 20,
      duration_seconds: 45,
      action_params: { reason: "event order" },
    });

    const activeAction = createActiveActionFromCrewAction(member, action);

    expect(activeAction).toMatchObject({
      id: "event-move",
      actionType: "move",
      status: "inProgress",
      startTime: 20,
      durationSeconds: 45,
      finishTime: 65,
      fromTile: "1-1",
      targetTile: "1-2",
      route: ["1-2"],
      routeStepIndex: 0,
      stepStartedAt: 20,
      stepFinishTime: 65,
      totalDurationSeconds: 45,
      params: { reason: "event order" },
    });
  });

  it("maps event_waiting crew actions to event active actions", () => {
    const member = crewMember("amy", "2-3");
    const action = crewAction({
      id: "event-wait",
      crew_id: member.id,
      type: "event_waiting",
      target_tile_id: "2-3",
      started_at: 120,
      duration_seconds: 180,
      action_params: { reason: "beast_tracks" },
    });

    const activeAction = createActiveActionFromCrewAction(member, action);

    expect(activeAction).toMatchObject({
      id: "event-wait",
      actionType: "event",
      status: "inProgress",
      startTime: 120,
      durationSeconds: 180,
      finishTime: 300,
      targetTile: "2-3",
      params: { reason: "beast_tracks" },
    });
  });
});

describe("deriveCrewActionViewModel", () => {
  it("derives idle display state when no crew action or call is active", () => {
    const member = { ...crewMember("mike", "1-1"), status: "待命中。", statusTone: "neutral" as const };

    const view = deriveCrewActionViewModel({
      member,
      crewActions: {},
      activeCalls: {},
      elapsedGameSeconds: 40,
      tiles: [tile("1-1", "平原")],
    });

    expect(view).toMatchObject({
      crewId: "mike",
      actionStatus: "idle",
      actionTitle: "原地待命",
      statusText: "待命中。",
      timingText: "无进行中的计时行动",
      progressPercent: null,
      canCommunicate: true,
      canStartCall: true,
    });
    expect(view.blockingReason).toBeUndefined();
  });

  it("derives moving progress from crew_actions", () => {
    const member = crewMember("mike", "1-1");
    const action = crewAction({
      id: "move-1",
      crew_id: "mike",
      type: "move",
      from_tile_id: "1-1",
      target_tile_id: "1-2",
      started_at: 10,
      ends_at: 70,
      progress_seconds: 30,
      duration_seconds: 60,
    });

    const view = deriveCrewActionViewModel({
      member,
      runtimeCrew: crewRuntime({ current_action_id: action.id }),
      crewActions: { [action.id]: action },
      activeCalls: {},
      elapsedGameSeconds: 40,
      tiles: [tile("1-1", "平原"), tile("1-2", "丘陵")],
    });

    expect(view).toMatchObject({
      actionStatus: "moving",
      actionTitle: "移动至 (1,2)",
      statusText: "正在前往 (1,2)。",
      timingText: "移动剩余 00:30",
      progressPercent: 50,
      canCommunicate: true,
      canStartCall: true,
    });
  });

  it("derives waiting-call display from active calls", () => {
    const member = crewMember("amy", "2-3");
    const call = runtimeCall({
      id: "call-1",
      crew_id: "amy",
      status: "incoming",
      expires_at: 130,
      rendered_lines: [{ template_variant_id: "line-1", text: "森林频道请求接入。", speaker_crew_id: "amy" }],
    });

    const view = deriveCrewActionViewModel({
      member,
      crewActions: {},
      activeCalls: { [call.id]: call },
      elapsedGameSeconds: 100,
      tiles: [tile("2-3", "森林 / 山")],
    });

    expect(view).toMatchObject({
      actionStatus: "waiting_call",
      actionTitle: "等待通讯接入",
      statusText: "森林频道请求接入。",
      timingText: "事件通话剩余 00:30",
      progressPercent: null,
      canCommunicate: true,
      canStartCall: true,
      activeCallId: "call-1",
    });
  });

  it("derives blocked action state from runtime crew claims", () => {
    const member = crewMember("garry", "3-3");
    const action = crewAction({
      id: "blocked-1",
      crew_id: "garry",
      type: "guarding_event_site",
      parent_event_id: "event-1",
      target_tile_id: "3-3",
      can_interrupt: false,
      duration_seconds: 120,
    });

    const view = deriveCrewActionViewModel({
      member,
      runtimeCrew: crewRuntime({
        id: "garry",
        current_action_id: action.id,
        communication_state: "blocked",
        blocking_event_id: "event-1",
      }),
      crewActions: { [action.id]: action },
      activeCalls: {},
      elapsedGameSeconds: 30,
      tiles: [tile("3-3", "丘陵")],
    });

    expect(view).toMatchObject({
      actionStatus: "blocked",
      actionTitle: "事件行动锁定",
      statusText: "事件占用主要行动。",
      progressPercent: 25,
      canCommunicate: false,
      canStartCall: false,
      blockingReason: "事件 event-1 占用主要行动。",
    });
  });
});

describe("wounded movement timing", () => {
  it("creates a move crew_action without mutating CrewMember.activeAction", () => {
    const tiles = [tile("1-1", "平原"), tile("1-2", "平原"), tile("1-3", "丘陵")];
    const member = crewMember("mike", "1-1");
    const preview = createMovePreview(member, "1-3", tiles);

    const started = startCrewMove(member, preview, tiles, 10);

    expect(started.member.activeAction).toBeUndefined();
    expect(started.member.status).toBe("待命中。");
    expect(started.action).toMatchObject({
      id: "mike-move-1-3-10",
      crew_id: "mike",
      type: "move",
      status: "active",
      source: "player_command",
      from_tile_id: "1-1",
      target_tile_id: "1-3",
      path_tile_ids: ["1-2", "1-3"],
      started_at: 10,
      ends_at: 160,
      duration_seconds: 150,
      progress_seconds: 0,
      action_params: {
        route_step_index: 0,
        step_started_at: 10,
        step_finish_time: 70,
        step_durations_seconds: [60, 90],
      },
    });
  });

  it("advances a move crew_action one route step at a time", () => {
    const tiles = [tile("1-1", "平原"), tile("1-2", "平原"), tile("1-3", "丘陵")];
    const member = crewMember("mike", "1-1");
    const preview = createMovePreview(member, "1-3", tiles);
    const started = startCrewMove(member, preview, tiles, 0);

    const afterFirstStep = advanceCrewMoveAction(started.member, started.action, tiles, [], 60);

    expect(afterFirstStep.member.currentTile).toBe("1-2");
    expect(afterFirstStep.action).toMatchObject({
      status: "active",
      progress_seconds: 60,
      action_params: {
        route_step_index: 1,
        step_started_at: 60,
        step_finish_time: 150,
      },
    });
    expect(afterFirstStep.arrived).toBe(false);

    const arrived = advanceCrewMoveAction(afterFirstStep.member, afterFirstStep.action, tiles, afterFirstStep.logs, 150);
    expect(arrived.member.currentTile).toBe("1-3");
    expect(arrived.member.activeAction).toBeUndefined();
    expect(arrived.action).toMatchObject({
      status: "completed",
      progress_seconds: 150,
    });
    expect(arrived.arrived).toBe(true);
  });

  it("applies a 1.5x step duration multiplier to movement previews and crew_actions", () => {
    const tiles = [tile("1-1", "平原"), tile("1-2", "平原"), tile("1-3", "丘陵")];
    const healthy = crewMember("mike", "1-1");
    const wounded = { ...healthy, conditions: ["wounded"] };

    const healthyPreview = createMovePreview(healthy, "1-3", tiles);
    const woundedPreview = createMovePreview(wounded, "1-3", tiles);

    expect(healthyPreview.steps.map((step) => step.durationSeconds)).toEqual([60, 90]);
    expect(woundedPreview.steps.map((step) => step.durationSeconds)).toEqual([90, 135]);
    expect(woundedPreview.totalDurationSeconds).toBe(healthyPreview.totalDurationSeconds * 1.5);

    const moving = startCrewMove(wounded, woundedPreview, tiles, 0);
    expect(moving.action.action_params.step_finish_time).toBe(90);
    expect(moving.action.ends_at).toBe(225);

    const afterFirstStep = advanceCrewMoveAction(moving.member, moving.action, tiles, [], 90);
    expect(afterFirstStep.member.currentTile).toBe("1-2");
    expect(afterFirstStep.action.action_params.step_finish_time).toBe(225);
  });

  it("does not change non-move action durations", () => {
    const member = {
      ...crewMember("garry", "3-3"),
      conditions: ["wounded"],
      activeAction: {
        id: "garry-gather",
        actionType: "gather" as const,
        status: "inProgress" as const,
        startTime: 10,
        durationSeconds: 180,
        finishTime: 190,
      },
    };

    expect(member.activeAction.durationSeconds).toBe(180);
    expect(member.activeAction.finishTime).toBe(190);
  });
});

function crewMember(id: CrewMember["id"], currentTile: string): CrewMember {
  const member = initialCrew.find((item) => item.id === id);
  if (!member) {
    throw new Error(`Missing crew member ${id}`);
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
    display_name: "Mike",
    tile_id: "1-1",
    status: "idle",
    attributes: {
      strength: 3,
      agility: 3,
      intelligence: 3,
      perception: 3,
      luck: 3,
    },
    personality_tags: [],
    expertise_tags: [],
    condition_tags: [],
    communication_state: "available",
    current_action_id: null,
    blocking_event_id: null,
    blocking_call_id: null,
    background_event_ids: [],
    inventory_id: "inv_mike",
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
    connected_at: null,
    ended_at: null,
    expires_at: null,
    render_context_snapshot: {},
    rendered_lines: [],
    available_options: [],
    selected_option_id: null,
    blocking_claim_id: null,
    ...overrides,
  };
}

function tile(id: string, terrain: string): MapTile {
  const [row, col] = id.split("-").map(Number);
  return {
    id,
    coord: `(${row},${col})`,
    row,
    col,
    terrain,
    resources: [],
    buildings: [],
    instruments: [],
    crew: [],
    danger: "未发现即时危险",
    status: "已发现",
    investigated: true,
  };
}
