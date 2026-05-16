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
  type SpawnEventNode,
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
        tile_id: "116-112",
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
    const routeReply = selectCallOption({
      state: route.state,
      index: indexResult.index,
      call_id: routeCallId,
      option_id: "find_exit_route",
      occurred_at: 4,
    });
    const routeReplyCallId = routeReply.event?.active_call_id ?? "";
    const ended = selectCallOption({
      state: routeReply.state,
      index: indexResult.index,
      call_id: routeReplyCallId,
      option_id: "ack_find_exit_route",
      occurred_at: 5,
    });
    const quest = ended.state.quest_state?.quests.regroup_after_crash;

    expect(facilities.errors).toEqual([]);
    expect(cargo.errors).toEqual([]);
    expect(route.errors).toEqual([]);
    expect(routeReply.errors).toEqual([]);
    expect(routeReply.event?.current_node_id).toBe("route_exit_reply");
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
        tile_id: "116-112",
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
    expect(selected.state.map?.tilesById?.["116-112"]?.revealedObjectIds).toEqual([]);
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

  it("reveals the authored scattered supplies object after surveying tile 120-117", () => {
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
        tile_id: "120-117",
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
    expect(selected.state.map?.tilesById?.["120-117"]?.revealedObjectIds).toEqual([]);
    expect(selected.state.map?.featuresById?.iafs_scattered_supplies).toMatchObject({
      id: "iafs_scattered_supplies",
      status: "unsearched",
      revealed: true,
    });
  });

  it("starts the authored scavenger camp outer discovery call on observation-zone arrival", () => {
    const indexResult = buildEventContentIndex(eventContentLibrary);
    expect(indexResult.errors).toEqual([]);
    const triggerTiles = ["93-115", "93-116", "93-117", "94-115", "94-116", "94-117"];

    for (const tileId of triggerTiles) {
      const started = processTrigger({
        state: createAuthoredScavengerCampState(tileId),
        index: indexResult.index,
        context: scavengerArrivalContext(tileId, 11880),
      });
      const callId = started.event?.active_call_id ?? "";
      const callText = started.state.active_calls[callId]?.rendered_lines.map((line) => line.text).join(" ") ?? "";

      expect(started.errors).toEqual([]);
      expect(started.candidate_report?.selected_event_definition_ids).toEqual(["iafs_scavenger_camp_outer_discovery"]);
      expect(callText).toContain("拾荒者住出来的地方");
      expect(callText).toContain("旧舱板、岩片和遮风布");
      expect(started.state.active_calls[callId]?.available_options.map((option) => option.option_id)).toEqual([
        "opt_approach",
        "opt_standby",
      ]);
    }
  });

  it("starts moving toward the sentry line after the authored scavenger camp approach choice", () => {
    const indexResult = buildEventContentIndex(eventContentLibrary);
    expect(indexResult.errors).toEqual([]);
    const started = processTrigger({
      state: createAuthoredScavengerCampState("93-116"),
      index: indexResult.index,
      context: scavengerArrivalContext("93-116", 11880),
    });
    const callId = started.event?.active_call_id ?? "";
    const reply = selectCallOption({
      state: started.state,
      index: indexResult.index,
      call_id: callId,
      option_id: "opt_approach",
      occurred_at: 11895,
    });
    const replyCallId = reply.event?.active_call_id ?? "";
    const ended = selectCallOption({
      state: reply.state,
      index: indexResult.index,
      call_id: replyCallId,
      option_id: "ack_outer_approach",
      occurred_at: 11905,
    });
    const moveAction = ended.state.crew_actions.iafs_scavenger_outer_approach_move;

    expect(reply.errors).toEqual([]);
    expect(reply.event?.current_node_id).toBe("outer_approach_reply");
    expect(ended.errors).toEqual([]);
    expect(ended.event?.status).toBe("resolved");
    expect(ended.event?.result_key).toBe("scavenger_outer_approach");
    expect(ended.state.world_flags.iafs_scavenger_outer_discovery_choice?.value).toBe("approach");
    expect(moveAction).toMatchObject({
      id: "iafs_scavenger_outer_approach_move",
      crew_id: "mike",
      type: "move",
      status: "active",
      target_tile_id: "92-116",
      duration_seconds: 30,
      action_params: { intent: "approach_scavenger_sentry_line" },
    });
    expect(ended.state.crew.mike.current_action_id).toBe("iafs_scavenger_outer_approach_move");
  });

  it("records the authored scavenger camp standby choice without starting movement", () => {
    const indexResult = buildEventContentIndex(eventContentLibrary);
    expect(indexResult.errors).toEqual([]);
    const started = processTrigger({
      state: createAuthoredScavengerCampState("93-116"),
      index: indexResult.index,
      context: scavengerArrivalContext("93-116", 11880),
    });
    const callId = started.event?.active_call_id ?? "";
    const reply = selectCallOption({
      state: started.state,
      index: indexResult.index,
      call_id: callId,
      option_id: "opt_standby",
      occurred_at: 11895,
    });
    const replyCallId = reply.event?.active_call_id ?? "";
    const ended = selectCallOption({
      state: reply.state,
      index: indexResult.index,
      call_id: replyCallId,
      option_id: "ack_outer_standby",
      occurred_at: 11905,
    });

    expect(reply.errors).toEqual([]);
    expect(reply.event?.current_node_id).toBe("outer_standby_reply");
    expect(ended.errors).toEqual([]);
    expect(ended.event?.status).toBe("resolved");
    expect(ended.event?.result_key).toBe("scavenger_outer_standby");
    expect(ended.state.world_flags.iafs_scavenger_outer_discovery_choice?.value).toBe("standby");
    expect(ended.state.crew_actions).toEqual({});
    expect(ended.state.crew.mike.current_action_id).toBeNull();
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
      const callText = call?.rendered_lines.map((line) => line.text).join(" ") ?? "";

      expect(started.errors).toEqual([]);
      expect(started.candidate_report?.selected_event_definition_ids).toEqual(["iafs_scavenger_sentry_line_contact"]);
      expect(callText).toContain("灰白包巾");
      expect(callText).toContain("管枪式自制武器");
      expect(callText).toContain("先别急，我看得见他的手");
	      expect(callText).toContain("不要紧指挥官，我现在隐藏得很好。啊……！");
	      expect(callText).toContain("（通讯另一端突然传来另一个陌生男子的声音，是命令式的语气）");
	      expect(callText).toContain("陌生男子：站住！线外说话，手别乱动。");
	      expect(call?.available_options).toEqual([
	        expect.objectContaining({
	          option_id: "opt_observe",
	          display_tag: "感知",
	          check_preview: expect.objectContaining({ attribute: "perception", attribute_label: "感知", dc: 10, die_sides: 20 }),
	        }),
	        expect.objectContaining({
	          option_id: "opt_threaten",
	          display_tag: "体能",
	          check_preview: expect.objectContaining({ attribute: "strength", attribute_label: "体能", dc: 14, die_sides: 20 }),
	        }),
	        expect.objectContaining({
	          option_id: "opt_negotiate",
	        }),
	        expect.objectContaining({
	          option_id: "opt_chat",
	          display_tag: "智力",
	          check_preview: expect.objectContaining({ attribute: "intelligence", attribute_label: "智力", dc: 12, die_sides: 20 }),
	        }),
	      ]);
	      expect(call?.available_options.find((option) => option.option_id === "opt_negotiate")?.display_tag).toBeUndefined();
	    }
	  });

	  it("returns to the scavenger camp sentry challenge after a failed observe attempt", () => {
    const indexResult = buildEventContentIndex(eventContentLibrary);
    expect(indexResult.errors).toEqual([]);
    const started = processTrigger({
      state: createAuthoredScavengerCampState("92-116"),
      index: indexResult.index,
      context: scavengerArrivalContext("92-116", 12001),
    });
    const challengeCallId = started.event?.active_call_id ?? "";
    const failedObserve = selectCallOption({
      state: started.state,
      index: indexResult.index,
      call_id: challengeCallId,
      option_id: "opt_observe",
      occurred_at: 12015,
	    });
	    const failedObserveCallId = failedObserve.event?.active_call_id ?? "";
	    const returned = selectCallOption({
	      state: failedObserve.state,
	      index: indexResult.index,
      call_id: failedObserveCallId,
      option_id: "ack_observe_failure",
      occurred_at: 12025,
    });
	    const returnedCallId = returned.event?.active_call_id ?? "";
	    const returnedOptions = returned.state.active_calls[returnedCallId]?.available_options.map((option) => option.option_id) ?? [];

	    expect(failedObserve.errors).toEqual([]);
	    expect(failedObserve.event?.current_node_id).toBe("observe_partial_failure");
	    expect(failedObserve.event?.check_results.sentry_observe).toEqual(
	      expect.objectContaining({
	        node_id: "check_observe",
	        attribute: "perception",
	        attribute_label: "感知",
	        die_sides: 20,
	        roll: 5,
	        modifier: 4,
	        total: 9,
	        dc: 10,
	        outcome: "failure",
	        next_node_id: "observe_partial_failure",
	      }),
	    );
	    expect(returned.errors).toEqual([]);
	    expect(returned.event?.current_node_id).toBe("sentry_challenge");
	    expect(returned.event?.status).toBe("waiting_call");
	    expect(returned.state.world_flags.iafs_scavenger_sentry_observe_tried?.value).toBe(true);
	    expect(returned.state.world_flags.iafs_scavenger_sentry_observe_result?.value).toBe("failed");
	    expect(returnedOptions).toEqual(["opt_threaten", "opt_negotiate", "opt_chat"]);
	  });

	  it("routes a successful observe supply offer through a luck check into the chief callback", () => {
	    const indexResult = buildEventContentIndex(eventContentLibrary);
	    expect(indexResult.errors).toEqual([]);
	    const started = processTrigger({
	      state: createAuthoredScavengerCampState("92-116"),
	      index: indexResult.index,
	      context: scavengerArrivalContext("92-116", 12002),
	    });
	    const challengeCallId = started.event?.active_call_id ?? "";
	    const eavesdrop = selectCallOption({
	      state: started.state,
	      index: indexResult.index,
	      call_id: challengeCallId,
	      option_id: "opt_observe",
	      occurred_at: 12015,
	    });
	    const eavesdropCallId = eavesdrop.event?.active_call_id ?? "";
	    const eavesdropCall = eavesdrop.state.active_calls[eavesdropCallId];
	    const eavesdropText = eavesdropCall?.rendered_lines.map((line) => line.text).join(" ") ?? "";
	    const offered = selectCallOption({
	      state: eavesdrop.state,
	      index: indexResult.index,
	      call_id: eavesdropCallId,
	      option_id: "offer_supply_after_observe",
	      occurred_at: 12025,
	    });
	    const offeredCallId = offered.event?.active_call_id ?? "";
	    const offeredCall = offered.state.active_calls[offeredCallId];
	    const ended = selectCallOption({
	      state: offered.state,
	      index: indexResult.index,
	      call_id: offeredCallId,
	      option_id: "ack_supply_offer_wait",
	      occurred_at: 12035,
	    });

	    expect(eavesdrop.errors).toEqual([]);
	    expect(eavesdrop.event?.current_node_id).toBe("observe_eavesdrop");
	    expect(eavesdrop.event?.check_results.sentry_observe).toEqual(
	      expect.objectContaining({
	        node_id: "check_observe",
	        attribute: "perception",
	        attribute_label: "感知",
	        die_sides: 20,
	        roll: 10,
	        modifier: 4,
	        total: 14,
	        dc: 10,
	        outcome: "success",
	        next_node_id: "observe_eavesdrop",
	      }),
	    );
	    expect(eavesdropCall?.rendered_lines[0]).toEqual(
	      expect.objectContaining({
	        text: "麦克 骰出了 10，加上 感知 数值 4，最终结果是 14. 判定要求是 10. 检定成功。",
	        animation: expect.objectContaining({ type: "d20_roll", final_text: "10" }),
	      }),
	    );
	    expect(eavesdropText).toContain("很缺维持性物资");
	    expect(eavesdropCall?.available_options).toEqual([
	      expect.objectContaining({
	        option_id: "offer_supply_after_observe",
	        display_tag: "运气",
	        check_preview: expect.objectContaining({ attribute: "luck", attribute_label: "运气", dc: 12, die_sides: 20 }),
	      }),
	    ]);
	    expect(offered.errors).toEqual([]);
	    expect(offered.event?.current_node_id).toBe("supply_offer_wait");
	    expect(offered.event?.check_results.sentry_supply_offer_luck).toEqual(
	      expect.objectContaining({
	        node_id: "check_supply_offer_luck",
	        attribute: "luck",
	        attribute_label: "运气",
	        die_sides: 20,
	        roll: 20,
	        modifier: 3,
	        total: 23,
	        dc: 12,
	        outcome: "success",
	        next_node_id: "supply_offer_wait",
	      }),
	    );
	    expect(offeredCall?.rendered_lines[0]).toEqual(
	      expect.objectContaining({
	        text: "麦克 骰出了 20，加上 运气 数值 3，最终结果是 23. 判定要求是 12. 检定成功。",
	        animation: expect.objectContaining({ type: "d20_roll", final_text: "20" }),
	      }),
	    );
	    expect(ended.errors).toEqual([]);
	    expect(ended.event?.status).toBe("resolved");
	    expect(ended.event?.result_key).toBe("scavenger_sentry_supply_offer_waiting");
	    expect(ended.state.world_flags.iafs_scavenger_supply_leverage_discovered?.value).toBe(true);
	    expect(ended.state.world_flags.iafs_scavenger_supply_leverage_source?.value).toBe("eavesdrop");
	    expect(ended.state.world_flags.iafs_scavenger_chief_entry_reason?.value).toBe("supply_offer_eavesdrop");
	    expect(ended.state.world_flags.iafs_scavenger_supply_offer_pending?.value).toBe(true);

	    const callbackEvent = Object.values(ended.state.active_events).find(
	      (event) => event.event_definition_id === "iafs_scavenger_supply_chief_callback",
	    );
	    expect(callbackEvent).toEqual(
	      expect.objectContaining({
	        current_node_id: "wait_for_supply_chief_callback",
	        status: "waiting_time",
	        next_wakeup_at: 12155,
	        parent_event_id: ended.event?.id,
	      }),
	    );

	    const early = processEventWakeups({ state: ended.state, index: indexResult.index, elapsed_game_seconds: 12154 });
	    expect(early.errors).toEqual([]);
	    expect(Object.values(early.state.active_calls).some((call) => call.event_node_id === "supply_chief_callback")).toBe(false);

	    const due = processEventWakeups({ state: ended.state, index: indexResult.index, elapsed_game_seconds: 12155 });
	    const callbackDueEvent = Object.values(due.state.active_events).find(
	      (event) => event.event_definition_id === "iafs_scavenger_supply_chief_callback",
	    );
	    const callbackCallId = callbackDueEvent?.active_call_id ?? "";
	    const callbackText = due.state.active_calls[callbackCallId]?.rendered_lines.map((line) => line.text).join(" ") ?? "";

	    expect(due.errors).toEqual([]);
	    expect(callbackDueEvent).toEqual(expect.objectContaining({ current_node_id: "supply_chief_callback", status: "waiting_call" }));
	    expect(callbackText).toContain("村长愿意见你");
	    expect(due.state.world_flags.iafs_scavenger_chief_entry_ready?.value).toBe(true);
	    expect(due.state.world_flags.iafs_scavenger_chief_entry_signal?.value).toBe("supply_callback");
	  });

	  it("returns to the sentry challenge when an eavesdropped supply offer sounds suspicious", () => {
	    const indexResult = buildEventContentIndex(eventContentLibrary);
	    expect(indexResult.errors).toEqual([]);
	    const started = processTrigger({
	      state: createAuthoredScavengerCampState("92-116"),
	      index: indexResult.index,
	      context: scavengerArrivalContext("92-116", 12000),
	    });
	    const challengeCallId = started.event?.active_call_id ?? "";
	    const eavesdrop = selectCallOption({
	      state: started.state,
	      index: indexResult.index,
	      call_id: challengeCallId,
	      option_id: "opt_observe",
	      occurred_at: 12015,
	    });
	    const eavesdropCallId = eavesdrop.event?.active_call_id ?? "";
	    const suspicious = selectCallOption({
	      state: eavesdrop.state,
	      index: indexResult.index,
	      call_id: eavesdropCallId,
	      option_id: "offer_supply_after_observe",
	      occurred_at: 12025,
	    });
	    const suspiciousCallId = suspicious.event?.active_call_id ?? "";
	    const suspiciousText = suspicious.state.active_calls[suspiciousCallId]?.rendered_lines.map((line) => line.text).join(" ") ?? "";
	    const returned = selectCallOption({
	      state: suspicious.state,
	      index: indexResult.index,
	      call_id: suspiciousCallId,
	      option_id: "ack_supply_offer_suspicion",
	      occurred_at: 12035,
	    });
	    const returnedCallId = returned.event?.active_call_id ?? "";

	    expect(suspicious.errors).toEqual([]);
	    expect(suspicious.event?.current_node_id).toBe("supply_offer_suspicion");
	    expect(suspicious.event?.check_results.sentry_supply_offer_luck).toEqual(
	      expect.objectContaining({
	        roll: 8,
	        modifier: 3,
	        total: 11,
	        dc: 12,
	        outcome: "failure",
	        next_node_id: "supply_offer_suspicion",
	      }),
	    );
	    expect(suspiciousText).toContain("烬炉派你来的");
	    expect(returned.errors).toEqual([]);
	    expect(returned.event?.current_node_id).toBe("sentry_challenge");
	    expect(returned.event?.status).toBe("waiting_call");
	    expect(returned.state.world_flags.iafs_scavenger_sentry_suspects_cinder_agent?.value).toBe(true);
	    expect(returned.state.active_calls[returnedCallId]?.available_options.map((option) => option.option_id)).toEqual([
	      "opt_threaten",
	      "opt_negotiate",
	      "opt_chat",
	    ]);
	  });

	  it("shows Alice's family handkerchief option and routes it without consuming the item", () => {
	    const indexResult = buildEventContentIndex(eventContentLibrary);
	    expect(indexResult.errors).toEqual([]);
	    const started = processTrigger({
	      state: createAuthoredScavengerCampState("92-116", "alice"),
	      index: indexResult.index,
	      context: scavengerArrivalContext("92-116", 12000, "alice"),
	    });
	    const challengeCallId = started.event?.active_call_id ?? "";
	    const call = started.state.active_calls[challengeCallId];

	    expect(started.errors).toEqual([]);
	    expect(call?.available_options.map((option) => option.option_id)).toEqual([
	      "opt_observe",
	      "opt_threaten",
	      "opt_negotiate",
	      "opt_chat",
	      "opt_heir_handkerchief",
	    ]);
	    expect(call?.available_options.find((option) => option.option_id === "opt_heir_handkerchief")).toEqual(
	      expect.objectContaining({
	        display_tag: "家族继承人候选",
	        text: "展示自己的家徽手帕。",
	      }),
	    );

	    const reply = selectCallOption({
	      state: started.state,
	      index: indexResult.index,
	      call_id: challengeCallId,
	      option_id: "opt_heir_handkerchief",
	      occurred_at: 12015,
	    });
	    const replyCallId = reply.event?.active_call_id ?? "";
	    const replyText = reply.state.active_calls[replyCallId]?.rendered_lines.map((line) => line.text).join(" ") ?? "";
	    const ended = selectCallOption({
	      state: reply.state,
	      index: indexResult.index,
	      call_id: replyCallId,
	      option_id: "ack_heir_handkerchief",
	      occurred_at: 12025,
	    });

	    expect(reply.errors).toEqual([]);
	    expect(reply.event?.current_node_id).toBe("heir_handkerchief_reply");
	    expect(replyText).toContain("家徽没有藏起来");
	    expect(replyText).toContain("我让能认这个的人过来");
	    expect(ended.errors).toEqual([]);
	    expect(ended.event?.status).toBe("resolved");
	    expect(ended.event?.result_key).toBe("scavenger_sentry_heir_handkerchief");
	    expect(ended.state.world_flags.iafs_scavenger_sentry_opening_choice?.value).toBe("heir_handkerchief");
	    expect(ended.state.world_flags.iafs_scavenger_heir_chief_invitation_pending?.value).toBe(true);
	    expect(ended.state.inventories.inv_alice.items).toEqual([{ item_id: "monogrammed_handkerchief", quantity: 1 }]);

	    const invitationEvent = Object.values(ended.state.active_events).find(
	      (event) => event.event_definition_id === "iafs_scavenger_heir_chief_invitation",
	    );
	    expect(invitationEvent).toEqual(
	      expect.objectContaining({
	        current_node_id: "wait_for_invitation",
	        status: "waiting_time",
	        next_wakeup_at: 12145,
	        parent_event_id: ended.event?.id,
	      }),
	    );
	  });

	  it("delays the heir chief invitation and returns to the choice after reading sentry doubts", () => {
	    const indexResult = buildEventContentIndex(eventContentLibrary);
	    expect(indexResult.errors).toEqual([]);
	    const started = processTrigger({
	      state: createAuthoredScavengerCampState("92-116", "alice"),
	      index: indexResult.index,
	      context: scavengerArrivalContext("92-116", 12001, "alice"),
	    });
	    const challengeCallId = started.event?.active_call_id ?? "";
	    const reply = selectCallOption({
	      state: started.state,
	      index: indexResult.index,
	      call_id: challengeCallId,
	      option_id: "opt_heir_handkerchief",
	      occurred_at: 12015,
	    });
	    const replyCallId = reply.event?.active_call_id ?? "";
	    const delayed = selectCallOption({
	      state: reply.state,
	      index: indexResult.index,
	      call_id: replyCallId,
	      option_id: "ack_heir_handkerchief",
	      occurred_at: 12025,
	    });

	    const early = processEventWakeups({ state: delayed.state, index: indexResult.index, elapsed_game_seconds: 12144 });
	    expect(early.errors).toEqual([]);
	    expect(Object.values(early.state.active_calls).some((call) => call.event_node_id === "chief_invitation")).toBe(false);

	    const due = processEventWakeups({ state: delayed.state, index: indexResult.index, elapsed_game_seconds: 12145 });
	    const invitationEvent = Object.values(due.state.active_events).find(
	      (event) => event.event_definition_id === "iafs_scavenger_heir_chief_invitation",
	    );
	    const invitationCallId = invitationEvent?.active_call_id ?? "";
	    const invitationCall = due.state.active_calls[invitationCallId];

	    expect(due.errors).toEqual([]);
	    expect(invitationEvent).toEqual(expect.objectContaining({ current_node_id: "chief_invitation", status: "waiting_call" }));
	    expect(invitationCall?.available_options.map((option) => option.text)).toEqual([
	      "同意见村长。",
	      "观察哨兵的迟疑。",
	      "拒绝见村长，原地待命。",
	    ]);
	    expect(invitationCall?.available_options.find((option) => option.option_id === "opt_read_sentry")).toEqual(
	      expect.objectContaining({
	        display_tag: "感知",
	        check_preview: expect.objectContaining({ attribute: "perception", attribute_label: "感知", dc: 12, die_sides: 20 }),
	      }),
	    );

	    const readDoubts = selectCallOption({
	      state: due.state,
	      index: indexResult.index,
	      call_id: invitationCallId,
	      option_id: "opt_read_sentry",
	      occurred_at: 12155,
	    });
	    const doubtsCallId = readDoubts.event?.active_call_id ?? "";
	    const doubtsText = readDoubts.state.active_calls[doubtsCallId]?.rendered_lines.map((line) => line.text).join(" ") ?? "";

	    expect(readDoubts.errors).toEqual([]);
	    expect(readDoubts.event?.current_node_id).toBe("sentry_doubts_read_reply");
	    expect(readDoubts.event?.check_results.sentry_doubts).toEqual(
	      expect.objectContaining({
	        node_id: "check_sentry_doubts",
	        attribute: "perception",
	        attribute_label: "感知",
	        die_sides: 20,
	        roll: 17,
	        modifier: 4,
	        total: 21,
	        dc: 12,
	        outcome: "success",
	        next_node_id: "sentry_doubts_read_reply",
	      }),
	    );
	    expect(doubtsText).toContain("武器和外来装备");
	    expect(doubtsText).toContain("这里明显缺物资");
	    expect(readDoubts.state.world_flags.iafs_scavenger_sentry_doubts_tried?.value).toBe(true);
	    expect(readDoubts.state.world_flags.iafs_scavenger_sentry_doubts_read?.value).toBe(true);

	    const returned = selectCallOption({
	      state: readDoubts.state,
	      index: indexResult.index,
	      call_id: doubtsCallId,
	      option_id: "ack_sentry_doubts_read",
	      occurred_at: 12165,
	    });
	    const returnedCallId = returned.event?.active_call_id ?? "";
	    const returnedOptions = returned.state.active_calls[returnedCallId]?.available_options.map((option) => option.text) ?? [];

	    expect(returned.errors).toEqual([]);
	    expect(returned.event?.current_node_id).toBe("chief_invitation");
	    expect(returnedOptions).toEqual(["同意见村长。", "拒绝见村长，原地待命。"]);
	  });

	  it("starts the chief meeting when Alice accepts the heir invitation", () => {
	    const indexResult = buildEventContentIndex(eventContentLibrary);
	    expect(indexResult.errors).toEqual([]);
	    const started = processTrigger({
	      state: createAuthoredScavengerCampState("92-116", "alice"),
	      index: indexResult.index,
	      context: scavengerArrivalContext("92-116", 12000, "alice"),
	    });
	    const challengeCallId = started.event?.active_call_id ?? "";
	    const reply = selectCallOption({
	      state: started.state,
	      index: indexResult.index,
	      call_id: challengeCallId,
	      option_id: "opt_heir_handkerchief",
	      occurred_at: 12015,
	    });
	    const replyCallId = reply.event?.active_call_id ?? "";
	    const delayed = selectCallOption({
	      state: reply.state,
	      index: indexResult.index,
	      call_id: replyCallId,
	      option_id: "ack_heir_handkerchief",
	      occurred_at: 12025,
	    });
	    const due = processEventWakeups({ state: delayed.state, index: indexResult.index, elapsed_game_seconds: 12145 });
	    const invitationEvent = Object.values(due.state.active_events).find(
	      (event) => event.event_definition_id === "iafs_scavenger_heir_chief_invitation",
	    );
	    const invitationCallId = invitationEvent?.active_call_id ?? "";
	    const accepted = selectCallOption({
	      state: due.state,
	      index: indexResult.index,
	      call_id: invitationCallId,
	      option_id: "opt_accept_chief",
	      occurred_at: 12155,
	    });
	    const acceptCallId = accepted.event?.active_call_id ?? "";
	    const meetingStarted = selectCallOption({
	      state: accepted.state,
	      index: indexResult.index,
	      call_id: acceptCallId,
	      option_id: "ack_accept_chief",
	      occurred_at: 12165,
	    });
	    const chiefMeeting = Object.values(meetingStarted.state.active_events).find(
	      (event) => event.event_definition_id === "iafs_scavenger_chief_meeting",
	    );

	    expect(accepted.errors).toEqual([]);
	    expect(accepted.event?.current_node_id).toBe("accept_chief_reply");
	    expect(meetingStarted.errors).toEqual([]);
	    expect(meetingStarted.event?.result_key).toBe("scavenger_chief_meeting_accept_now");
	    expect(meetingStarted.state.world_flags.iafs_scavenger_chief_entry_reason?.value).toBe("heir_handkerchief");
	    expect(meetingStarted.state.world_flags.iafs_scavenger_chief_entry_ready?.value).toBe(true);
	    expect(meetingStarted.state.world_flags.iafs_scavenger_chief_entry_signal?.value).toBe("heir_invitation");
	    expect(chiefMeeting).toEqual(
	      expect.objectContaining({
	        current_node_id: "chief_meeting_opening",
	        status: "waiting_call",
	        parent_event_id: invitationEvent?.id,
	      }),
	    );
	  });

	  it("returns to the heir chief invitation after a failed doubts read and can defer the meeting", () => {
	    const indexResult = buildEventContentIndex(eventContentLibrary);
	    expect(indexResult.errors).toEqual([]);
	    const started = processTrigger({
	      state: createAuthoredScavengerCampState("92-116", "alice"),
	      index: indexResult.index,
	      context: scavengerArrivalContext("92-116", 12000, "alice"),
	    });
	    const challengeCallId = started.event?.active_call_id ?? "";
	    const reply = selectCallOption({
	      state: started.state,
	      index: indexResult.index,
	      call_id: challengeCallId,
	      option_id: "opt_heir_handkerchief",
	      occurred_at: 12015,
	    });
	    const replyCallId = reply.event?.active_call_id ?? "";
	    const delayed = selectCallOption({
	      state: reply.state,
	      index: indexResult.index,
	      call_id: replyCallId,
	      option_id: "ack_heir_handkerchief",
	      occurred_at: 12025,
	    });
	    const due = processEventWakeups({ state: delayed.state, index: indexResult.index, elapsed_game_seconds: 12145 });
	    const invitationEvent = Object.values(due.state.active_events).find(
	      (event) => event.event_definition_id === "iafs_scavenger_heir_chief_invitation",
	    );
	    const invitationCallId = invitationEvent?.active_call_id ?? "";

	    const missed = selectCallOption({
	      state: due.state,
	      index: indexResult.index,
	      call_id: invitationCallId,
	      option_id: "opt_read_sentry",
	      occurred_at: 12155,
	    });
	    const missedCallId = missed.event?.active_call_id ?? "";
	    const missedText = missed.state.active_calls[missedCallId]?.rendered_lines.map((line) => line.text).join(" ") ?? "";

	    expect(missed.errors).toEqual([]);
	    expect(missed.event?.current_node_id).toBe("sentry_doubts_missed_reply");
	    expect(missed.event?.check_results.sentry_doubts).toEqual(
	      expect.objectContaining({
	        roll: 7,
	        modifier: 4,
	        total: 11,
	        dc: 12,
	        outcome: "failure",
	        next_node_id: "sentry_doubts_missed_reply",
	      }),
	    );
	    expect(missedText).toContain("看不出更具体的东西");
	    expect(missed.state.world_flags.iafs_scavenger_sentry_doubts_tried?.value).toBe(true);
	    expect(missed.state.world_flags.iafs_scavenger_sentry_doubts_read).toBeUndefined();

	    const returned = selectCallOption({
	      state: missed.state,
	      index: indexResult.index,
	      call_id: missedCallId,
	      option_id: "ack_sentry_doubts_missed",
	      occurred_at: 12165,
	    });
	    const returnedCallId = returned.event?.active_call_id ?? "";
	    expect(returned.state.active_calls[returnedCallId]?.available_options.map((option) => option.option_id)).toEqual([
	      "opt_accept_chief",
	      "opt_decline_chief",
	    ]);

	    const declined = selectCallOption({
	      state: returned.state,
	      index: indexResult.index,
	      call_id: returnedCallId,
	      option_id: "opt_decline_chief",
	      occurred_at: 12175,
	    });
	    const declineCallId = declined.event?.active_call_id ?? "";
	    const ended = selectCallOption({
	      state: declined.state,
	      index: indexResult.index,
	      call_id: declineCallId,
	      option_id: "ack_decline_chief",
	      occurred_at: 12185,
	    });

	    expect(declined.errors).toEqual([]);
	    expect(declined.event?.current_node_id).toBe("decline_chief_reply");
	    expect(ended.errors).toEqual([]);
	    expect(ended.event?.status).toBe("resolved");
	    expect(ended.event?.result_key).toBe("scavenger_chief_meeting_deferred");
	    expect(ended.state.world_flags.iafs_scavenger_chief_meeting_deferred?.value).toBe(true);
	    expect(ended.state.world_flags.iafs_scavenger_chief_meeting_intent?.value).toBe("deferred");
	  });

	  it("records only meeting request flags when the deferred chief meeting action is selected later", () => {
	    const indexResult = buildEventContentIndex(eventContentLibrary);
	    expect(indexResult.errors).toEqual([]);
	    const started = processTrigger({
	      state: {
	        ...createAuthoredScavengerCampState("92-116", "alice"),
	        world_flags: {
	          iafs_scavenger_chief_meeting_deferred: {
	            key: "iafs_scavenger_chief_meeting_deferred",
	            value: true,
	            value_type: "boolean",
	            created_at: 12185,
	            updated_at: 12185,
	            tags: ["iafs", "scavenger_camp", "chief"],
	          },
	        },
	      },
	      index: indexResult.index,
	      context: {
	        ...triggerContext(12500),
	        trigger_type: "action_complete",
	        source: "call",
	        crew_id: "alice",
	        tile_id: "92-116",
	        action_id: "iafs_scavenger:meet_chief",
	        payload: { action_type: "meet_chief", action_def_id: "iafs_scavenger:meet_chief" },
	      },
	    });
	    const requestCallId = started.event?.active_call_id ?? "";

	    expect(started.errors).toEqual([]);
	    expect(started.event?.event_definition_id).toBe("iafs_scavenger_chief_meeting_request");
	    expect(started.event?.current_node_id).toBe("request_recorded");
	    expect(started.event?.status).toBe("waiting_call");
	    expect(started.state.world_flags.iafs_scavenger_chief_meeting_requested?.value).toBe(true);
	    expect(started.state.world_flags.iafs_scavenger_chief_meeting_intent?.value).toBe("deferred_followup");
	    expect(started.state.world_flags.iafs_scavenger_chief_meeting_request_crew?.value).toBe("alice");
	    expect(started.state.world_flags.iafs_scavenger_chief_meeting_request_tile?.value).toBe("92-116");

	    const ended = selectCallOption({
	      state: started.state,
	      index: indexResult.index,
	      call_id: requestCallId,
	      option_id: "ack_chief_meeting_requested",
	      occurred_at: 12510,
	    });

	    expect(ended.errors).toEqual([]);
	    expect(ended.event?.status).toBe("resolved");
	    expect(ended.event?.result_key).toBe("scavenger_chief_meeting_requested");
	  });

	  it("routes failed scavenger camp threat choice into delayed captive callback", () => {
    const indexResult = buildEventContentIndex(eventContentLibrary);
    expect(indexResult.errors).toEqual([]);
    const started = processTrigger({
      state: createAuthoredScavengerCampState("92-116"),
      index: indexResult.index,
      context: scavengerArrivalContext("92-116", 12000),
    });
    const challengeCallId = started.event?.active_call_id ?? "";
    const backlash = selectCallOption({
      state: started.state,
      index: indexResult.index,
      call_id: challengeCallId,
      option_id: "opt_threaten",
      occurred_at: 12015,
	    });
	    const backlashCallId = backlash.event?.active_call_id ?? "";
	    const backlashCall = backlash.state.active_calls[backlashCallId];
	    const backlashText = backlash.state.active_calls[backlashCallId]?.rendered_lines.map((line) => line.text).join(" ") ?? "";
	    const ended = selectCallOption({
	      state: backlash.state,
	      index: indexResult.index,
      call_id: backlashCallId,
      option_id: "ack_threaten",
      occurred_at: 12025,
    });

	    expect(backlash.errors).toEqual([]);
	    expect(backlash.event?.current_node_id).toBe("threaten_backlash");
	    expect(backlash.event?.check_results.sentry_threaten).toEqual(
	      expect.objectContaining({
	        node_id: "check_threaten",
	        attribute: "strength",
	        attribute_label: "体能",
	        die_sides: 20,
	        roll: 1,
	        modifier: 2,
	        total: 3,
	        dc: 14,
	        outcome: "failure",
	        next_node_id: "threaten_backlash",
	      }),
	    );
	    expect(backlashCall?.rendered_lines[0]).toEqual(
	      expect.objectContaining({
	        text: "麦克 骰出了 1，加上 体能 数值 2，最终结果是 3. 判定要求是 14. 检定失败。",
	        animation: expect.objectContaining({ type: "d20_roll", final_text: "1" }),
	      }),
	    );
	    expect(backlashText).toContain("她在压线，还要我们把人叫出来");
	    expect(backlashText).toContain("别让这路信号继续往外传");
	    expect(ended.errors).toEqual([]);
    expect(ended.event?.status).toBe("resolved");
    expect(ended.event?.result_key).toBe("scavenger_sentry_threatened_contact_lost");
    expect(ended.state.world_flags.iafs_scavenger_sentry_opening_choice?.value).toBe("threaten");
    expect(ended.state.world_flags.iafs_scavenger_contact_lost?.value).toBe(true);
    expect(ended.state.crew.mike.condition_tags).toContain("iafs_scavenger_signal_lost");
    expect(ended.state.crew.mike.condition_tags).toContain("iafs_scavenger_captive");
    expect(ended.state.crew.mike.tile_id).toBe("90-116");
    expect(ended.state.world_flags.iafs_scavenger_captive_crew?.value).toBe("mike");
    expect(ended.state.world_flags.iafs_scavenger_captive_tile?.value).toBe("90-116");
    expect(ended.state.world_flags.iafs_scavenger_captive_needs_rescue?.value).toBe(true);

    const captureEvent = Object.values(ended.state.active_events).find(
      (event) => event.event_definition_id === "iafs_scavenger_sentry_capture_callback",
    );
    expect(captureEvent).toEqual(
      expect.objectContaining({
        current_node_id: "capture_wait",
        status: "waiting_time",
        next_wakeup_at: 12325,
        parent_event_id: ended.event?.id,
      }),
    );

    const early = processEventWakeups({ state: ended.state, index: indexResult.index, elapsed_game_seconds: 12324 });
    expect(early.errors).toEqual([]);
    expect(Object.values(early.state.active_calls).some((call) => call.event_node_id === "captive_callback")).toBe(false);

    const due = processEventWakeups({ state: ended.state, index: indexResult.index, elapsed_game_seconds: 12325 });
    const callbackEvent = Object.values(due.state.active_events).find(
      (event) => event.event_definition_id === "iafs_scavenger_sentry_capture_callback",
    );
    const callbackCallId = callbackEvent?.active_call_id ?? "";
    const callbackCall = due.state.active_calls[callbackCallId];
    const callbackText = callbackCall?.rendered_lines.map((line) => line.text).join(" ") ?? "";

    expect(due.errors).toEqual([]);
    expect(callbackEvent).toEqual(expect.objectContaining({ current_node_id: "captive_callback", status: "waiting_call" }));
    expect(callbackCall).toEqual(expect.objectContaining({ status: "awaiting_choice", event_node_id: "captive_callback" }));
    expect(callbackText).toContain("我被他们关起来了");
    expect(callbackText).toContain("请派人支援");

    const rescuePending = selectCallOption({
      state: due.state,
      index: indexResult.index,
      call_id: callbackCallId,
      option_id: "ack_captive_callback",
      occurred_at: 12335,
    });

    expect(rescuePending.errors).toEqual([]);
    expect(rescuePending.event?.status).toBe("resolved");
    expect(rescuePending.event?.result_key).toBe("scavenger_sentry_captive_rescue_pending");
    expect(rescuePending.state.world_flags.iafs_scavenger_rescue_pending?.value).toBe(true);
    expect(rescuePending.state.objectives.iafs_scavenger_rescue_captive).toEqual(
      expect.objectContaining({
        title: "支援被关押的队员",
        target_tile_id: "90-116",
        status: "available",
      }),
    );
  });

	  it("routes successful scavenger camp threat choice into control negotiation", () => {
    const indexResult = buildEventContentIndex(eventContentLibrary);
    expect(indexResult.errors).toEqual([]);
    const started = processTrigger({
      state: createAuthoredScavengerCampState("92-116"),
      index: indexResult.index,
      context: scavengerArrivalContext("92-116", 12001),
    });
    const challengeCallId = started.event?.active_call_id ?? "";
    const controlled = selectCallOption({
      state: started.state,
      index: indexResult.index,
      call_id: challengeCallId,
      option_id: "opt_threaten",
      occurred_at: 12015,
    });
    const controlledCallId = controlled.event?.active_call_id ?? "";
    const ended = selectCallOption({
      state: controlled.state,
      index: indexResult.index,
      call_id: controlledCallId,
      option_id: "ack_threaten_success",
      occurred_at: 12025,
    });
    const negotiationEvent = Object.values(ended.state.active_events).find(
      (event) => event.event_definition_id === "iafs_scavenger_sentry_control_negotiation",
    );
    const negotiationCallId = negotiationEvent?.active_call_id ?? "";
    const negotiationCall = ended.state.active_calls[negotiationCallId];

    expect(controlled.errors).toEqual([]);
    expect(controlled.event?.current_node_id).toBe("threaten_control");
    expect(controlled.event?.check_results.sentry_threaten).toEqual(
      expect.objectContaining({
        roll: 14,
        modifier: 2,
        total: 16,
        dc: 14,
        outcome: "success",
        next_node_id: "threaten_control",
      }),
    );
    expect(ended.errors).toEqual([]);
    expect(ended.event?.status).toBe("resolved");
    expect(ended.event?.result_key).toBe("scavenger_sentry_threaten_controlled");
    expect(negotiationEvent).toEqual(expect.objectContaining({ current_node_id: "control_parley", status: "waiting_call" }));
    expect(negotiationCall?.available_options.map((option) => option.text)).toEqual([
      "同意进入房间和首领见面。",
      "同意，但带上刚才控制住的哨卫做人质。",
      "不同意，要求首领来哨站。",
    ]);

    const hostageReply = selectCallOption({
      state: ended.state,
      index: indexResult.index,
      call_id: negotiationCallId,
      option_id: "opt_enter_with_hostage",
      occurred_at: 12035,
    });
    const hostageReplyCallId = hostageReply.event?.active_call_id ?? "";
    const hostageEnded = selectCallOption({
      state: hostageReply.state,
      index: indexResult.index,
      call_id: hostageReplyCallId,
      option_id: "ack_enter_with_hostage",
      occurred_at: 12045,
    });

    expect(hostageReply.errors).toEqual([]);
    expect(hostageReply.event?.current_node_id).toBe("enter_with_hostage_reply");
    expect(hostageEnded.errors).toEqual([]);
    expect(hostageEnded.event?.result_key).toBe("scavenger_sentry_control_enter_with_hostage");
    expect(hostageEnded.state.world_flags.iafs_scavenger_sentry_control_choice?.value).toBe("enter_with_hostage");
    expect(hostageEnded.state.world_flags.iafs_scavenger_chief_entry_reason?.value).toBe("sentry_control_enter_with_hostage");
    expect(hostageEnded.state.world_flags.iafs_scavenger_has_sentry_hostage?.value).toBe(true);
    expect(
      Object.values(hostageEnded.state.active_events).find((event) => event.event_definition_id === "iafs_scavenger_chief_meeting"),
    ).toEqual(expect.objectContaining({ current_node_id: "chief_meeting_opening", status: "waiting_call" }));
  });

	  it("records the authored scavenger camp negotiate opening choice", () => {
    const indexResult = buildEventContentIndex(eventContentLibrary);
    expect(indexResult.errors).toEqual([]);
    const started = processTrigger({
      state: createAuthoredScavengerCampState("92-116"),
      index: indexResult.index,
      context: scavengerArrivalContext("92-116", 12000),
    });
    const callId = started.event?.active_call_id ?? "";
    const reply = selectCallOption({
      state: started.state,
      index: indexResult.index,
      call_id: callId,
      option_id: "opt_negotiate",
      occurred_at: 12015,
    });
    const replyCallId = reply.event?.active_call_id ?? "";
    const ended = selectCallOption({
      state: reply.state,
      index: indexResult.index,
      call_id: replyCallId,
      option_id: "ack_negotiate",
      occurred_at: 12025,
    });

    expect(reply.errors).toEqual([]);
    expect(reply.event?.current_node_id).toBe("negotiate_reply");
    expect(ended.errors).toEqual([]);
      expect(ended.event?.status).toBe("resolved");
    expect(ended.event?.result_key).toBe("scavenger_sentry_negotiated");
    expect(ended.state.world_flags.iafs_scavenger_sentry_opening_choice?.value).toBe("negotiate");
  });

	  it("returns to the scavenger camp sentry challenge after a failed chat attempt", () => {
	    const indexResult = buildEventContentIndex(eventContentLibrary);
	    expect(indexResult.errors).toEqual([]);
	    const started = processTrigger({
	      state: createAuthoredScavengerCampState("92-116"),
	      index: indexResult.index,
	      context: scavengerArrivalContext("92-116", 12000),
	    });
	    const callId = started.event?.active_call_id ?? "";
	    const suspicion = selectCallOption({
	      state: started.state,
	      index: indexResult.index,
	      call_id: callId,
	      option_id: "opt_chat",
	      occurred_at: 12015,
	    });
	    const suspicionCallId = suspicion.event?.active_call_id ?? "";
	    const returned = selectCallOption({
	      state: suspicion.state,
	      index: indexResult.index,
	      call_id: suspicionCallId,
	      option_id: "ack_chat_failure",
	      occurred_at: 12025,
	    });
	    const returnedCallId = returned.event?.active_call_id ?? "";

	    expect(suspicion.errors).toEqual([]);
	    expect(suspicion.event?.current_node_id).toBe("chat_suspicion");
	    expect(suspicion.event?.check_results.sentry_chat).toEqual(
	      expect.objectContaining({
	        node_id: "check_chat",
	        attribute: "intelligence",
	        attribute_label: "智力",
	        die_sides: 20,
	        roll: 3,
	        modifier: 5,
	        total: 8,
	        dc: 12,
	        outcome: "failure",
	        next_node_id: "chat_suspicion",
	      }),
	    );
	    expect(returned.errors).toEqual([]);
	    expect(returned.event?.current_node_id).toBe("sentry_challenge");
	    expect(returned.event?.status).toBe("waiting_call");
	    expect(returned.state.world_flags.iafs_scavenger_sentry_chat_tried?.value).toBe(true);
	    expect(returned.state.world_flags.iafs_scavenger_sentry_chat_result?.value).toBe("failed");
	    expect(returned.state.active_calls[returnedCallId]?.available_options.map((option) => option.option_id)).toEqual([
	      "opt_observe",
	      "opt_threaten",
	      "opt_negotiate",
	    ]);
  });

	  it("routes a successful chat supply offer into the chief callback", () => {
	    const indexResult = buildEventContentIndex(eventContentLibrary);
	    expect(indexResult.errors).toEqual([]);
	    const started = processTrigger({
	      state: createAuthoredScavengerCampState("92-116"),
	      index: indexResult.index,
	      context: scavengerArrivalContext("92-116", 12002),
	    });
	    const callId = started.event?.active_call_id ?? "";
	    const reply = selectCallOption({
	      state: started.state,
	      index: indexResult.index,
	      call_id: callId,
	      option_id: "opt_chat",
	      occurred_at: 12015,
	    });
	    const replyCallId = reply.event?.active_call_id ?? "";
	    const replyText = reply.state.active_calls[replyCallId]?.rendered_lines.map((line) => line.text).join(" ") ?? "";
	    const waiting = selectCallOption({
	      state: reply.state,
	      index: indexResult.index,
	      call_id: replyCallId,
	      option_id: "offer_supply_after_chat",
	      occurred_at: 12025,
	    });
	    const waitingCallId = waiting.event?.active_call_id ?? "";
	    const ended = selectCallOption({
	      state: waiting.state,
	      index: indexResult.index,
	      call_id: waitingCallId,
	      option_id: "ack_supply_offer_wait",
	      occurred_at: 12035,
	    });

	    expect(reply.errors).toEqual([]);
	    expect(reply.event?.current_node_id).toBe("chat_reply");
	    expect(reply.event?.check_results.sentry_chat).toEqual(
	      expect.objectContaining({
	        node_id: "check_chat",
	        attribute: "intelligence",
	        attribute_label: "智力",
	        die_sides: 20,
	        roll: 8,
	        modifier: 5,
	        total: 13,
	        dc: 12,
	        outcome: "success",
	        next_node_id: "chat_reply",
	      }),
	    );
	    expect(replyText).toContain("他们缺防寒、维修和食物");
	    expect(waiting.errors).toEqual([]);
	    expect(waiting.event?.current_node_id).toBe("supply_offer_wait");
	    expect(ended.errors).toEqual([]);
	    expect(ended.event?.status).toBe("resolved");
	    expect(ended.event?.result_key).toBe("scavenger_sentry_supply_offer_waiting");
	    expect(ended.state.world_flags.iafs_scavenger_supply_leverage_discovered?.value).toBe(true);
	    expect(ended.state.world_flags.iafs_scavenger_supply_leverage_source?.value).toBe("chat");
	    expect(ended.state.world_flags.iafs_scavenger_chief_entry_reason?.value).toBe("supply_offer_chat");

	    const callbackEvent = Object.values(ended.state.active_events).find(
	      (event) => event.event_definition_id === "iafs_scavenger_supply_chief_callback",
	    );
	    expect(callbackEvent).toEqual(
	      expect.objectContaining({
	        current_node_id: "wait_for_supply_chief_callback",
	        status: "waiting_time",
	        next_wakeup_at: 12155,
	        parent_event_id: ended.event?.id,
	      }),
	    );

	    const due = processEventWakeups({ state: ended.state, index: indexResult.index, elapsed_game_seconds: 12155 });
	    const callbackDueEvent = Object.values(due.state.active_events).find(
	      (event) => event.event_definition_id === "iafs_scavenger_supply_chief_callback",
	    );
	    const callbackCallId = callbackDueEvent?.active_call_id ?? "";
	    const meetingStarted = selectCallOption({
	      state: due.state,
	      index: indexResult.index,
	      call_id: callbackCallId,
	      option_id: "ack_supply_chief_callback",
	      occurred_at: 12165,
	    });
	    const chiefMeeting = Object.values(meetingStarted.state.active_events).find(
	      (event) => event.event_definition_id === "iafs_scavenger_chief_meeting",
	    );

	    expect(due.errors).toEqual([]);
	    expect(meetingStarted.errors).toEqual([]);
	    expect(chiefMeeting).toEqual(
	      expect.objectContaining({
	        current_node_id: "chief_meeting_opening",
	        status: "waiting_call",
	        parent_event_id: callbackDueEvent?.id,
	      }),
	    );
  });

	  it("starts a captive chief invitation when another crew member returns to the sentry line", () => {
	    const indexResult = buildEventContentIndex(eventContentLibrary);
	    expect(indexResult.errors).toEqual([]);
	    const started = processTrigger({
	      state: createScavengerCaptiveRescueState("alice"),
	      index: indexResult.index,
	      context: scavengerArrivalContext("92-116", 12400, "alice"),
	    });
	    const invitationCallId = started.event?.active_call_id ?? "";
	    const invitationCall = started.state.active_calls[invitationCallId];

	    expect(started.errors).toEqual([]);
	    expect(started.candidate_report?.selected_event_definition_ids).toEqual(["iafs_scavenger_captive_chief_invitation"]);
	    expect(started.event?.current_node_id).toBe("captive_chief_invitation");
	    expect(invitationCall?.available_options.map((option) => option.text)).toEqual([
	      "同意见村长，先把被俘队员的安全摆上桌面。",
	      "要求先确认被俘队员还安全。",
	      "拒绝进入会谈，保持救援目标。",
	    ]);

	    const statusReply = selectCallOption({
	      state: started.state,
	      index: indexResult.index,
	      call_id: invitationCallId,
	      option_id: "opt_confirm_captive_status",
	      occurred_at: 12410,
	    });
	    const statusCallId = statusReply.event?.active_call_id ?? "";
	    const returned = selectCallOption({
	      state: statusReply.state,
	      index: indexResult.index,
	      call_id: statusCallId,
	      option_id: "ack_confirm_captive_status",
	      occurred_at: 12420,
	    });
	    const returnedCallId = returned.event?.active_call_id ?? "";
	    const accepted = selectCallOption({
	      state: returned.state,
	      index: indexResult.index,
	      call_id: returnedCallId,
	      option_id: "opt_accept_captive_chief",
	      occurred_at: 12430,
	    });
	    const acceptCallId = accepted.event?.active_call_id ?? "";
	    const meetingStarted = selectCallOption({
	      state: accepted.state,
	      index: indexResult.index,
	      call_id: acceptCallId,
	      option_id: "ack_accept_captive_chief",
	      occurred_at: 12440,
	    });
	    const chiefMeeting = Object.values(meetingStarted.state.active_events).find(
	      (event) => event.event_definition_id === "iafs_scavenger_chief_meeting",
	    );

	    expect(statusReply.errors).toEqual([]);
	    expect(statusReply.event?.current_node_id).toBe("confirm_captive_status_reply");
	    expect(returned.errors).toEqual([]);
	    expect(returned.event?.current_node_id).toBe("captive_chief_invitation");
	    expect(returned.state.world_flags.iafs_scavenger_captive_status_requested?.value).toBe(true);
	    expect(accepted.errors).toEqual([]);
	    expect(meetingStarted.errors).toEqual([]);
	    expect(meetingStarted.event?.result_key).toBe("scavenger_captive_chief_meeting_started");
	    expect(meetingStarted.state.world_flags.iafs_scavenger_chief_entry_reason?.value).toBe("captive_rescue");
	    expect(meetingStarted.state.world_flags.iafs_scavenger_chief_entry_signal?.value).toBe("captive_invitation");
	    expect(chiefMeeting).toEqual(
	      expect.objectContaining({
	        current_node_id: "chief_meeting_opening",
	        status: "waiting_call",
	        parent_event_id: started.event?.id,
	      }),
	    );
	  });

	  it("does not start the captive chief invitation for the crew member who is already captive", () => {
	    const indexResult = buildEventContentIndex(eventContentLibrary);
	    expect(indexResult.errors).toEqual([]);
	    const started = processTrigger({
	      state: {
	        ...createScavengerCaptiveRescueState("mike"),
	        world_history: {
	          "event:iafs_scavenger_sentry_line_contact:world": historyEntry(
	            "event:iafs_scavenger_sentry_line_contact:world",
	            "iafs_scavenger_sentry_line_contact",
	            1,
	            null,
	          ),
	        },
	      },
	      index: indexResult.index,
	      context: scavengerArrivalContext("92-116", 12400, "mike"),
	    });

	    expect(started.errors).toEqual([]);
	    expect(started.candidate_report?.passed_condition_ids).not.toContain("iafs_scavenger_captive_chief_invitation");
	    expect(started.candidate_report?.selected_event_definition_ids).toEqual([]);
	  });

	  it.each([
	    {
	      label: "captive rescue",
	      flags: { iafs_scavenger_chief_entry_reason: "captive_rescue", iafs_scavenger_captive_needs_rescue: true },
	      expectedOpening: "人在后帐",
	      expectedNode: "demand_captive_proof",
	      expectedDemand: "不会白放",
	      expectedRequest: "prove_value_for_captive_release",
	    },
	    {
	      label: "sentry hostage",
	      flags: { iafs_scavenger_chief_entry_reason: "sentry_control_enter_with_hostage", iafs_scavenger_has_sentry_hostage: true },
	      expectedOpening: "带着我的哨卫",
	      expectedNode: "demand_release_sentry",
	      expectedDemand: "放开我的哨卫",
	      expectedRequest: "release_sentry_hostage",
	    },
	    {
	      label: "heir handkerchief",
	      flags: { iafs_scavenger_chief_entry_reason: "heir_handkerchief" },
	      expectedOpening: "家徽是真的",
	      expectedNode: "demand_heir_guarantee",
	      expectedDemand: "用它作担保",
	      expectedRequest: "heir_guarantee",
	    },
	    {
	      label: "suspicious supply offer",
	      flags: {
	        iafs_scavenger_chief_entry_reason: "supply_offer_eavesdrop",
	        iafs_scavenger_sentry_suspects_cinder_agent: true,
	      },
	      expectedOpening: "烬炉",
	      expectedNode: "demand_supply_commitment",
	      expectedDemand: "第一批只谈",
	      expectedRequest: "first_supply_commitment",
	    },
	    {
	      label: "limited entry",
	      flags: { iafs_scavenger_chief_entry_reason: "sentry_control_enter_room" },
	      expectedOpening: "进到线里",
	      expectedNode: "demand_limited_entry",
	      expectedDemand: "有限入营",
	      expectedRequest: "limited_entry_rules",
	    },
	  ])("routes chief meeting demand for $label", ({ flags, expectedOpening, expectedNode, expectedDemand, expectedRequest }) => {
	    const indexResult = buildEventContentIndex(eventContentLibrary);
	    expect(indexResult.errors).toEqual([]);
	    const started = startChiefMeetingWithFlags(indexResult.index, flags);
	    const openingCallId = started.event.active_call_id ?? "";
	    const openingText = started.state.active_calls[openingCallId]?.rendered_lines.map((line) => line.text).join(" ") ?? "";
	    const demand = selectCallOption({
	      state: started.state,
	      index: indexResult.index,
	      call_id: openingCallId,
	      option_id: "opt_disclose_crash",
	      occurred_at: 12170,
	    });
	    const demandCallId = demand.event?.active_call_id ?? "";
	    const demandText = demand.state.active_calls[demandCallId]?.rendered_lines.map((line) => line.text).join(" ") ?? "";
	    const accepted = selectCallOption({
	      state: demand.state,
	      index: indexResult.index,
	      call_id: demandCallId,
	      option_id: "opt_accept_terms",
	      occurred_at: 12180,
	    });
	    const acceptCallId = accepted.event?.active_call_id ?? "";
	    const ended = selectCallOption({
	      state: accepted.state,
	      index: indexResult.index,
	      call_id: acceptCallId,
	      option_id: "ack_accept_chief_terms",
	      occurred_at: 12190,
	    });

	    expect(started.errors).toEqual([]);
	    expect(openingText).toContain(expectedOpening);
	    expect(demand.errors).toEqual([]);
	    expect(demand.event?.current_node_id).toBe(expectedNode);
	    expect(demandText).toContain(expectedDemand);
	    expect(demand.state.world_flags.iafs_scavenger_ship_crash_disclosed?.value).toBe(true);
	    expect(demand.state.world_flags.iafs_scavenger_ship_crash_disclosure_level?.value).toBe("limited");
	    expect(demand.state.world_flags.iafs_scavenger_chief_meeting_crew?.value).toBe("alice");
	    expect(demand.state.world_flags.iafs_scavenger_chief_meeting_tile?.value).toBe("92-116");
	    expect(accepted.errors).toEqual([]);
	    expect(ended.errors).toEqual([]);
	    expect(ended.event?.result_key).toBe("scavenger_chief_meeting_terms_accepted");
	    expect(ended.state.world_flags.iafs_scavenger_chief_deal_status?.value).toBe("accepted");
	    expect(ended.state.world_flags.iafs_scavenger_chief_cooperation_pending?.value).toBe(true);
	    expect(ended.state.world_flags.iafs_scavenger_chief_cooperation_request?.value).toBe(expectedRequest);
	  });

	  it.each([
	    { optionId: "opt_defer_terms", ackId: "ack_defer_chief_terms", status: "deferred", pending: true, resultKey: "scavenger_chief_meeting_terms_deferred" },
	    { optionId: "opt_refuse_terms", ackId: "ack_refuse_chief_terms", status: "refused", pending: false, resultKey: "scavenger_chief_meeting_terms_refused" },
	  ])("records chief meeting $status status and request flags", ({ optionId, ackId, status, pending, resultKey }) => {
	    const indexResult = buildEventContentIndex(eventContentLibrary);
	    expect(indexResult.errors).toEqual([]);
	    const started = startChiefMeetingWithFlags(indexResult.index, { iafs_scavenger_chief_entry_reason: "supply_offer_chat" });
	    const openingCallId = started.event.active_call_id ?? "";
	    const demand = selectCallOption({
	      state: started.state,
	      index: indexResult.index,
	      call_id: openingCallId,
	      option_id: "opt_disclose_crash",
	      occurred_at: 12170,
	    });
	    const demandCallId = demand.event?.active_call_id ?? "";
	    const reply = selectCallOption({
	      state: demand.state,
	      index: indexResult.index,
	      call_id: demandCallId,
	      option_id: optionId,
	      occurred_at: 12180,
	    });
	    const replyCallId = reply.event?.active_call_id ?? "";
	    const ended = selectCallOption({
	      state: reply.state,
	      index: indexResult.index,
	      call_id: replyCallId,
	      option_id: ackId,
	      occurred_at: 12190,
	    });

	    expect(reply.errors).toEqual([]);
	    expect(ended.errors).toEqual([]);
	    expect(ended.event?.result_key).toBe(resultKey);
	    expect(ended.state.world_flags.iafs_scavenger_chief_deal_status?.value).toBe(status);
	    expect(ended.state.world_flags.iafs_scavenger_chief_cooperation_pending?.value).toBe(pending);
	    expect(ended.state.world_flags.iafs_scavenger_chief_cooperation_request?.value).toBe("first_supply_commitment");
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
        tile_id: "120-117",
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
        tile_id: "116-112",
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
        tile_id: "116-112",
        action_id: "repair:mike:iafs_generator:0",
        payload: { action_type: "repair", feature_id: "iafs_generator", repair_result: "success" },
      },
    });

    const quest = result.state.quest_state?.quests.regroup_after_crash;
    const callId = result.event?.active_call_id ?? "";
    expect(result.errors).toEqual([]);
    expect(result.event?.event_definition_id).toBe("iafs_generator_repair_complete");
    expect(result.event?.status).toBe("waiting_call");
    expect(result.state.active_calls[callId]?.rendered_lines[0]?.text).toBe("麦克：发电机这边修好了。");
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
        tile_id: "116-112",
        action_id: "repair:mike:iafs_generator:0",
        payload: { action_type: "repair", feature_id: "iafs_generator", repair_result: "failure" },
      },
    });

    const quest = result.state.quest_state?.quests.regroup_after_crash;
    const callId = result.event?.active_call_id ?? "";
    expect(result.errors).toEqual([]);
    expect(result.event?.event_definition_id).toBe("iafs_generator_repair_failed");
    expect(result.event?.status).toBe("waiting_call");
    expect(result.state.active_calls[callId]?.rendered_lines[0]?.text).toBe("麦克：发电机这边还没修起来。");
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

  it("starts immediate spawn_event children at their authored entry node", () => {
    const spawnNode: SpawnEventNode = {
      ...baseNode("spawn_child", "spawn_event"),
      type: "spawn_event",
      event_definition_id: "spawned_child",
      spawn_policy: "immediate",
      context_mapping: {},
      parent_event_link: true,
      next_node_id: "parent_done",
    };
    const parent = definitionWith({
      id: "parent_event",
      triggerType: "arrival",
      nodes: [spawnNode, endNode("parent_done", "resolved", "parent_done", false)],
    });
    const child = definitionWith({
      id: "spawned_child",
      triggerType: "event_node_finished",
      nodes: [waitNode("child_wait", 30, "child_done"), endNode("child_done", "resolved", "child_done", false)],
    });
    const index = indexFor([parent, child]);

    const started = startRuntimeEvent(createState(), parent, triggerContext(120), {
      event_id: "evt_parent",
      content_index: index,
    });
    const childEvent = started.state.active_events["evt_parent:spawn_child:child"];

    expect(started.errors).toEqual([]);
    expect(started.event.status).toBe("resolved");
    expect(started.event.child_event_ids).toEqual(["evt_parent:spawn_child:child"]);
    expect(childEvent).toMatchObject({
      event_definition_id: "spawned_child",
      current_node_id: "child_wait",
      status: "waiting_time",
      parent_event_id: "evt_parent",
      primary_crew_id: "amy",
      primary_tile_id: "2-3",
      next_wakeup_at: 150,
    });
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
        tile_id: "116-112",
        inventory_id: "inv_mike",
      },
    },
    tiles: {
      "116-112": {
        id: "116-112",
        coordinates: { x: 116, y: 112 },
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
        "116-112": { revealedObjectIds: [] },
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
    ...state.tiles["116-112"],
    id: "120-117",
    coordinates: { x: 120, y: 117 },
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
        tile_id: "120-117",
      },
    },
    tiles: {
      ...state.tiles,
      "120-117": suppliesTile,
    },
    map: {
      ...state.map,
      tilesById: {
        ...state.map?.tilesById,
        "120-117": { revealedObjectIds: [] },
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

function createAuthoredScavengerCampState(tileId: string, crewId = "mike"): GraphRunnerGameState {
	  const state = createAuthoredCrashSiteState();
	  const [row, col] = tileId.split("-").map(Number);
	  const scavengerCrew =
	    crewId === "mike"
	      ? state.crew.mike
	      : {
	          ...crew(crewId),
	          display_name: crewId === "alice" ? "爱丽丝" : crewId,
	          inventory_id: `inv_${crewId}`,
	        };

	  return {
	    ...state,
	    elapsed_game_seconds: 12000,
	    crew: {
	      ...state.crew,
	      [crewId]: {
	        ...scavengerCrew,
	        tile_id: tileId,
	        status: "idle",
	        current_action_id: null,
	        communication_state: "available",
	      },
	    },
	    inventories: {
	      ...state.inventories,
	      ...(crewId === "alice"
	        ? {
	            inv_alice: {
	              id: "inv_alice",
	              owner_type: "crew" as const,
	              owner_id: "alice",
	              items: [{ item_id: "monogrammed_handkerchief", quantity: 1 }],
	              resources: {},
	            },
	          }
	        : {}),
	    },
	    tiles: {
	      ...state.tiles,
	      "90-116": {
	        id: "90-116",
	        coordinates: { x: 116, y: 90 },
	        terrain_type: "plain",
	        tags: ["iafs", "ashfrost", "scavenger_camp", "rear_tent"],
	        danger_tags: [],
	        discovery_state: "visited",
	        survey_state: "unsurveyed",
	        visibility: "visible",
	        current_crew_ids: [],
	        resource_nodes: [],
	        site_objects: [],
	        buildings: [],
	        event_marks: [],
	        history_keys: [],
	      },
	      [tileId]: {
        id: tileId,
        coordinates: { x: col, y: row },
        terrain_type: "plain",
        tags: ["iafs", "ashfrost", "scavenger_camp"],
        danger_tags: [],
	        discovery_state: "visited",
	        survey_state: "unsurveyed",
	        visibility: "visible",
	        current_crew_ids: [crewId],
	        resource_nodes: [],
        site_objects: [],
        buildings: [],
        event_marks: [],
        history_keys: [],
      },
    },
  };
}

function createScavengerCaptiveRescueState(activeCrewId = "alice"): GraphRunnerGameState {
  const state = createAuthoredScavengerCampState("92-116", activeCrewId);
  const activeCrew = state.crew[activeCrewId] ?? crew(activeCrewId);
  const captiveMike = {
    ...(state.crew.mike ?? crew("mike")),
    display_name: "麦克",
    tile_id: "90-116",
    status: "idle" as const,
    current_action_id: null,
    communication_state: "available" as const,
    condition_tags: Array.from(new Set([...(state.crew.mike?.condition_tags ?? []), "iafs_scavenger_signal_lost", "iafs_scavenger_captive"])),
  };

  return {
    ...state,
    crew: {
      ...state.crew,
      mike: captiveMike,
      [activeCrewId]: activeCrewId === "mike" ? captiveMike : activeCrew,
    },
    world_flags: {
      ...state.world_flags,
      iafs_scavenger_captive_crew: worldFlag("iafs_scavenger_captive_crew", "mike", ["iafs", "scavenger_camp", "capture"]),
      iafs_scavenger_captive_tile: worldFlag("iafs_scavenger_captive_tile", "90-116", ["iafs", "scavenger_camp", "capture"]),
      iafs_scavenger_captive_needs_rescue: worldFlag("iafs_scavenger_captive_needs_rescue", true, ["iafs", "scavenger_camp", "rescue"]),
      iafs_scavenger_captive_callback_received: worldFlag("iafs_scavenger_captive_callback_received", true, ["iafs", "scavenger_camp", "capture"]),
      iafs_scavenger_rescue_pending: worldFlag("iafs_scavenger_rescue_pending", true, ["iafs", "scavenger_camp", "rescue"]),
    },
  };
}

function startChiefMeetingWithFlags(index: EventContentIndex, flags: Record<string, boolean | number | string | undefined>) {
  const definition = index.definitionsById.get("iafs_scavenger_chief_meeting");
  if (!definition) {
    throw new Error("Missing iafs_scavenger_chief_meeting definition.");
  }

  const state = {
    ...createAuthoredScavengerCampState("92-116", "alice"),
    world_flags: Object.fromEntries(
      Object.entries(flags)
        .filter((entry): entry is [string, boolean | number | string] => entry[1] !== undefined)
        .map(([key, value]) => [key, worldFlag(key, value, ["iafs", "scavenger_camp", "chief"])]),
    ),
  };

  return startRuntimeEvent(
    state,
    definition,
    {
      ...triggerContext(12160),
      trigger_type: "event_node_finished",
      source: "event_node",
      event_id: "test_chief_meeting",
      event_definition_id: definition.id,
      crew_id: "alice",
      tile_id: "92-116",
      payload: { parent_event_id: "test_parent", spawn_node_id: "test_spawn" },
    },
    { event_id: "test_chief_meeting", content_index: index },
  );
}

function worldFlag(
  key: string,
  value: boolean | number | string,
  tags: string[] = [],
): GraphRunnerGameState["world_flags"][string] {
  const valueType: "boolean" | "number" | "string" = typeof value === "boolean" ? "boolean" : typeof value === "number" ? "number" : "string";
  return {
    key,
    value,
    value_type: valueType,
    created_at: 12000,
    updated_at: 12000,
    tags,
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

	function scavengerArrivalContext(tileId: string, occurredAt: number, crewId = "mike"): TriggerContext {
	  return {
	    ...triggerContext(occurredAt),
	    source: "crew_action",
	    crew_id: crewId,
	    tile_id: tileId,
	    action_id: `move:${crewId}:scavenger-camp`,
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
    check_results: {},
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
