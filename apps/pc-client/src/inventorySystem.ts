import { itemDefinitionById, type ItemDefinition } from "./content/contentData";

export interface InventoryEntry {
  itemId: string;
  quantity: number;
}

export interface InventoryItemView {
  itemId: string;
  name: string;
  quantity: number;
  category?: ItemDefinition["category"];
  categoryLabel: string;
  description: string;
  tags: string[];
  tagLabels: string[];
  usableInResponse: boolean;
  consumedOnUse: boolean;
  missingDefinition: boolean;
}

export interface UseInventoryItemResult {
  available: boolean;
  inventory: InventoryEntry[];
  item?: ItemDefinition;
  entry?: InventoryEntry;
  consumed: boolean;
  reason?: string;
}

export const itemTagLabelByTag: Record<string, string> = {
  food: "食物",
  light: "照明",
  medical: "医疗",
  signal: "信号",
  clue: "线索",
  weapon: "武器",
  combat: "战斗",
  emergency: "应急",
  navigation: "导航",
  survey: "调查",
  social: "社交",
  scent: "气味",
  morale: "士气",
  quest: "任务",
  trade: "贸易",
  tool: "工具",
  mining: "采矿",
  personal: "个人物品",
  resource: "资源",
  building: "建设",
  build: "建设",
};

const categoryLabelByCategory: Record<ItemDefinition["category"], string> = {
  tool: "工具",
  weapon: "武器",
  consumable: "消耗品",
  resource: "资源",
  quest: "任务物品",
  misc: "杂项",
};

function sanitizeInventory(inventory: InventoryEntry[]) {
  return inventory.filter((entry) => entry.quantity > 0).map((entry) => ({ ...entry }));
}

export function getItemTagLabel(tag: string) {
  return itemTagLabelByTag[tag] ?? tag;
}

export function addInventoryItem(inventory: InventoryEntry[], itemId: string, amount: number) {
  const sanitizedInventory = sanitizeInventory(inventory);

  if (amount <= 0) {
    return sanitizedInventory;
  }

  const existingEntry = sanitizedInventory.find((entry) => entry.itemId === itemId);
  if (!existingEntry) {
    return [...sanitizedInventory, { itemId, quantity: amount }];
  }

  return sanitizedInventory.map((entry) =>
    entry.itemId === itemId ? { ...entry, quantity: entry.quantity + amount } : entry,
  );
}

export function removeInventoryItem(inventory: InventoryEntry[], itemId: string, amount: number) {
  const sanitizedInventory = sanitizeInventory(inventory);

  if (amount <= 0) {
    return sanitizedInventory;
  }

  return sanitizedInventory
    .map((entry) =>
      entry.itemId === itemId ? { ...entry, quantity: Math.max(0, entry.quantity - amount) } : entry,
    )
    .filter((entry) => entry.quantity > 0);
}

export function findUsableInventoryItemByTag(
  inventory: InventoryEntry[],
  itemTag: string,
  definitions: Map<string, ItemDefinition> = itemDefinitionById,
) {
  return sanitizeInventory(inventory)
    .map((entry) => ({ entry, item: definitions.get(entry.itemId) }))
    .filter(
      (candidate): candidate is { entry: InventoryEntry; item: ItemDefinition } =>
        Boolean(candidate.item?.usableInResponse && candidate.item.tags.includes(itemTag)),
    )
    .sort((left, right) => left.entry.itemId.localeCompare(right.entry.itemId))[0];
}

export function useInventoryItemByTag(
  inventory: InventoryEntry[],
  itemTag: string,
  definitions: Map<string, ItemDefinition> = itemDefinitionById,
): UseInventoryItemResult {
  const sanitizedInventory = sanitizeInventory(inventory);
  const candidate = findUsableInventoryItemByTag(sanitizedInventory, itemTag, definitions);

  if (!candidate) {
    return {
      available: false,
      inventory: sanitizedInventory,
      consumed: false,
      reason: `没有可用的${getItemTagLabel(itemTag)}道具。`,
    };
  }

  return {
    available: true,
    inventory: candidate.item.consumedOnUse
      ? removeInventoryItem(sanitizedInventory, candidate.entry.itemId, 1)
      : sanitizedInventory,
    item: candidate.item,
    entry: candidate.entry,
    consumed: candidate.item.consumedOnUse,
  };
}

export function getInventoryView(
  inventory: InventoryEntry[],
  definitions: Map<string, ItemDefinition> = itemDefinitionById,
): InventoryItemView[] {
  return sanitizeInventory(inventory).map((entry) => {
    const item = definitions.get(entry.itemId);

    if (!item) {
      return {
        itemId: entry.itemId,
        name: entry.itemId,
        quantity: entry.quantity,
        categoryLabel: "缺失定义",
        description: "道具定义缺失。",
        tags: [],
        tagLabels: [],
        usableInResponse: false,
        consumedOnUse: false,
        missingDefinition: true,
      };
    }

    return {
      itemId: entry.itemId,
      name: item.name,
      quantity: entry.quantity,
      category: item.category,
      categoryLabel: categoryLabelByCategory[item.category],
      description: item.description,
      tags: item.tags,
      tagLabels: item.tags.map(getItemTagLabel),
      usableInResponse: item.usableInResponse,
      consumedOnUse: item.consumedOnUse,
      missingDefinition: false,
    };
  });
}
