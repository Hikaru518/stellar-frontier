export const LEGACY_GAME_SAVE_KEY = "stellar-frontier-save-v1";
export const GAME_SAVE_KEY = "stellar-frontier-save-v2";
export const GAME_SAVE_VERSION = 2;

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

export function loadGameSave<T>() {
  try {
    const raw = window.localStorage.getItem(GAME_SAVE_KEY);
    const parsed = raw ? (JSON.parse(raw) as T & { saveVersion?: number }) : null;
    return parsed?.saveVersion === GAME_SAVE_VERSION ? (parsed as T) : null;
  } catch {
    return null;
  }
}

export function saveGameState<T>(state: T) {
  try {
    window.localStorage.setItem(GAME_SAVE_KEY, JSON.stringify({ ...state, saveVersion: GAME_SAVE_VERSION }, omitDeprecatedSaveFields));
  } catch {
    // Losing a browser save should not stop the running prototype.
  }
}

export function clearGameSaves() {
  window.localStorage.removeItem(GAME_SAVE_KEY);
  window.localStorage.removeItem(LEGACY_GAME_SAVE_KEY);
}

function omitDeprecatedSaveFields(key: string, value: unknown) {
  if (key === "bag") {
    return undefined;
  }

  return value;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}
