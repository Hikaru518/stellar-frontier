import { describe, expect, it } from "vitest";
import { eventContentLibrary, questDefinitions } from "../content/contentData";
import { createInitialQuestState } from "../questSystem";
import { EventContentIndex } from "./contentIndex";
import { buildEventContentIndex } from "./contentIndex";
import { processEventWakeups, processTrigger, selectCallOption } from "./eventEngine";
import { startRuntimeEvent, type GraphRunnerGameState } from "./graphRunner";
import {
  createEmptyEventRuntimeState,
  type ActionRequestNode,
  type CallNode,
  type CallTemplate,
  type CrewState,
  type EndNode,
  type EventDefinition,
  type EventNode,
  type ObjectiveNode,
  type TriggerContext,
  type WaitNode,
} from "./types";

describe("event engine call option selection", () => {
  it("records only the stable option_id when display text is selected", () => {
    const { definition, index } = scenario();
    const started = startRuntimeEvent(createState(), definition, triggerContext(120), { event_id: "evt_test", content_index: index });
    const callId = started.event.active_call_id ?? "";

    expect(started.errors).toEqual([]);
    expect(started.state.active_calls[callId]?.available_options).toEqual([
      {
        option_id: "press_on",
        template_variant_id: "press_steady",
        text: "Keep searching carefully",
        is_default: false,
      },
    ]);

    const selected = selectCallOption({
      state: started.state,
      index,
      call_id: callId,
      option_id: "press_on",
      occurred_at: 130,
    });

    expect(selected.errors).toEqual([]);
    expect(selected.event?.status).toBe("resolved");
    expect(selected.event?.selected_options).toEqual({ signal_call: "press_on" });
    expect(JSON.stringify(selected.event?.selected_options)).not.toContain("Keep searching carefully");
  });

  it("returns runtime errors without advancing unavailable or ended calls", () => {
    const { definition, index } = scenario();
    const started = startRuntimeEvent(createState(), definition, triggerContext(120), { event_id: "evt_test", content_index: index });
    const callId = started.event.active_call_id ?? "";

    const unavailable = selectCallOption({
      state: started.state,
      index,
      call_id: callId,
      option_id: "retreat",
      occurred_at: 130,
    });

    expect(unavailable.errors).toEqual([
      expect.objectContaining({
        code: "option_unavailable",
        call_id: callId,
        option_id: "retreat",
      }),
    ]);
    expect(unavailable.state.active_events.evt_test.current_node_id).toBe("signal_call");
    expect(unavailable.state.active_calls[callId]?.status).toBe("awaiting_choice");

    const selected = selectCallOption({
      state: started.state,
      index,
      call_id: callId,
      option_id: "press_on",
      occurred_at: 131,
    });
    const ended = selectCallOption({
      state: selected.state,
      index,
      call_id: callId,
      option_id: "press_on",
      occurred_at: 132,
    });

    expect(ended.errors).toEqual([
      expect.objectContaining({
        code: "call_not_active",
        call_id: callId,
      }),
    ]);
    expect(ended.state.active_events.evt_test.status).toBe("resolved");
    expect(ended.state.active_events.evt_test.selected_options).toEqual({ signal_call: "press_on" });
  });
});

