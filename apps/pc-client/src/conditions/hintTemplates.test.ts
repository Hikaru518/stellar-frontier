import { describe, expect, it } from "vitest";
import { generateHint } from "./hintTemplates";
import type { ActionDef } from "../content/mapObjects";
import type { Condition } from "../events/types";

describe("generateHint", () => {
  it("uses action.unavailable_hint when set, ignoring failed conditions", () => {
    const action = makeAction({ unavailable_hint: "需要先完成主线" });
    const failed: Condition[] = [
      { type: "inventory_has_item", target: { type: "crew_inventory" }, value: "welder" },
    ];
    expect(generateHint(action, failed)).toBe("需要先完成主线");
  });

  it("renders inventory_has_item with the item id", () => {
    const action = makeAction();
    const failed: Condition[] = [
      { type: "inventory_has_item", target: { type: "crew_inventory" }, value: "welder" },
    ];
    expect(generateHint(action, failed)).toBe("需要 [welder]");
  });

  it("includes min_quantity when greater than one", () => {
    const action = makeAction();
    const failed: Condition[] = [
      {
        type: "inventory_has_item",
        target: { type: "crew_inventory" },
        value: "medkit",
        params: { min_quantity: 3 },
      },
    ];
    expect(generateHint(action, failed)).toBe("需要 [medkit] x3");
  });

  it("renders has_tag with the requested tag", () => {
    const action = makeAction();
    const failed: Condition[] = [
      { type: "has_tag", target: { type: "primary_crew" }, value: "工程师" },
    ];
    expect(generateHint(action, failed)).toBe("需要 工程师 标签");
  });

  it("renders compare_field using the field path and operator", () => {
    const action = makeAction();
    const failed: Condition[] = [
      {
        type: "compare_field",
        target: { type: "primary_crew" },
        field: "attributes.perception",
        op: "gte",
        value: 4,
      },
    ];
    expect(generateHint(action, failed)).toBe("attributes.perception 需 ≥ 4");
  });

  it("renders handler_condition object_status_equals with object id and status", () => {
    const action = makeAction();
    const failed: Condition[] = [
      {
        type: "handler_condition",
        handler_type: "object_status_equals",
        params: { object_id: "locked-door", status: "unlocked" },
      },
    ];
    expect(generateHint(action, failed)).toBe("对象 locked-door 需先 unlocked");
  });

  it("falls back to a generic handler hint when handler_type is not specially supported", () => {
    const action = makeAction();
    const failed: Condition[] = [
      {
        type: "handler_condition",
        handler_type: "all_available_crew_at_tile",
        params: { tile_id: "2-3" },
      },
    ];
    expect(generateHint(action, failed)).toBe("需要满足 all_available_crew_at_tile 条件");
  });

  it("returns a generic message when the failed-conditions list is empty", () => {
    const action = makeAction();
    expect(generateHint(action, [])).toBe("条件不满足");
  });

  it("falls back to condition.description for unhandled types", () => {
    const action = makeAction();
    const failed: Condition[] = [
      { type: "world_flag_equals", description: "需要风暴解除" },
    ];
    expect(generateHint(action, failed)).toBe("需要风暴解除");
  });
});

function makeAction(overrides: Partial<ActionDef> = {}): ActionDef {
  return {
    id: "test:action",
    category: "object",
    label: "测试行动",
    conditions: [],
    event_id: "test.event",
    display_when_unavailable: "disabled",
    ...overrides,
  };
}
