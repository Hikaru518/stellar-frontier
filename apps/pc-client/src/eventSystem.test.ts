import { describe, expect, it } from "vitest";
import type { EventDefinition } from "./content/contentData";
import { initialCrew, initialLogs, initialTiles, resources } from "./data/gameData";
import { executeEventEffects } from "./eventSystem";

const baseEvent: EventDefinition = {
  eventId: "test_inventory_event",
  title: "库存测试事件",
  type: "story",
  priority: 1,
  scope: "crew",
  repeatable: true,
  cooldownSeconds: 0,
  trigger: { source: "callChoice" },
  conditions: [],
  baseChance: 1,
  modifiers: [],
  durationSeconds: 0,
  effects: [],
  choices: [],
  emergency: null,
  resultText: {},
  tags: [],
};

const member = initialCrew.find((crew) => crew.id === "mike")!;
const tile = initialTiles.find((item) => item.id === member.currentTile)!;

describe("eventSystem inventory effects", () => {
  it("adds items to the triggering crew inventory", () => {
    const result = executeEventEffects({
      event: baseEvent,
      effects: [{ type: "addItem", itemId: "wood", target: "crewInventory", amount: 2 }],
      member: { ...member, inventory: [] },
      tile,
      tiles: initialTiles,
      resources,
      logs: initialLogs,
      baseInventory: [],
      elapsedGameSeconds: 10,
      appendDefaultLog: false,
    });

    expect(result.member.inventory).toEqual([{ itemId: "wood", quantity: 2 }]);
    expect(result.baseInventory).toEqual([]);
  });

  it("adds items to base inventory and syncs resource counters for iron and wood", () => {
    const result = executeEventEffects({
      event: baseEvent,
      effects: [{ type: "addItem", itemId: "iron_ore", target: "baseInventory", amount: 3 }],
      member,
      tile,
      tiles: initialTiles,
      resources: { ...resources, iron: 1 },
      logs: initialLogs,
      baseInventory: [{ itemId: "iron_ore", quantity: 1 }],
      elapsedGameSeconds: 10,
      appendDefaultLog: false,
    });

    expect(result.baseInventory).toEqual([{ itemId: "iron_ore", quantity: 4 }]);
    expect(result.resources.iron).toBe(4);
  });

  it("uses and consumes a usable tagged item from crew inventory", () => {
    const result = executeEventEffects({
      event: baseEvent,
      effects: [{ type: "useItemByTag", itemTag: "signal" }],
      member: { ...member, inventory: [{ itemId: "signal_flare", quantity: 2 }] },
      tile,
      tiles: initialTiles,
      resources,
      logs: initialLogs,
      baseInventory: [],
      elapsedGameSeconds: 10,
      appendDefaultLog: false,
    });

    expect(result.member.inventory).toEqual([{ itemId: "signal_flare", quantity: 1 }]);
    expect(result.logs[result.logs.length - 1]?.text).toBe("Mike 使用了信号弹，道具已消耗。");
  });

  it("keeps inventory unchanged and records an unavailable result when no tagged item is usable", () => {
    const inventory = [{ itemId: "old_compass", quantity: 1 }];
    const result = executeEventEffects({
      event: baseEvent,
      effects: [{ type: "useItemByTag", itemTag: "medical" }],
      member: { ...member, inventory },
      tile,
      tiles: initialTiles,
      resources,
      logs: initialLogs,
      baseInventory: [],
      elapsedGameSeconds: 10,
      appendDefaultLog: false,
    });

    expect(result.member.inventory).toEqual(inventory);
    expect(result.logs[result.logs.length - 1]?.text).toBe("Mike 无法使用medical道具：没有可用的医疗道具。");
  });
});