describe("event engine trigger intake", () => {
  it("runs the authored opening 麦克 call chain into regrouping situation", () => {
    const indexResult = buildEventContentIndex(eventContentLibrary);
    expect(indexResult.errors).toEqual([]);
    const started = processTrigger({
      state: createAuthoredCrashSiteState(),
      index: indexResult.index,
      context: {
        ...triggerContext(0),
        trigger_type: "game_start",
        source: "time_system",
        crew_id: "mike",
        tile_id: "129-129",
        payload: { phase: "new_game" },
      },
    });
    const crashReportCallId = started.event?.active_call_id ?? "";

    expect(started.errors).toEqual([]);
    expect(started.event?.event_definition_id).toBe("iafs_opening_mike_crash_call");
    expect(started.state.active_calls[crashReportCallId]?.rendered_lines[0]?.text).toContain("这里是麦克");

    const facilities = selectCallOption({
      state: started.state,
      index: indexResult.index,
      call_id: crashReportCallId,
      option_id: "promise_return_home",
      occurred_at: 1,
    });
    const facilitiesCallId = facilities.event?.active_call_id ?? "";
    const cargo = selectCallOption({
      state: facilities.state,
      index: indexResult.index,
      call_id: facilitiesCallId,
      option_id: "check_usable_facilities",
      occurred_at: 2,
    });
    const cargoCallId = cargo.event?.active_call_id ?? "";
    const route = selectCallOption({
      state: cargo.state,
      index: indexResult.index,
      call_id: cargoCallId,
      option_id: "search_scattered_cargo",
      occurred_at: 3,
    });
    const routeCallId = route.event?.active_call_id ?? "";
    const ended = selectCallOption({
      state: route.state,
      index: indexResult.index,
      call_id: routeCallId,
      option_id: "find_exit_route",
      occurred_at: 4,
    });
    const quest = ended.state.quest_state?.quests.regroup_after_crash;

    expect(facilities.errors).toEqual([]);
    expect(cargo.errors).toEqual([]);
    expect(route.errors).toEqual([]);
    expect(ended.errors).toEqual([]);
    expect(ended.event?.status).toBe("resolved");
    expect(quest?.current_node_id).toBe("regrouping_situation");
    expect(ended.state.event_logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ summary: "麦克完成坠毁后首次回报，主线进入重整态势" }),
      ]),
    );
  });

  it("completes the crash-site survey quest todo through the authored survey call chain", () => {
    const indexResult = buildEventContentIndex(eventContentLibrary);
    expect(indexResult.errors).toEqual([]);
    const started = processTrigger({
      state: createAuthoredCrashSiteState(),
      index: indexResult.index,
      context: {
        ...triggerContext(240),
        trigger_type: "action_complete",
        source: "crew_action",
        crew_id: "mike",
        tile_id: "129-129",
        action_id: "act_survey_crash_site",
        payload: { action_type: "survey" },
      },
    });
    const callId = started.event?.active_call_id ?? "";

    expect(started.errors).toEqual([]);
    expect(started.event?.event_definition_id).toBe("iafs_crash_site_survey_reveal");
    expect(started.state.active_calls[callId]?.expires_at).toBeNull();

    const selected = selectCallOption({
      state: started.state,
      index: indexResult.index,
      call_id: callId,
      option_id: "ack",
      occurred_at: 245,
    });

    const quest = selected.state.quest_state?.quests.regroup_after_crash;
    expect(selected.errors).toEqual([]);
    expect(selected.state.map?.tilesById?.["129-129"]?.revealedObjectIds).toEqual([]);
    expect(selected.state.map?.featuresById).toMatchObject({
      iafs_generator: { id: "iafs_generator", status: "damaged", revealed: true },
      iafs_life_support: { id: "iafs_life_support", status: "damaged", revealed: true },
      iafs_shuttle_core: { id: "iafs_shuttle_core", status: "damaged", revealed: true },
    });
    expect(quest?.todos.survey_crash_site).toMatchObject({ status: "completed", completed_at: 245 });
    expect(quest?.current_node_id).toBe("repair_targets_revealed");
    expect(quest?.status).toBe("incomplete");
    expect(selected.state.crew_actions).toEqual({});
  });

  it("reveals the authored scattered supplies object after surveying tile 133-134", () => {
    const indexResult = buildEventContentIndex(eventContentLibrary);
    expect(indexResult.errors).toEqual([]);
    const started = processTrigger({
      state: createAuthoredSuppliesState(90),
      index: indexResult.index,
      context: {
        ...triggerContext(90),
        trigger_type: "action_complete",
        source: "crew_action",
        crew_id: "mike",
        tile_id: "133-134",
        action_id: "act_survey_supplies",
        payload: { action_type: "survey" },
      },
    });
    const callId = started.event?.active_call_id ?? "";

    expect(started.errors).toEqual([]);
    expect(started.event?.event_definition_id).toBe("iafs_scattered_supplies_survey_reveal");
    expect(started.state.active_calls[callId]?.rendered_lines.map((line) => line.text).join(" ")).toContain("散落的物资");

    const selected = selectCallOption({
      state: started.state,
      index: indexResult.index,
      call_id: callId,
      option_id: "ack",
      occurred_at: 95,
    });

    expect(selected.errors).toEqual([]);
    expect(selected.state.map?.tilesById?.["133-134"]?.revealedObjectIds).toEqual([]);
    expect(selected.state.map?.featuresById?.iafs_scattered_supplies).toMatchObject({
      id: "iafs_scattered_supplies",
      status: "unsearched",
      revealed: true,
    });
  });

  it("starts the authored scavenger camp sentry call on outer-line arrival", () => {
    const indexResult = buildEventContentIndex(eventContentLibrary);
    expect(indexResult.errors).toEqual([]);
    const triggerTiles = ["91-115", "91-116", "91-117", "92-115", "92-116", "92-117"];

    for (const tileId of triggerTiles) {
      const started = processTrigger({
        state: createAuthoredScavengerCampState(tileId),
        index: indexResult.index,
        context: scavengerArrivalContext(tileId, 12000),
      });
      const callId = started.event?.active_call_id ?? "";
      const call = started.state.active_calls[callId];

      expect(started.errors).toEqual([]);
      expect(started.candidate_report?.selected_event_definition_ids).toEqual(["iafs_scavenger_sentry_line_contact"]);
      expect(call?.rendered_lines[0]?.text).toContain("站住。线外说话，手别乱动。");
      expect(call?.available_options.map((option) => option.option_id)).toEqual([
        "opt_observe",
        "opt_threaten",
        "opt_negotiate",
        "opt_chat",
      ]);
    }
  });

  it("records the authored scavenger camp opening choice for follow-up events", () => {
    const indexResult = buildEventContentIndex(eventContentLibrary);
    expect(indexResult.errors).toEqual([]);
    const choices = [
      ["opt_observe", "scavenger_sentry_observed", "observe"],
      ["opt_threaten", "scavenger_sentry_threatened", "threaten"],
      ["opt_negotiate", "scavenger_sentry_negotiated", "negotiate"],
      ["opt_chat", "scavenger_sentry_chatted", "chat"],
    ] as const;

    for (const [optionId, resultKey, flagValue] of choices) {
      const started = processTrigger({
        state: createAuthoredScavengerCampState("92-116"),
        index: indexResult.index,
        context: scavengerArrivalContext("92-116", 12000),
      });
      const callId = started.event?.active_call_id ?? "";
      const ended = selectCallOption({
        state: started.state,
        index: indexResult.index,
        call_id: callId,
        option_id: optionId,
        occurred_at: 12015,
      });

      expect(ended.errors).toEqual([]);
      expect(ended.event?.status).toBe("resolved");
      expect(ended.event?.result_key).toBe(resultKey);
      expect(ended.state.world_flags.iafs_scavenger_sentry_opening_choice?.value).toBe(flagValue);
    }
  });

  it.each([
    {
      occurredAt: 120,
      expectedNode: "full_report",
      expectedText: "一套维修套件、一包应急食物，还有一把破冰镐",
      expectedItems: [
        { item_id: "repair_kit", quantity: 1 },
        { item_id: "emergency_food", quantity: 1 },
        { item_id: "ice_pick", quantity: 1 },
      ],
    },
    {
      occurredAt: 360,
      expectedNode: "late_report",
      expectedText: "看来我们晚来了一步，有不少东西被风吹走了",
      expectedItems: [{ item_id: "ice_pick", quantity: 1 }],
    },
  ])("branches scattered supplies search results by elapsed time %#", ({ occurredAt, expectedNode, expectedText, expectedItems }) => {
    const indexResult = buildEventContentIndex(eventContentLibrary);
    expect(indexResult.errors).toEqual([]);

    const result = processTrigger({
      state: createAuthoredSuppliesState(occurredAt),
      index: indexResult.index,
      context: {
        ...triggerContext(occurredAt),
        trigger_type: "action_complete",
        source: "crew_action",
        crew_id: "mike",
        tile_id: "133-134",
        action_id: "iafs_scattered_supplies:search",
        event_definition_id: "iafs_scattered_supplies_search",
        payload: {
          action_type: "gather",
          action_def_id: "iafs_scattered_supplies:search",
          feature_id: "iafs_scattered_supplies",
        },
      },
    });
    const callId = result.event?.active_call_id ?? "";

    expect(result.errors).toEqual([]);
    expect(result.event?.event_definition_id).toBe("iafs_scattered_supplies_search");
    expect(result.event?.current_node_id).toBe(expectedNode);
    expect(result.state.active_calls[callId]?.rendered_lines.map((line) => line.text).join(" ")).toContain(expectedText);
    expect(result.state.inventories.inv_mike.items).toEqual(expectedItems);
    expect(result.state.world_flags.iafs_scattered_supplies_searched).toMatchObject({ value: true });
    expect(result.state.map?.featuresById?.iafs_scattered_supplies).toMatchObject({
      id: "iafs_scattered_supplies",
      status: "searched",
      revealed: true,
    });
  });

  it.each([
    { featureStatus: "damaged", expectedEventId: "iafs_generator_inspect_damaged" },
    { featureStatus: "repaired", expectedEventId: "iafs_generator_inspect_repaired" },
  ])("routes generator inspect by feature_status_equals when the feature is $featureStatus", ({ featureStatus, expectedEventId }) => {
    const indexResult = buildEventContentIndex(eventContentLibrary);
    expect(indexResult.errors).toEqual([]);

    const result = processTrigger({
      state: createAuthoredCrashSiteState({
        iafs_generator: { id: "iafs_generator", status: featureStatus, revealed: true },
      }),
      index: indexResult.index,
      context: {
        ...triggerContext(300),
        trigger_type: "action_complete",
        source: "call",
        crew_id: "mike",
        tile_id: "129-129",
        action_id: "iafs_generator:inspect",
        payload: {
          action_type: "inspect",
          action_def_id: "iafs_generator:inspect",
          feature_id: "iafs_generator",
        },
      },
    });

    expect(result.errors).toEqual([]);
    expect(result.event?.event_definition_id).toBe(expectedEventId);
  });

  it("queues a success callback and records repair quest progress when authored repair actions complete", () => {
    const indexResult = buildEventContentIndex(eventContentLibrary);
    expect(indexResult.errors).toEqual([]);
    const state = createAuthoredCrashSiteState();
    if (!state.quest_state) {
      throw new Error("Expected authored crash site state to include quest state");
    }
    const questState = state.quest_state;
    state.quest_state = {
      ...questState,
      quests: {
        ...questState.quests,
        regroup_after_crash: {
          ...questState.quests.regroup_after_crash,
          current_node_id: "repair_targets_revealed",
          todos: {
            ...questState.quests.regroup_after_crash.todos,
            survey_crash_site: { id: "survey_crash_site", status: "completed", updated_at: 245, completed_at: 245 },
            repair_life_support: { id: "repair_life_support", status: "completed", updated_at: 300, completed_at: 300 },
            repair_shuttle_core: { id: "repair_shuttle_core", status: "completed", updated_at: 310, completed_at: 310 },
          },
        },
      },
    };

    const result = processTrigger({
      state,
      index: indexResult.index,
      context: {
        ...triggerContext(360),
        trigger_type: "action_complete",
        source: "crew_action",
        crew_id: "mike",
        tile_id: "129-129",
        action_id: "repair:mike:iafs_generator:0",
        payload: { action_type: "repair", feature_id: "iafs_generator", repair_result: "success" },
      },
    });

    const quest = result.state.quest_state?.quests.regroup_after_crash;
    const callId = result.event?.active_call_id ?? "";
    expect(result.errors).toEqual([]);
    expect(result.event?.event_definition_id).toBe("iafs_generator_repair_complete");
    expect(result.event?.status).toBe("waiting_call");
    expect(result.state.active_calls[callId]?.rendered_lines[0]?.text).toBe("发电机这边修好了。");
    expect(quest?.todos.repair_generator).toMatchObject({ status: "completed", completed_at: 360 });
    expect(quest?.status).toBe("completed");

    const selected = selectCallOption({
      state: result.state,
      index: indexResult.index,
      call_id: callId,
      option_id: "ack",
      occurred_at: 361,
    });
    expect(selected.errors).toEqual([]);
    expect(selected.event?.status).toBe("resolved");
    expect(selected.event?.active_call_id).toBeNull();
    expect(selected.state.active_calls[callId]?.status).toBe("ended");
  });

  it("queues a failure callback without completing the repair quest todo", () => {
    const indexResult = buildEventContentIndex(eventContentLibrary);
    expect(indexResult.errors).toEqual([]);

    const result = processTrigger({
      state: createAuthoredCrashSiteState(),
      index: indexResult.index,
      context: {
        ...triggerContext(360),
        trigger_type: "action_complete",
        source: "crew_action",
        crew_id: "mike",
        tile_id: "129-129",
        action_id: "repair:mike:iafs_generator:0",
        payload: { action_type: "repair", feature_id: "iafs_generator", repair_result: "failure" },
      },
    });

    const quest = result.state.quest_state?.quests.regroup_after_crash;
    const callId = result.event?.active_call_id ?? "";
    expect(result.errors).toEqual([]);
    expect(result.event?.event_definition_id).toBe("iafs_generator_repair_failed");
    expect(result.event?.status).toBe("waiting_call");
    expect(result.state.active_calls[callId]?.rendered_lines[0]?.text).toBe("发电机这边还没修起来。");
    expect(quest?.todos.repair_generator?.status).not.toBe("completed");
  });

  it("starts arrival candidates and advances call choice contexts", () => {
    const definition = eventDefinition([
      callNode("signal_call", { press_on: "success_end" }),
      endNode("success_end", "resolved", "pressed_on", false),
    ]);
    const index = indexFor([definition], [callTemplate()]);
    const started = processTrigger({
      state: createState(),
      index,
      context: triggerContext(120),
    });
    const callId = started.event?.active_call_id ?? "";

    expect(started.errors).toEqual([]);
    expect(started.candidate_report?.selected_event_definition_ids).toEqual(["test_event"]);
    expect(started.event?.status).toBe("waiting_call");
    expect(started.state.active_calls[callId]?.status).toBe("awaiting_choice");

    const selected = processTrigger({
      state: started.state,
      index,
      context: {
        ...triggerContext(130),
        trigger_type: "call_choice",
        source: "call",
        event_id: started.event?.id,
        event_definition_id: "test_event",
        call_id: callId,
        selected_option_id: "press_on",
      },
    });

    expect(selected.errors).toEqual([]);
    expect(selected.event?.status).toBe("resolved");
    expect(selected.event?.selected_options).toEqual({ signal_call: "press_on" });
  });

  it("advances action completion and objective completion contexts", () => {
    const actionDefinition = definitionWith({
      id: "action_wait",
      triggerType: "arrival",
      nodes: [
        actionRequestNode("request_scan", "action_done", "action_failed"),
        endNode("action_done", "resolved", "action_done", false),
        endNode("action_failed", "failed", "action_failed", false),
      ],
    });
    const objectiveDefinition = definitionWith({
      id: "objective_wait",
      triggerType: "arrival",
      nodes: [
        objectiveNode("map_site", "objective_done", "objective_failed"),
        endNode("objective_done", "resolved", "objective_done", false),
        endNode("objective_failed", "failed", "objective_failed", false),
      ],
    });
    const index = indexFor([actionDefinition, objectiveDefinition]);
    const actionStarted = startRuntimeEvent(createState(), actionDefinition, {
      ...triggerContext(200),
      event_id: "evt_action",
      event_definition_id: "action_wait",
    });
    const objectiveStarted = startRuntimeEvent(createState(), objectiveDefinition, {
      ...triggerContext(210),
      event_id: "evt_objective",
      event_definition_id: "objective_wait",
    });
    const objectiveId = objectiveStarted.event.objective_ids[0];

    const actionCompleted = processTrigger({
      state: actionStarted.state,
      index,
      context: {
        ...triggerContext(240),
        trigger_type: "action_complete",
        source: "crew_action",
        event_id: "evt_action",
        event_definition_id: "action_wait",
        action_id: "action_evt_action",
      },
    });
    const objectiveCompleted = processTrigger({
      state: objectiveStarted.state,
      index,
      context: {
        ...triggerContext(250),
        trigger_type: "objective_completed",
        source: "objective",
        event_id: "evt_objective",
        event_definition_id: "objective_wait",
        objective_id: objectiveId,
      },
    });

    expect(actionCompleted.errors).toEqual([]);
    expect(actionCompleted.event?.status).toBe("resolved");
    expect(actionCompleted.event?.result_key).toBe("action_done");
    expect(objectiveCompleted.errors).toEqual([]);
    expect(objectiveCompleted.event?.status).toBe("resolved");
    expect(objectiveCompleted.event?.result_key).toBe("objective_done");
  });

  it("processes due time wakeups and leaves future wakeups untouched", () => {
    const definition = definitionWith({
      id: "timed_event",
      triggerType: "arrival",
      nodes: [waitNode("wait_for_signal", 30, "time_done"), endNode("time_done", "resolved", "time_done", false)],
    });
    const index = indexFor([definition]);
    const started = startRuntimeEvent(createState(), definition, {
      ...triggerContext(300),
      event_id: "evt_timed",
      event_definition_id: "timed_event",
    });

    const early = processEventWakeups({ state: started.state, index, elapsed_game_seconds: 329 });
    const due = processEventWakeups({ state: started.state, index, elapsed_game_seconds: 330 });

    expect(early.errors).toEqual([]);
    expect(early.events ?? []).toEqual([]);
    expect(early.state.active_events.evt_timed.status).toBe("waiting_time");
    expect(due.errors).toEqual([]);
    expect((due.events ?? []).map((event) => event.id)).toEqual(["evt_timed"]);
    expect(due.state.active_events.evt_timed.status).toBe("resolved");
  });

  it("filters candidates blocked by cooldown, max count, mutex, or blocking slot", () => {
    const selectedDefinition = definitionWith({ id: "selectable_event", triggerType: "arrival", priority: 1 });
    const cooldownDefinition = definitionWith({ id: "cooldown_event", triggerType: "arrival", priority: 2, cooldownSeconds: 60 });
    const maxedDefinition = definitionWith({ id: "maxed_event", triggerType: "arrival", priority: 2, maxTriggerCount: 1 });
    const mutexDefinition = definitionWith({ id: "mutex_event", triggerType: "arrival", priority: 2, mutexGroup: "crew_crisis" });
    const activeMutexDefinition = definitionWith({ id: "active_mutex_event", triggerType: "idle_time", mutexGroup: "crew_crisis" });
    const blockingDefinition = definitionWith({
      id: "blocking_event",
      triggerType: "arrival",
      priority: 2,
      requiresBlockingSlot: true,
    });
    const state = {
      ...createState(),
      crew: {
        amy: {
          ...crew("amy"),
          blocking_event_id: "evt_existing_block",
        },
      },
      active_events: {
        evt_mutex_active: runtimeEvent("evt_mutex_active", "active_mutex_event", "active"),
      },
      world_history: {
        "event:cooldown_event": historyEntry("event:cooldown_event", "cooldown_event", 2, 170),
        "event:maxed_event": historyEntry("event:maxed_event", "maxed_event", 1, null),
      },
    } satisfies GraphRunnerGameState;
    const index = indexFor([
      selectedDefinition,
      cooldownDefinition,
      maxedDefinition,
      mutexDefinition,
      activeMutexDefinition,
      blockingDefinition,
    ]);

    const result = processTrigger({ state, index, context: triggerContext(120) });

    expect(result.errors).toEqual([]);
    expect(result.candidate_report?.filtered_by_history_ids).toEqual(["cooldown_event", "maxed_event"]);
    expect(result.candidate_report?.filtered_by_mutex_ids).toEqual(["mutex_event"]);
    expect(result.candidate_report?.filtered_by_blocking_ids).toEqual(["blocking_event"]);
    expect(result.candidate_report?.selected_event_definition_ids).toEqual(["selectable_event"]);
    expect(result.event?.event_definition_id).toBe("selectable_event");
  });

  it("treats an active crew action as occupying the blocking slot while keeping background events eligible", () => {
    const blockingDefinition = definitionWith({
      id: "blocking_event",
      triggerType: "arrival",
      priority: 5,
      requiresBlockingSlot: true,
    });
    const backgroundDefinition = definitionWith({
      id: "background_event",
      triggerType: "arrival",
      priority: 1,
      requiresBlockingSlot: false,
    });
    const state = {
      ...createState(),
      crew: {
        amy: {
          ...crew("amy"),
          status: "acting",
          current_action_id: "act_move",
          background_event_ids: ["evt_background"],
        },
      },
      crew_actions: {
        act_move: crewAction("act_move"),
      },
      active_events: {
        evt_background: runtimeEvent("evt_background", "background_existing", "active"),
      },
    } satisfies GraphRunnerGameState;
    const index = indexFor([
      blockingDefinition,
      backgroundDefinition,
      definitionWith({ id: "background_existing", triggerType: "idle_time" }),
    ]);

    const result = processTrigger({ state, index, context: triggerContext(120) });

    expect(result.errors).toEqual([]);
    expect(result.candidate_report?.filtered_by_blocking_ids).toEqual(["blocking_event"]);
    expect(result.candidate_report?.selected_event_definition_ids).toEqual(["background_event"]);
    expect(result.event?.event_definition_id).toBe("background_event");
    expect(result.state.crew.amy.current_action_id).toBe("act_move");
  });

  it("filters blocking candidates when an active blocking event or call already owns the crew slot", () => {
    const blockingDefinition = definitionWith({
      id: "blocking_event",
      triggerType: "arrival",
      requiresBlockingSlot: true,
    });
    const backgroundDefinition = definitionWith({
      id: "background_event",
      triggerType: "arrival",
      requiresBlockingSlot: false,
    });
    const index = indexFor([blockingDefinition, backgroundDefinition]);
    const eventBlocked = {
      ...createState(),
      active_events: {
        evt_existing_block: {
          ...runtimeEvent("evt_existing_block", "existing_block", "waiting_time"),
          blocking_claim_ids: ["evt_existing_block:wait:crew_action"],
        },
      },
    } satisfies GraphRunnerGameState;
    const callBlocked = {
      ...createState(),
      active_calls: {
        call_existing_block: {
          id: "call_existing_block",
          event_id: "evt_call",
          event_node_id: "call_node",
          call_template_id: "template",
          crew_id: "amy",
          status: "awaiting_choice" as const,
          created_at: 100,
          connected_at: null,
          ended_at: null,
          expires_at: null,
          render_context_snapshot: {},
          rendered_lines: [],
          available_options: [],
          selected_option_id: null,
          blocking_claim_id: "evt_call:call_node:communication",
        },
      },
    } satisfies GraphRunnerGameState;

    const eventResult = processTrigger({ state: eventBlocked, index, context: triggerContext(120) });
    const callResult = processTrigger({ state: callBlocked, index, context: triggerContext(120) });

    expect(eventResult.candidate_report?.filtered_by_blocking_ids).toEqual(["blocking_event"]);
    expect(eventResult.candidate_report?.selected_event_definition_ids).toEqual(["background_event"]);
    expect(callResult.candidate_report?.filtered_by_blocking_ids).toEqual(["blocking_event"]);
    expect(callResult.candidate_report?.selected_event_definition_ids).toEqual(["background_event"]);
  });

  it("uses priority first and weight for deterministic candidate selection", () => {
    const lowPriority = definitionWith({ id: "low_priority", triggerType: "arrival", priority: 1, weight: 100 });
    const zeroWeight = definitionWith({ id: "zero_weight", triggerType: "arrival", priority: 5, weight: 0 });
    const weightedWinner = definitionWith({ id: "weighted_winner", triggerType: "arrival", priority: 5, weight: 10 });
    const index = indexFor([lowPriority, zeroWeight, weightedWinner]);

    const result = processTrigger({ state: createState(), index, context: triggerContext(120) });

    expect(result.errors).toEqual([]);
    expect(result.candidate_report?.selected_event_definition_ids).toEqual(["weighted_winner"]);
    expect(result.candidate_report?.roll_seed).toBe("arrival:120:amy:2-3");
    expect(result.event?.event_definition_id).toBe("weighted_winner");
  });
});

