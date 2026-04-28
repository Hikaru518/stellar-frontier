import { describe, expect, it } from "vitest";
import crashSiteContent from "../../../../content/events/definitions/mainline_crash_site.json";
import resourcesContent from "../../../../content/events/definitions/mainline_resources.json";

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
