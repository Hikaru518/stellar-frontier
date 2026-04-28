import type { EventEditorLibraryResponse } from "./types";

export const DEFAULT_HELPER_BASE_URL = "http://127.0.0.1:4317";
export const HELPER_START_COMMAND = "npm run editor:helper";

type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class EventEditorApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly cause?: unknown;

  constructor(code: string, message: string, { status = 0, cause }: { status?: number; cause?: unknown } = {}) {
    super(message);
    this.name = "EventEditorApiError";
    this.code = code;
    this.status = status;
    this.cause = cause;
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

async function readHelperError(response: Response): Promise<{ code: string; message: string }> {
  try {
    const body = (await response.json()) as { error?: { code?: string; message?: string } };
    return {
      code: body.error?.code ?? "helper_error",
      message: body.error?.message ?? "",
    };
  } catch {
    return {
      code: "helper_error",
      message: "",
    };
  }
}