function scenario(): { definition: EventDefinition; index: EventContentIndex } {
  const definition = eventDefinition([
    callNode("signal_call", { press_on: "success_end", retreat: "retreat_end" }),
    endNode("success_end", "resolved", "pressed_on", false),
    endNode("retreat_end", "cancelled", "retreated", false),
  ]);
  const template = callTemplate();
  const index = new EventContentIndex();
  index.addDefinition(definition);
  index.addCallTemplate(template);

  return { definition, index };
}

function createState(): GraphRunnerGameState {
  return {
    ...createEmptyEventRuntimeState(),
    elapsed_game_seconds: 120,
    crew: {
      amy: crew("amy"),
    },
    tiles: {},
  };
}

function createAuthoredCrashSiteState(
  featureOverrides: Record<string, { id: string; status?: string; revealed?: boolean; investigated?: boolean }> = {},
): GraphRunnerGameState {
  return {
    ...createEmptyEventRuntimeState(),
    elapsed_game_seconds: 240,
    crew: {
      mike: {
        ...crew("mike"),
        display_name: "麦克",
        tile_id: "129-129",
        inventory_id: "inv_mike",
      },
    },
    tiles: {
      "129-129": {
        id: "129-129",
        coordinates: { x: 129, y: 129 },
        terrain_type: "crash_site",
        tags: ["iafs", "crash_site"],
        danger_tags: [],
        discovery_state: "visited",
        survey_state: "surveyed",
        visibility: "visible",
        current_crew_ids: ["mike"],
        resource_nodes: [],
        site_objects: [],
        buildings: [],
        event_marks: [],
        history_keys: [],
      },
    },
    map: {
      tilesById: {
        "129-129": { revealedObjectIds: [] },
      },
      featuresById: {
        iafs_generator: { id: "iafs_generator", status: "damaged", revealed: false },
        iafs_life_support: { id: "iafs_life_support", status: "damaged", revealed: false },
        iafs_shuttle_core: { id: "iafs_shuttle_core", status: "damaged", revealed: false },
        ...featureOverrides,
      },
      mapObjects: {},
    },
    quest_state: createInitialQuestState(questDefinitions, 0),
  };
}

