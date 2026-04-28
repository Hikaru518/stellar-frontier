import { describe, expect, it } from "vitest";
import crashSiteContent from "../../../../content/events/definitions/mainline_crash_site.json";
import medicalContent from "../../../../content/events/definitions/mainline_medical.json";
import resourcesContent from "../../../../content/events/definitions/mainline_resources.json";
import villageContent from "../../../../content/events/definitions/mainline_village.json";

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
