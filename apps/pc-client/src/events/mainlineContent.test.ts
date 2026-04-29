import { describe, expect, it } from "vitest";
import crashSiteContent from "../../../../content/events/definitions/mainline_crash_site.json";
import endingContent from "../../../../content/events/definitions/mainline_ending.json";
import hiveContent from "../../../../content/events/definitions/mainline_hive.json";
import medicalContent from "../../../../content/events/definitions/mainline_medical.json";
import resourcesContent from "../../../../content/events/definitions/mainline_resources.json";
import villageContent from "../../../../content/events/definitions/mainline_village.json";
import { mapObjectDefinitionById } from "../content/mapObjects";

type JsonRecord = Record<string, unknown>;
type JsonDefinition = JsonRecord & {
  id: string;
  trigger: JsonRecord & { conditions?: unknown[] };
  repeat_policy: JsonRecord;
  event_graph: JsonRecord & { nodes: JsonRecord[] };
  effect_groups?: Array<{ effects: JsonRecord[] }>;
};

type JsonContent = { event_definitions: JsonDefinition[] };

describe("mainline event content", () => {
  it("keeps MVP mainline information flow survey-only instead of exposing scan", () => {
    const mainlineDefinitions = [crashSiteContent, endingContent, medicalContent, resourcesContent, villageContent];

    for (const content of mainlineDefinitions) {
      expect(JSON.stringify(content)).not.toContain('"value":"scan"');
      expect(JSON.stringify(content)).not.toContain('"action_type":"scan"');
      expect(JSON.stringify(content)).not.toContain('scan:');
    }

    for (const objectId of [
      "mainline-rosetta-device",
      "mainline-medical-docs",
      "mainline-damaged-warp-pod",
      "mainline-repair-docs",
      "mainline-basic-radar",
      "mainline-dead-cockpit",
    ]) {
      // The new schema replaces `candidateActions: string[]` with inline
      // `actions: ActionDef[]`; none of those actions should encode the
      // retired `scan` verb (id suffix or event_id).
      const definition = findMapObject(objectId);
      expect(definition.actions.some((action) => action.id.endsWith(":scan") || action.event_id === "retired.map_object_scan")).toBe(false);
    }
  });

  it("covers crash-site supplies, radar clues, and repeatable repair-tech learning", () => {
    const surveyChain = findDefinition(crashSiteContent, "mainline_crash_site_survey_chain");
    const repeatLearning = findDefinition(crashSiteContent, "mainline_repair_docs_repeat_learning");

    expect(findEffect(surveyChain, "first_ration_reward")).toMatchObject({
      type: "add_item",
      target: { type: "crew_inventory" },
      params: { item_id: "ration" },
    });
    expect(findEffect(surveyChain, "main_objective_flag")).toMatchObject({
      type: "set_world_flag",
      params: { key: "main_objective_return_home_known", value: true },
    });
    expect(findEffect(surveyChain, "radar_clues_flag")).toMatchObject({
      type: "set_world_flag",
      params: { key: "crash_site_radar_clues_found", value: true },
    });
    expect(findEffect(surveyChain, "repair_docs_available_flag")).toMatchObject({
      type: "set_world_flag",
      params: { key: "repair_docs_available", value: true },
    });
    expect(findEffect(surveyChain, "learn_repair_tech")).toMatchObject({
      type: "add_crew_condition",
      params: { condition: "knows_repair_tech" },
    });

    expect(repeatLearning.trigger.conditions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "world_flag_equals", field: "repair_docs_available", value: true }),
        expect.objectContaining({ type: "not" }),
      ]),
    );
    expect(findEffect(repeatLearning, "repeat_learn_repair_condition")).toMatchObject({
      type: "add_crew_condition",
      params: { condition: "knows_repair_tech" },
    });
  });

  it("covers rare-ore gather counter and repeatable sample reward after the threshold", () => {
    const rareOre = findDefinition(resourcesContent, "mainline_rare_ore_gather_progress");
    const sampleBranch = rareOre.event_graph.nodes
      .find((node) => node.id === "select_rare_ore_result")
      ?.branches as Array<JsonRecord & { id: string }> | undefined;
    const guaranteedSample = sampleBranch?.find((branch) => branch.id === "guaranteed_sample");

    expect(findEffect(rareOre, "rare_ore_gather_counter")).toMatchObject({
      type: "increment_world_counter",
      params: { key: "rare_ore_gather_count", amount: 1 },
    });
    expect(guaranteedSample).toMatchObject({
      conditions: [
        expect.objectContaining({
          type: "compare_field",
          field: "rare_ore_gather_count.value",
          op: "gte",
          value: 3,
        }),
      ],
      effect_refs: ["rare_ore_sample_reward"],
    });
    expect(findEffect(rareOre, "rare_ore_sample_add_item")).toMatchObject({
      type: "add_item",
      target: { type: "crew_inventory" },
      params: { item_id: "rare_ore_sample", quantity: 1 },
    });
    expect(rareOre.repeat_policy.max_trigger_count).toBeNull();
  });

  it("covers village language, rosetta learning, trade, and camp clue requirements", () => {
    const firstContact = findDefinition(villageContent, "mainline_village_first_contact_rosetta_clue");
    const rosetta = findDefinition(villageContent, "mainline_rosetta_language_learning");
    const trade = findDefinition(villageContent, "mainline_village_trade_thermal_gear");
    const campClue = findDefinition(villageContent, "mainline_village_residents_camp_clue");

    expect(firstContact.trigger.conditions).toEqual(expect.arrayContaining([expect.objectContaining({ type: "not" })]));
    expect(findEffect(firstContact, "rosetta_clue_flag")).toMatchObject({
      type: "set_world_flag",
      params: { key: "rosetta_clue_found", value: true },
    });
    expect(findEffect(firstContact, "reveal_rosetta_tile")).toMatchObject({
      type: "set_discovery_state",
      target: { type: "tile_id", id: "1-4" },
    });

    expect(findEffect(rosetta, "rosetta_language_available_flag")).toMatchObject({
      type: "set_world_flag",
      params: { key: "rosetta_language_available", value: true },
    });
    expect(findEffect(rosetta, "learn_alien_language")).toMatchObject({
      type: "add_crew_condition",
      params: { condition: "knows_alien_language" },
    });
    expect(rosetta.repeat_policy.max_trigger_count).toBeNull();

    const tradeOption = findCallOption(trade, "trade");
    expect(tradeOption.requirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "inventory_has_item", target: { type: "crew_inventory" }, value: "rare_ore_sample" }),
      ]),
    );
    expect(findEffect(trade, "consume_rare_ore_sample")).toMatchObject({
      type: "remove_item",
      target: { type: "crew_inventory" },
      params: { item_id: "rare_ore_sample", quantity: 1 },
    });
    expect(findEffect(trade, "add_thermal_mining_gear")).toMatchObject({
      type: "add_item",
      target: { type: "crew_inventory" },
      params: { item_id: "thermal_mining_gear", quantity: 1 },
    });

    expect(findEffect(campClue, "injured_villager_camp_known_flag")).toMatchObject({
      type: "set_world_flag",
      params: { key: "injured_villager_camp_known", value: true },
    });
    expect(findEffect(campClue, "reveal_injured_camp_tile")).toMatchObject({
      type: "set_discovery_state",
      target: { type: "tile_id", id: "5-2" },
    });
  });

  it("covers medical first aid, wound recovery, and two stable decoy sources", () => {
    const medical = findDefinition(medicalContent, "mainline_medical_pod_survey");
    const repeatFirstAid = findDefinition(medicalContent, "mainline_medical_docs_repeat_learning");
    const recovery = findDefinition(medicalContent, "mainline_wounded_recovery_options");
    const rescue = findDefinition(medicalContent, "mainline_injured_villager_rescue_decoy");
    const marsh = findDefinition(medicalContent, "mainline_marsh_decoy_source");

    expect(findEffect(medical, "add_medicine")).toMatchObject({
      type: "add_item",
      target: { type: "crew_inventory" },
      params: { item_id: "medicine", quantity: 1 },
    });
    expect(findEffect(medical, "learn_field_first_aid")).toMatchObject({
      type: "add_crew_condition",
      params: { condition: "knows_field_first_aid" },
    });
    expect(findEffect(medical, "medical_docs_available_flag")).toMatchObject({
      type: "set_world_flag",
      params: { key: "medical_docs_available", value: true },
    });
    expect(repeatFirstAid.trigger.conditions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "world_flag_equals", field: "medical_docs_available", value: true }),
        expect.objectContaining({ type: "not" }),
      ]),
    );
    expect(findEffect(repeatFirstAid, "repeat_learn_field_first_aid")).toMatchObject({
      type: "add_crew_condition",
      params: { condition: "knows_field_first_aid" },
    });

    expect(findCallOption(recovery, "use_medicine").requirements).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "inventory_has_item", target: { type: "crew_inventory" }, value: "medicine" })]),
    );
    expect(findEffect(recovery, "consume_medicine_for_wound")).toMatchObject({ type: "remove_item", params: { item_id: "medicine" } });
    expect(findEffect(recovery, "remove_wounded_with_medicine")).toMatchObject({ type: "remove_crew_condition", params: { condition: "wounded" } });
    expect(findCallOption(recovery, "field_first_aid").requirements).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "has_condition", value: "knows_field_first_aid" })]),
    );
    expect(findEffect(recovery, "remove_wounded_with_first_aid")).toMatchObject({ type: "remove_crew_condition", params: { condition: "wounded" } });

    expect(findCallOption(rescue, "use_medicine").requirements).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "not" }), expect.objectContaining({ type: "inventory_has_item", value: "medicine" })]),
    );
    expect(findCallOption(rescue, "field_first_aid").requirements).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "not" }), expect.objectContaining({ type: "has_condition", value: "knows_field_first_aid" })]),
    );
    expect(findEffect(rescue, "camp_decoy_from_medicine")).toMatchObject({ type: "add_item", target: { type: "crew_inventory" }, params: { item_id: "decoy" } });
    expect(findEffect(rescue, "camp_decoy_from_first_aid")).toMatchObject({ type: "add_item", target: { type: "crew_inventory" }, params: { item_id: "decoy" } });

    expect(findEffect(marsh, "add_marsh_decoy")).toMatchObject({
      type: "add_item",
      target: { type: "crew_inventory" },
      params: { item_id: "decoy", quantity: 1 },
    });
    expect(findEffect(marsh, "marsh_decoy_obtained_flag")).toMatchObject({
      type: "set_world_flag",
      params: { key: "marsh_decoy_obtained", value: true },
    });
  });

  it("covers volcano, forge, repair-kit crafting, and warp coordinates", () => {
    const volcano = findDefinition(resourcesContent, "mainline_volcano_obsidian_chain");
    const forge = findDefinition(resourcesContent, "mainline_forge_repair_and_kit");
    const oldShip = findDefinition(resourcesContent, "mainline_old_ship_warp_coordinates");

    expect(findCallOption(volcano, "collect_obsidian").requirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "inventory_has_item", target: { type: "crew_inventory" }, value: "thermal_mining_gear" }),
        expect.objectContaining({ type: "not" }),
      ]),
    );
    expect(findEffect(volcano, "thermal_mining_gear_required_flag")).toMatchObject({
      type: "set_world_flag",
      params: { key: "thermal_mining_gear_required_for_obsidian", value: true },
    });
    expect(findEffect(volcano, "add_obsidian")).toMatchObject({
      type: "add_item",
      target: { type: "crew_inventory" },
      params: { item_id: "obsidian", quantity: 1 },
    });

    expect(findCallOption(forge, "repair_forge").requirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "has_condition", value: "knows_repair_tech" }),
        expect.objectContaining({ type: "inventory_has_item", target: { type: "crew_inventory" }, value: "iron_ore" }),
      ]),
    );
    expect(findEffect(forge, "forge_repaired_flag")).toMatchObject({
      type: "set_world_flag",
      params: { key: "forge_repaired", value: true },
    });
    expect(findCallOption(forge, "craft_repair_kit").requirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "world_flag_equals", field: "forge_repaired", value: true }),
        expect.objectContaining({ type: "inventory_has_item", target: { type: "crew_inventory" }, value: "obsidian" }),
        expect.objectContaining({ type: "inventory_has_item", target: { type: "crew_inventory" }, value: "iron_ore" }),
      ]),
    );
    expect(findEffect(forge, "consume_obsidian_for_repair_kit")).toMatchObject({ type: "remove_item", params: { item_id: "obsidian" } });
    expect(findEffect(forge, "consume_iron_ore_for_repair_kit")).toMatchObject({ type: "remove_item", params: { item_id: "iron_ore" } });
    expect(findEffect(forge, "add_warp_pod_repair_kit")).toMatchObject({
      type: "add_item",
      target: { type: "crew_inventory" },
      params: { item_id: "warp_pod_repair_kit", quantity: 1 },
    });

    expect(findEffect(oldShip, "add_warp_coordinates")).toMatchObject({
      type: "add_item",
      target: { type: "crew_inventory" },
      params: { item_id: "warp_coordinates", quantity: 1 },
    });
    expect(findEffect(oldShip, "warp_coordinates_found_flag")).toMatchObject({
      type: "set_world_flag",
      params: { key: "warp_coordinates_found", value: true },
    });
  });

  it("covers hive two-decoy route and high-risk wound gates", () => {
    const hive = findDefinition(hiveContent, "mainline_hive_entrance_and_hatchery");

    expect(findCallOption(hive, "lure_guard").requirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "inventory_has_item", target: { type: "crew_inventory" }, value: "decoy" }),
        expect.objectContaining({ type: "not" }),
      ]),
    );
    expect(findEffect(hive, "consume_decoy_for_hive_entrance")).toMatchObject({ type: "remove_item", params: { item_id: "decoy", quantity: 1 } });
    expect(findEffect(hive, "hive_entrance_guard_lured_flag")).toMatchObject({
      type: "set_world_flag",
      params: { key: "hive_entrance_guard_lured", value: true },
    });

    expect(findCallOption(hive, "collect_slime_fuel").requirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "world_flag_equals", field: "hive_entrance_guard_lured", value: true }),
        expect.objectContaining({ type: "inventory_has_item", target: { type: "crew_inventory" }, value: "decoy" }),
        expect.objectContaining({ type: "not" }),
      ]),
    );
    expect(findEffect(hive, "consume_decoy_for_hatchery")).toMatchObject({ type: "remove_item", params: { item_id: "decoy", quantity: 1 } });
    expect(findEffect(hive, "add_alien_slime_fuel")).toMatchObject({
      type: "add_item",
      target: { type: "crew_inventory" },
      params: { item_id: "alien_slime_fuel", quantity: 1 },
    });
  });

  it("covers warp-pod ending sequence and crew assembly requirement", () => {
    const ending = findDefinition(endingContent, "mainline_warp_pod_final_sequence");

    expect(findCallOption(ending, "repair_hull").requirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "has_condition", value: "knows_repair_tech" }),
        expect.objectContaining({ type: "inventory_has_item", target: { type: "crew_inventory" }, value: "warp_pod_repair_kit" }),
      ]),
    );
    expect(findEffect(ending, "consume_warp_pod_repair_kit")).toMatchObject({ type: "remove_item", params: { item_id: "warp_pod_repair_kit" } });
    expect(findEffect(ending, "warp_pod_hull_repaired_flag")).toMatchObject({ type: "set_world_flag", params: { key: "warp_pod_hull_repaired", value: true } });

    expect(findCallOption(ending, "inject_fuel").requirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "world_flag_equals", field: "warp_pod_hull_repaired", value: true }),
        expect.objectContaining({ type: "inventory_has_item", target: { type: "crew_inventory" }, value: "alien_slime_fuel" }),
      ]),
    );
    expect(findEffect(ending, "consume_alien_slime_fuel")).toMatchObject({ type: "remove_item", params: { item_id: "alien_slime_fuel" } });
    expect(findEffect(ending, "warp_pod_fueled_flag")).toMatchObject({ type: "set_world_flag", params: { key: "warp_pod_fueled", value: true } });

    expect(findCallOption(ending, "launch_home").requirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "world_flag_equals", field: "warp_pod_fueled", value: true }),
        expect.objectContaining({ type: "inventory_has_item", target: { type: "crew_inventory" }, value: "warp_coordinates" }),
        expect.objectContaining({ type: "handler_condition", handler_type: "all_available_crew_at_tile", params: { tile_id: "4-4" } }),
      ]),
    );
    expect(findEffect(ending, "return_home_completed_flag")).toMatchObject({ type: "set_world_flag", params: { key: "return_home_completed", value: true } });
    expect(findEffect(ending, "return_home_completed_at_flag")).toMatchObject({ type: "set_world_flag", params: { key: "return_home_completed_at", value: 0 } });
  });
});

function findDefinition(content: JsonContent, id: string) {
  const definition = content.event_definitions.find((item) => item.id === id);
  expect(definition).toBeTruthy();
  return definition!;
}

function findEffect(definition: ReturnType<typeof findDefinition>, id: string) {
  const effect = definition.effect_groups?.flatMap((group) => group.effects).find((item) => item.id === id);
  expect(effect).toBeTruthy();
  return effect!;
}

function findCallOption(definition: ReturnType<typeof findDefinition>, id: string) {
  const option = definition.event_graph.nodes
    .flatMap((node) => ((node.options as JsonRecord[] | undefined) ?? []))
    .find((item) => item.id === id);
  expect(option).toBeTruthy();
  return option!;
}

function findMapObject(id: string) {
  const object = mapObjectDefinitionById.get(id);
  expect(object).toBeTruthy();
  return object!;
}