function createAuthoredSuppliesState(elapsedGameSeconds: number): GraphRunnerGameState {
  const state = createAuthoredCrashSiteState();
  const suppliesTile = {
    ...state.tiles["129-129"],
    id: "133-134",
    coordinates: { x: 133, y: 134 },
    terrain_type: "south_pass",
    tags: ["iafs", "supplies"],
    current_crew_ids: ["mike"],
  };

  return {
    ...state,
    elapsed_game_seconds: elapsedGameSeconds,
    crew: {
      ...state.crew,
      mike: {
        ...state.crew.mike,
        tile_id: "133-134",
      },
    },
    tiles: {
      ...state.tiles,
      "133-134": suppliesTile,
    },
    map: {
      ...state.map,
      tilesById: {
        ...state.map?.tilesById,
        "133-134": { revealedObjectIds: [] },
      },
      featuresById: {
        ...state.map?.featuresById,
        iafs_scattered_supplies: { id: "iafs_scattered_supplies", status: "unsearched", revealed: true },
      },
      mapObjects: {},
    },
    inventories: {
      ...state.inventories,
      inv_mike: { id: "inv_mike", owner_type: "crew", owner_id: "mike", items: [], resources: {} },
    },
  };
}

function createAuthoredScavengerCampState(tileId: string): GraphRunnerGameState {
  const state = createAuthoredCrashSiteState();
  const [row, col] = tileId.split("-").map(Number);

  return {
    ...state,
    elapsed_game_seconds: 12000,
    crew: {
      ...state.crew,
      mike: {
        ...state.crew.mike,
        tile_id: tileId,
        status: "idle",
        current_action_id: null,
        communication_state: "available",
      },
    },
    tiles: {
      ...state.tiles,
      [tileId]: {
        id: tileId,
        coordinates: { x: col, y: row },
        terrain_type: "plain",
        tags: ["iafs", "ashfrost", "scavenger_camp"],
        danger_tags: [],
        discovery_state: "visited",
        survey_state: "unsurveyed",
        visibility: "visible",
        current_crew_ids: ["mike"],
        resource_nodes: [],
        site_objects: [],
        buildings: [],
        event_marks: [],
        history_keys: [],
      },
    },
  };
}

