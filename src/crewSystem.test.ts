import { describe, expect, it } from "vitest";
import { createActiveActionFromCrewAction } from "./crewSystem";
import type { CrewMember } from "./data/gameData";
import { initialCrew } from "./data/gameData";
import type { CrewActionState } from "./events/types";

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

function crewMember(id: CrewMember["id"], currentTile: string): CrewMember {
  const member = initialCrew.find((item) => item.id === id);
  if (!member) {
    throw new Error(`Missing crew member ${id}`);
  }
  return { ...member, currentTile };
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
