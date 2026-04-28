import type { ActionDef } from "../content/mapObjects";
import type { Condition } from "../events/types";

/**
 * Generates a Chinese unavailable-hint string for an action whose conditions
 * failed. `action.unavailable_hint` always wins; otherwise the first failed
 * condition is dispatched to a per-type template.
 *
 * Task 1: covers the four condition kinds the design lists explicitly —
 * `inventory_has_item`, `has_tag`, `compare_field`, and `handler_condition`
 * (with a special branch for the `object_status_equals` handler).
 */
export function generateHint(action: ActionDef, failedConditions: Condition[]): string {
  if (typeof action.unavailable_hint === "string" && action.unavailable_hint.length > 0) {
    return action.unavailable_hint;
  }

  const first = failedConditions[0];
  if (!first) {
    return "条件不满足";
  }

  return renderConditionHint(first);
}

function renderConditionHint(condition: Condition): string {
  switch (condition.type) {
    case "inventory_has_item": {
      const itemId = readString(condition.value) ?? readStringParam(condition.params, "item_id") ?? "未知物品";
      const minQuantity = readNumberParam(condition.params, "min_quantity");
      if (typeof minQuantity === "number" && minQuantity > 1) {
        return `需要 [${itemId}] x${minQuantity}`;
      }
      return `需要 [${itemId}]`;
    }
    case "has_tag": {
      const tag = readString(condition.value) ?? readStringParam(condition.params, "tag") ?? "未知标签";
      return `需要 ${tag} 标签`;
    }
    case "compare_field": {
      const field = condition.field ?? "字段";
      const op = condition.op ?? "equals";
      const value = formatValue(condition.value);
      return `${field} 需 ${formatOp(op)} ${value}`;
    }
    case "handler_condition": {
      if (condition.handler_type === "object_status_equals") {
        const objectId = readStringParam(condition.params, "object_id") ?? "对象";
        const status = readStringParam(condition.params, "status") ?? "目标状态";
        return `对象 ${objectId} 需先 ${status}`;
      }
      return `需要满足 ${condition.handler_type ?? "handler"} 条件`;
    }
    default:
      return condition.description ?? `条件 ${condition.type} 不满足`;
  }
}

function formatOp(op: string): string {
  switch (op) {
    case "equals":
      return "为";
    case "not_equals":
      return "不为";
    case "gt":
      return "大于";
    case "gte":
      return "≥";
    case "lt":
      return "小于";
    case "lte":
      return "≤";
    case "includes":
      return "包含";
    case "not_includes":
      return "不包含";
    default:
      return op;
  }
}

function formatValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value == null) {
    return "目标值";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readStringParam(params: Condition["params"], name: string): string | undefined {
  const value = params?.[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNumberParam(params: Condition["params"], name: string): number | undefined {
  const value = params?.[name];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