function crew(id: string): CrewState {
  return {
    id,
    display_name: "Amy",
    tile_id: "2-3",
    status: "idle",
    attributes: {
      strength: 2,
      agility: 3,
      intelligence: 5,
      perception: 4,
      luck: 3,
    },
    personality_tags: ["steady"],
    expertise_tags: [],
    condition_tags: [],
    communication_state: "available",
    current_action_id: null,
    blocking_event_id: null,
    blocking_call_id: null,
    background_event_ids: [],
    inventory_id: "inv_amy",
    diary_entry_ids: [],
    event_history_keys: [],
  };
}

function triggerContext(occurredAt: number): TriggerContext {
  return {
    trigger_type: "arrival",
    occurred_at: occurredAt,
    source: "tile_system",
    crew_id: "amy",
    tile_id: "2-3",
    action_id: null,
    event_id: null,
    event_definition_id: null,
    node_id: null,
    call_id: null,
    objective_id: null,
    selected_option_id: null,
    world_flag_key: null,
    proximity: null,
    payload: {},
  };
}

function scavengerArrivalContext(tileId: string, occurredAt: number): TriggerContext {
  return {
    ...triggerContext(occurredAt),
    source: "crew_action",
    crew_id: "mike",
    tile_id: tileId,
    action_id: "move:mike:scavenger-camp",
    payload: {
      action_type: "move",
      target_tile_id: tileId,
    },
  };
}

