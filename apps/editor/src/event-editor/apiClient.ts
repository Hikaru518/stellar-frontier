import type { EventEditorLibraryResponse } from "./types";

export const DEFAULT_HELPER_BASE_URL = "http://127.0.0.1:4317";
export const HELPER_START_COMMAND = "npm run editor:helper";

type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class EventEditorApiError extends Error {
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
    this.name = "EventEditorApiError";
    this.code = code;
    this.status = status;
    this.cause = cause;
    this.details = details;
  }
}

export async function loadEventEditorLibrary({
  baseUrl = DEFAULT_HELPER_BASE_URL,
  fetchImpl = globalThis.fetch.bind(globalThis),
}: {
  baseUrl?: string;
  fetchImpl?: FetchImpl;
} = {}): Promise<EventEditorLibraryResponse> {
  let response: Response;

  try {
    response = await fetchImpl(`${trimTrailingSlash(baseUrl)}/api/event-editor/library`, {
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    throw new EventEditorApiError(
      "helper_unavailable",
      `Unable to reach the local event editor helper. Start it with ${HELPER_START_COMMAND}, then refresh this page.`,
      { cause: error },
    );
  }

  if (!response.ok) {
    const helperError = await readHelperError(response);
    throw new EventEditorApiError(
      helperError.code,
      helperError.message || `Helper returned HTTP ${response.status}.`,
      { status: response.status },
    );
  }

  return response.json() as Promise<EventEditorLibraryResponse>;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
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
