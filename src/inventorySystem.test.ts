import { describe, expect, it } from "vitest";
import type { ItemDefinition } from "./content/contentData";
import {
  addInventoryItem,
  findUsableInventoryItemByTag,
  getInventoryView,
  removeInventoryItem,
  useInventoryItemByTag,
  type InventoryEntry,
} from "./inventorySystem";

const testItems = new Map<string, ItemDefinition>([
  [
    "lantern",
    {
      itemId: "lantern",
      name: "手提灯",
      category: "tool",
      stackable: false,
      usableInResponse: true,
      consumedOnUse: false,
      description: "稳定光源。",
      tags: ["light", "tool"],
      effects: [],
    },
  ],
  [
    "flare",
    {
      itemId: "flare",
      name: "照明弹",
      category: "consumable",
      stackable: true,
      maxStack: 1,
      usableInResponse: true,
      consumedOnUse: true,
      description: "一次性强光。",
      tags: ["light", "signal"],
      effects: [],
    },
  ],
  [
    "ration",
    {
      itemId: "ration",
      name: "口粮",
      category: "consumable",
      stackable: true,
      maxStack: 1,
      usableInResponse: true,
      consumedOnUse: true,
      description: "可食用补给。",
      tags: ["food"],
      effects: [],
    },
  ],
  [
    "display_only_light",
    {
      itemId: "display_only_light",
      name: "装饰灯",
      category: "misc",
      stackable: false,
      usableInResponse: false,
      consumedOnUse: false,
      description: "不能用于事件响应。",
      tags: ["light"],
      effects: [],
    },
  ],
]);

describe("inventorySystem", () => {
  it("adds items, merges same itemId, ignores non-positive amounts, and does not enforce maxStack", () => {
    const inventory = addInventoryItem([], "flare", 1);
    const mergedInventory = addInventoryItem(inventory, "flare", 3);
    const unchangedInventory = addInventoryItem(mergedInventory, "flare", 0);

    expect(mergedInventory).toEqual([{ itemId: "flare", quantity: 4 }]);
    expect(unchangedInventory).toEqual([{ itemId: "flare", quantity: 4 }]);
  });

  it("removes items without creating negative quantities", () => {
    const inventory: InventoryEntry[] = [
      { itemId: "flare", quantity: 2 },
      { itemId: "lantern", quantity: 1 },
    ];

    expect(removeInventoryItem(inventory, "flare", 1)).toEqual([
      { itemId: "flare", quantity: 1 },
      { itemId: "lantern", quantity: 1 },
    ]);
    expect(removeInventoryItem(inventory, "flare", 5)).toEqual([{ itemId: "lantern", quantity: 1 }]);
    expect(removeInventoryItem(inventory, "flare", 0)).toEqual(inventory);
  });

  it("finds the first usable item by tag sorted by itemId", () => {
    const inventory: InventoryEntry[] = [
      { itemId: "lantern", quantity: 1 },
      { itemId: "missing_light", quantity: 1 },
      { itemId: "display_only_light", quantity: 1 },
      { itemId: "flare", quantity: 1 },
      { itemId: "ration", quantity: 0 },
    ];

    const candidate = findUsableInventoryItemByTag(inventory, "light", testItems);

    expect(candidate?.entry).toEqual({ itemId: "flare", quantity: 1 });
    expect(candidate?.item.name).toBe("照明弹");
  });

  it("consumes items when consumedOnUse is true", () => {
    const result = useInventoryItemByTag(
      [
        { itemId: "flare", quantity: 2 },
        { itemId: "lantern", quantity: 1 },
      ],
      "signal",
      testItems,
    );

    expect(result.available).toBe(true);
    expect(result.consumed).toBe(true);
    expect(result.item?.itemId).toBe("flare");
    expect(result.inventory).toEqual([
      { itemId: "flare", quantity: 1 },
      { itemId: "lantern", quantity: 1 },
    ]);
  });

  it("keeps inventory unchanged when the usable item is not consumed", () => {
    const inventory: InventoryEntry[] = [{ itemId: "lantern", quantity: 1 }];
    const result = useInventoryItemByTag(inventory, "light", testItems);

    expect(result.available).toBe(true);
    expect(result.consumed).toBe(false);
    expect(result.item?.itemId).toBe("lantern");
    expect(result.inventory).toEqual(inventory);
  });

  it("returns an unavailable reason and keeps inventory unchanged when no usable item exists", () => {
    const inventory: InventoryEntry[] = [
      { itemId: "display_only_light", quantity: 1 },
      { itemId: "missing_light", quantity: 1 },
    ];
    const result = useInventoryItemByTag(inventory, "light", testItems);

    expect(result.available).toBe(false);
    expect(result.reason).toBe("没有可用的照明道具。");
    expect(result.inventory).toEqual(inventory);
  });

  it("builds display views and marks missing definitions", () => {
    const view = getInventoryView(
      [
        { itemId: "lantern", quantity: 1 },
        { itemId: "unknown_relic", quantity: 2 },
      ],
      testItems,
    );

    expect(view[0]).toMatchObject({
      itemId: "lantern",
      name: "手提灯",
      quantity: 1,
      categoryLabel: "工具",
      tagLabels: ["照明", "工具"],
      usableInResponse: true,
      consumedOnUse: false,
      missingDefinition: false,
    });
    expect(view[1]).toMatchObject({
      itemId: "unknown_relic",
      name: "unknown_relic",
      quantity: 2,
      categoryLabel: "缺失定义",
      missingDefinition: true,
    });
  });
});
