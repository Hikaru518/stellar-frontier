import { EVENT_SAVE_SCHEMA_VERSION } from "./events/types";

export const LEGACY_GAME_SAVE_KEY = "stellar-frontier-save-v1";
export const GAME_SAVE_KEY = "stellar-frontier-save-v2";
export const GAME_SAVE_VERSION = 2;
export const GAME_SAVE_SCHEMA_VERSION = EVENT_SAVE_SCHEMA_VERSION;

export function formatGameTime(elapsedGameSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(elapsedGameSeconds));
  const day = Math.floor(safeSeconds / 86400) + 1;
  const hour = Math.floor((safeSeconds % 86400) / 3600);
  const minute = Math.floor((safeSeconds % 3600) / 60);
  const second = safeSeconds % 60;

  return `第 ${day} 日 ${pad2(hour)} 小时 ${pad2(minute)} 分钟 ${pad2(second)} 秒`;
}

export function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.ceil(totalSeconds));
  const hour = Math.floor(safeSeconds / 3600);
  const minute = Math.floor((safeSeconds % 3600) / 60);
  const second = safeSeconds % 60;

  if (hour > 0) {
    return `${pad2(hour)}:${pad2(minute)}:${pad2(second)}`;
  }

  return `${pad2(minute)}:${pad2(second)}`;
}

export function getRemainingSeconds(finishTime: number, elapsedGameSeconds: number) {
  return Math.max(0, finishTime - elapsedGameSeconds);
}

export function loadGameSave<T = unknown>(isCompatible?: (value: unknown) => boolean) {
  try {
    const raw = window.localStorage.getItem(GAME_SAVE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || (parsed.saveVersion !== undefined && parsed.saveVersion !== GAME_SAVE_VERSION)) {
      return null;
    }

    if (isCompatible && !isCompatible(parsed)) {
      return null;
    }

    return parsed as T;
  } catch {
    return null;
  }
}

export function saveGameState<T>(state: T) {
  try {
    window.localStorage.setItem(GAME_SAVE_KEY, JSON.stringify(withSaveMetadata(state), omitDeprecatedSaveFields));
  } catch {
    // Losing a browser save should not stop the running prototype.
  }
}

export function clearGameSaves() {
  window.localStorage.removeItem(GAME_SAVE_KEY);
  window.localStorage.removeItem(LEGACY_GAME_SAVE_KEY);
}

export function isCompatibleGameSaveState(value: unknown) {
  if (!isRecord(value) || value.schema_version !== GAME_SAVE_SCHEMA_VERSION) {
    return false;
  }

  return (
    isRecord(value.active_events) &&
    isRecord(value.active_calls) &&
    isRecord(value.objectives) &&
    Array.isArray(value.event_logs) &&
    isRecord(value.world_history) &&
    isRecord(value.world_flags) &&
    isRecord(value.crew_actions) &&
    isRecord(value.inventories) &&
    (value.rng_state === null || isRecord(value.rng_state))
  );
}

function omitDeprecatedSaveFields(key: string, value: unknown) {
  if (key === "bag" || key === "emergencyEvent") {
    return undefined;
  }

  return value;
}

function withSaveMetadata<T>(state: T): T {
  if (!isRecord(state)) {
    return state;
  }

  const now = new Date().toISOString();
  return {
    ...state,
    saveVersion: GAME_SAVE_VERSION,
    schema_version: GAME_SAVE_SCHEMA_VERSION,
    created_at_real_time: typeof state.created_at_real_time === "string" ? state.created_at_real_time : now,
    updated_at_real_time: now,
  } as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}