function eventDefinition(nodes: EventNode[]): EventDefinition {
  return {
    schema_version: "event-program-model-v1",
    id: "test_event",
    version: 1,
    domain: "test",
    title: "Test Event",
    summary: "A test event.",
    status: "draft",
    trigger: { type: "arrival", conditions: [] },
    candidate_selection: {
      priority: 1,
      weight: 1,
      max_instances_per_trigger: 1,
      requires_blocking_slot: false,
    },
    repeat_policy: {
      scope: "world",
      cooldown_seconds: 0,
      history_key_template: "test_event",
      allow_while_active: true,
    },
    event_graph: {
      entry_node_id: nodes[0].id,
      nodes,
      edges: [],
      terminal_node_ids: nodes.filter((node) => node.type === "end").map((node) => node.id),
      graph_rules: {
        acyclic: true,
        max_active_nodes: 1,
        allow_parallel_nodes: false,
      },
    },
    effect_groups: [],
    log_templates: [{ id: "route_log", summary: "Route opened", importance: "normal", visibility: "player_visible" }],
    sample_contexts: [triggerContext(120)],
  };
}

function definitionWith(input: {
  id: string;
  triggerType: TriggerContext["trigger_type"];
  nodes?: EventNode[];
  priority?: number;
  weight?: number;
  mutexGroup?: string | null;
  requiresBlockingSlot?: boolean;
  cooldownSeconds?: number;
  maxTriggerCount?: number | null;
}): EventDefinition {
  const nodes = input.nodes ?? [endNode("end", "resolved", `${input.id}_resolved`, false)];
  return {
    ...eventDefinition(nodes),
    id: input.id,
    title: input.id,
    trigger: { type: input.triggerType, conditions: [] },
    candidate_selection: {
      priority: input.priority ?? 1,
      weight: input.weight ?? 1,
      mutex_group: input.mutexGroup ?? null,
      max_instances_per_trigger: 1,
      requires_blocking_slot: input.requiresBlockingSlot ?? false,
    },
    repeat_policy: {
      scope: "world",
      max_trigger_count: input.maxTriggerCount ?? null,
      cooldown_seconds: input.cooldownSeconds ?? 0,
      history_key_template: `event:${input.id}`,
      allow_while_active: true,
    },
    sample_contexts: [{ ...triggerContext(120), trigger_type: input.triggerType, event_definition_id: input.id }],
  };
}

