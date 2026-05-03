import type { MapEditorDraft } from "./types";

export const DEFAULT_HELPER_BASE_URL = "http://127.0.0.1:4317";
export const HELPER_START_COMMAND = "npm run editor:helper";

type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface MapEditorLibraryMap {
  id: string;
  file_path: string;
  data: MapEditorDraft;
}

export interface MapEditorTilesetCategory {
  id: string;
  name: string;
  tileIndexes: number[];
}

export interface MapEditorTileset {
  id: string;
  name: string;
  assetPath: string;
  publicPath?: string;
  tileWidth: number;
  tileHeight: number;
  columns: number;
  tileCount: number;
  categories?: MapEditorTilesetCategory[];
}

export interface MapEditorTilesetRegistry {
  tilesets: MapEditorTileset[];
}

export interface MapEditorMapObject {
  id: string;
  name: string;
  kind: string;
  visibility: string;
}

export interface MapEditorLibraryResponse {
  maps: MapEditorLibraryMap[];
  tileset_registry: MapEditorTilesetRegistry;
  map_objects: MapEditorMapObject[];
  schemas: Record<string, unknown>;
}

export interface MapValidationIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  target?: {
    kind: "map" | "tile" | "layer" | "cell" | "tileset";
    tileId?: string;
    layerId?: string;
    tilesetId?: string;
    field?: string;
  };
  path?: string;
}

export interface ValidateMapResponse {
  valid: boolean;
  errors: MapValidationIssue[];
  warnings: MapValidationIssue[];
}

export interface SaveMapResponse {
  saved: boolean;
  file_path?: string;
  errors?: MapValidationIssue[];
  warnings?: MapValidationIssue[];
}

export class MapEditorApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly cause?: unknown;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    { status = 0, cause, details }: { status?: number; cause?: unknown; details?: Record<string, unknown> } = {},
  ) {
    super(message);
    this.name = "MapEditorApiError";
    this.code = code;
    this.status = status;
    this.cause = cause;
    this.details = details;
  }
}

export async function loadMapEditorLibrary({
  baseUrl = DEFAULT_HELPER_BASE_URL,
  fetchImpl = globalThis.fetch.bind(globalThis),
}: {
  baseUrl?: string;
  fetchImpl?: FetchImpl;
} = {}): Promise<MapEditorLibraryResponse> {
  let response: Response;

  try {
    response = await fetchImpl(`${trimTrailingSlash(baseUrl)}/api/map-editor/library`, {
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    throw new MapEditorApiError(
      "helper_unavailable",
      `Unable to reach the local map editor helper. Start it with ${HELPER_START_COMMAND}, then refresh this page.`,
      { cause: error },
    );
  }

  if (!response.ok) {
    const helperError = await readHelperError(response);
    throw new MapEditorApiError(
      helperError.code,
      helperError.message || `Helper returned HTTP ${response.status}.`,
      { status: response.status, details: helperError.details },
    );
  }

  return response.json() as Promise<MapEditorLibraryResponse>;
}

export async function validateMapDraft({
  filePath,
  data,
  baseUrl = DEFAULT_HELPER_BASE_URL,
  fetchImpl = globalThis.fetch.bind(globalThis),
}: {
  filePath?: string | null;
  data: MapEditorDraft;
  baseUrl?: string;
  fetchImpl?: FetchImpl;
}): Promise<ValidateMapResponse> {
  return postMapEditorJson<ValidateMapResponse>({
    baseUrl,
    fetchImpl,
    path: "/api/map-editor/validate",
    body: buildMapRequestBody(filePath, data),
  });
}

export async function saveMapDraft({
  filePath,
  data,
  baseUrl = DEFAULT_HELPER_BASE_URL,
  fetchImpl = globalThis.fetch.bind(globalThis),
}: {
  filePath?: string | null;
  data: MapEditorDraft;
  baseUrl?: string;
  fetchImpl?: FetchImpl;
}): Promise<SaveMapResponse> {
  return postMapEditorJson<SaveMapResponse>({
    baseUrl,
    fetchImpl,
    path: "/api/map-editor/save",
    body: buildMapRequestBody(filePath, data),
  });
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function buildMapRequestBody(filePath: string | null | undefined, data: MapEditorDraft): { file_path?: string; data: MapEditorDraft } {
  return filePath ? { file_path: filePath, data } : { data };
}

async function postMapEditorJson<T>({
  baseUrl,
  fetchImpl,
  path,
  body,
}: {
  baseUrl: string;
  fetchImpl: FetchImpl;
  path: string;
  body: unknown;
}): Promise<T> {
  let response: Response;

  try {
    response = await fetchImpl(`${trimTrailingSlash(baseUrl)}${path}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new MapEditorApiError(
      "helper_unavailable",
      `Unable to reach the local map editor helper. Start it with ${HELPER_START_COMMAND}, then try again.`,
      { cause: error },
    );
  }

  if (!response.ok) {
    const helperError = await readHelperError(response);
    throw new MapEditorApiError(
      helperError.code,
      helperError.message || `Helper returned HTTP ${response.status}.`,
      { status: response.status, details: helperError.details },
    );
  }

  return response.json() as Promise<T>;
}

async function readHelperError(response: Response): Promise<{ code: string; message: string; details?: Record<string, unknown> }> {
  try {
    const body = (await response.json()) as { error?: { code?: string; message?: string }; [key: string]: unknown };
    const { error, ...details } = body;
    return {
      code: error?.code ?? "helper_error",
      message: error?.message ?? "",
      details: Object.keys(details).length > 0 ? details : undefined,
    };
  } catch {
    return {
      code: "helper_error",
      message: "",
    };
  }
}