function indexFor(definitions: EventDefinition[], templates: CallTemplate[] = []): EventContentIndex {
  const index = new EventContentIndex();
  definitions.forEach((definition) => index.addDefinition(definition));
  templates.forEach((template) => index.addCallTemplate(template));
  return index;
}

function baseNode(id: string, type: EventNode["type"]) {
  return {
    id,
    type,
    title: id,
    blocking: {
      occupies_crew_action: false,
      occupies_communication: false,
      blocking_key_template: null,
    },
  };
}

function actionRequestNode(id: string, onCompletedNodeId: string, onFailedNodeId: string): ActionRequestNode {
  return {
    ...baseNode(id, "action_request"),
    type: "action_request",
    request_id: `${id}_request`,
    action_type: "survey",
    target_crew_ref: { type: "primary_crew" },
    target_tile_ref: { type: "event_tile" },
    action_params: {},
    acceptance_conditions: [],
    completion_trigger: { type: "action_complete", conditions: [] },
    on_completed_node_id: onCompletedNodeId,
    on_failed_node_id: onFailedNodeId,
    occupies_crew_action: false,
  };
}

function objectiveNode(id: string, onCompletedNodeId: string, onFailedNodeId: string): ObjectiveNode {
  return {
    ...baseNode(id, "objective"),
    type: "objective",
    objective_template: {
      title: "Map the site",
      summary: "Map the site.",
      target_tile_ref: { type: "event_tile" },
      eligible_crew_conditions: [],
      required_action_type: "survey",
      required_action_params: {},
    },
    mode: "create_and_wait",
    on_completed_node_id: onCompletedNodeId,
    on_failed_node_id: onFailedNodeId,
    parent_event_link: true,
  };
}

function waitNode(id: string, durationSeconds: number, nextNodeId: string): WaitNode {
  return {
    ...baseNode(id, "wait"),
    type: "wait",
    duration_seconds: durationSeconds,
    wake_trigger_type: "time_wakeup",
    next_node_id: nextNodeId,
    set_next_wakeup_at: true,
    interrupt_policy: "not_interruptible",
  };
}

function runtimeEvent(id: string, definitionId: string, status: GraphRunnerGameState["active_events"][string]["status"]) {
  return {
    id,
    event_definition_id: definitionId,
    event_definition_version: 1,
    status,
    current_node_id: "entry",
    primary_crew_id: "amy",
    related_crew_ids: [],
    primary_tile_id: "2-3",
    related_tile_ids: [],
    child_event_ids: [],
    objective_ids: [],
    active_call_id: null,
    selected_options: {},
    random_results: {},
    blocking_claim_ids: [],
    created_at: 100,
    updated_at: 100,
    deadline_at: null,
    next_wakeup_at: null,
    trigger_context_snapshot: triggerContext(100),
    history_keys: [],
    result_key: null,
    result_summary: null,
  };
}

function crewAction(id: string) {
  return {
    id,
    crew_id: "amy",
    type: "move" as const,
    status: "active" as const,
    source: "event_action_request" as const,
    parent_event_id: null,
    objective_id: null,
    action_request_id: null,
    from_tile_id: "2-3",
    to_tile_id: "base",
    target_tile_id: "base",
    path_tile_ids: [],
    started_at: 100,
    ends_at: 160,
    progress_seconds: 20,
    duration_seconds: 60,
    action_params: {},
    can_interrupt: true,
    interrupt_duration_seconds: 10,
  };
}

function historyEntry(key: string, eventDefinitionId: string, triggerCount: number, cooldownUntil: number | null) {
  return {
    key,
    scope: "world" as const,
    event_definition_id: eventDefinitionId,
    event_id: null,
    crew_id: "amy",
    tile_id: "2-3",
    objective_id: null,
    first_triggered_at: 90,
    last_triggered_at: 100,
    trigger_count: triggerCount,
    last_result: null,
    cooldown_until: cooldownUntil,
  };
}

function callNode(id: string, mapping: Record<string, string>): CallNode {
  return {
    ...baseNode(id, "call"),
    type: "call",
    call_template_id: "signal_template",
    speaker_crew_ref: { type: "primary_crew" },
    urgency: "urgent",
    delivery: "incoming_call",
    options: [
      { id: "press_on" },
      {
        id: "retreat",
        requirements: [{ type: "world_flag_equals", field: "retreat_unlocked", value: true }],
      },
    ],
    option_node_mapping: mapping,
  };
}

function endNode(id: string, resolution: EndNode["resolution"], resultKey: string, deleteActiveCalls: boolean): EndNode {
  return {
    ...baseNode(id, "end"),
    type: "end",
    resolution,
    result_key: resultKey,
    event_log_template_id: "route_log",
    history_writes: [],
    cleanup_policy: {
      release_blocking_claims: true,
      delete_active_calls: deleteActiveCalls,
      keep_player_summary: true,
    },
  };
}

function callTemplate(): CallTemplate {
  const steadyCondition = [{ type: "has_tag", target: { type: "primary_crew" }, field: "personality_tags", value: "steady" }] as const;

  return {
    schema_version: "event-program-model-v1",
    id: "signal_template",
    version: 1,
    domain: "test",
    event_definition_id: "test_event",
    node_id: "signal_call",
    render_context_fields: ["crew_id", "personality_tags", "event_pressure"],
    opening_lines: {
      selection: "best_match",
      variants: [{ id: "opening_default", text: "Report in.", priority: 0 }],
    },
    option_lines: {
      press_on: {
        selection: "best_match",
        variants: [
          { id: "press_default", text: "Proceed", priority: 0 },
          { id: "press_steady", text: "Keep searching carefully", when: [...steadyCondition], priority: 5 },
        ],
      },
      retreat: {
        selection: "best_match",
        variants: [{ id: "retreat_default", text: "Fall back", priority: 0 }],
      },
    },
    fallback_order: ["personality_tags", "default"],
    default_variant_required: true,
  };
}
