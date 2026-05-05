import type {
  CreateDomainRequest,
  CreateDomainResponse,
  CreateDraftRequest,
  CreateDraftResponse,
  EventDraftEnvelope,
  EventEditorLibraryResponse,
  SaveDraftRequest,
  SaveDraftResponse,
  ValidateDraftRequest,
  ValidateDraftResponse,
} from "./types";

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
  return getEventEditorJson<EventEditorLibraryResponse>({
    baseUrl,
    fetchImpl,
    path: "/api/event-editor/library",
    unavailableMessage: `Unable to reach the local event editor helper. Start it with ${HELPER_START_COMMAND}, then refresh this page.`,
  });
}

export async function createDomain({
  domainId,
  baseUrl = DEFAULT_HELPER_BASE_URL,
  fetchImpl = globalThis.fetch.bind(globalThis),
}: {
  domainId: string;
  baseUrl?: string;
  fetchImpl?: FetchImpl;
}): Promise<CreateDomainResponse> {
  const body: CreateDomainRequest = {
    domain_id: domainId,
  };

  return postEventEditorJson<CreateDomainResponse>({
    baseUrl,
    fetchImpl,
    path: "/api/event-editor/domains",
    body,
  });
}

export async function createDraft({
  request,
  baseUrl = DEFAULT_HELPER_BASE_URL,
  fetchImpl = globalThis.fetch.bind(globalThis),
}: {
  request: CreateDraftRequest;
  baseUrl?: string;
  fetchImpl?: FetchImpl;
}): Promise<CreateDraftResponse> {
  return postEventEditorJson<CreateDraftResponse>({
    baseUrl,
    fetchImpl,
    path: "/api/event-editor/drafts",
    body: buildCreateDraftRequest(request),
  });
}

export async function loadDraft({
  draftId,
  includeArchived = false,
  baseUrl = DEFAULT_HELPER_BASE_URL,
  fetchImpl = globalThis.fetch.bind(globalThis),
}: {
  draftId: string;
  includeArchived?: boolean;
  baseUrl?: string;
  fetchImpl?: FetchImpl;
}): Promise<EventDraftEnvelope> {
  const query = includeArchived ? "?include_archived=true" : "";

  return getEventEditorJson<EventDraftEnvelope>({
    baseUrl,
    fetchImpl,
    path: `/api/event-editor/drafts/${encodeURIComponent(draftId)}${query}`,
    unavailableMessage: `Unable to reach the local event editor helper. Start it with ${HELPER_START_COMMAND}, then try again.`,
  });
}

export async function saveDraft({
  draftId,
  draft,
  expectedDraftHash,
  baseUrl = DEFAULT_HELPER_BASE_URL,
  fetchImpl = globalThis.fetch.bind(globalThis),
}: {
  draftId: string;
  draft: EventDraftEnvelope;
  expectedDraftHash?: string | null;
  baseUrl?: string;
  fetchImpl?: FetchImpl;
}): Promise<SaveDraftResponse> {
  return postEventEditorJson<SaveDraftResponse>({
    baseUrl,
    fetchImpl,
    path: `/api/event-editor/drafts/${encodeURIComponent(draftId)}/save`,
    body: buildSaveDraftRequest(draft, expectedDraftHash),
  });
}

export async function validateDraft({
  draftId,
  level,
  draft,
  baseUrl = DEFAULT_HELPER_BASE_URL,
  fetchImpl = globalThis.fetch.bind(globalThis),
}: {
  draftId: string;
  level: ValidateDraftRequest["level"];
  draft?: EventDraftEnvelope;
  baseUrl?: string;
  fetchImpl?: FetchImpl;
}): Promise<ValidateDraftResponse> {
  return postEventEditorJson<ValidateDraftResponse>({
    baseUrl,
    fetchImpl,
    path: `/api/event-editor/drafts/${encodeURIComponent(draftId)}/validate`,
    body: buildValidateDraftRequest(level, draft),
  });
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function buildCreateDraftRequest(request: CreateDraftRequest): CreateDraftRequest {
  if (request.mode === "new") {
    return {
      mode: "new",
      target_domain: request.target_domain,
      definition_id: request.definition_id,
      ...(request.title !== undefined ? { title: request.title } : {}),
      ...(request.summary !== undefined ? { summary: request.summary } : {}),
    };
  }

  return {
    mode: "edit_existing",
    definition_id: request.definition_id,
    domain: request.domain,
  };
}

function buildSaveDraftRequest(draft: EventDraftEnvelope, expectedDraftHash: string | null | undefined): SaveDraftRequest {
  return expectedDraftHash === undefined
    ? { draft }
    : { draft, expected_draft_hash: expectedDraftHash };
}

function buildValidateDraftRequest(level: ValidateDraftRequest["level"], draft: EventDraftEnvelope | undefined): ValidateDraftRequest {
  return draft === undefined
    ? { level }
    : { draft, level };
}

async function getEventEditorJson<T>({
  baseUrl,
  fetchImpl,
  path,
  unavailableMessage,
}: {
  baseUrl: string;
  fetchImpl: FetchImpl;
  path: string;
  unavailableMessage: string;
}): Promise<T> {
  let response: Response;

  try {
    response = await fetchImpl(`${trimTrailingSlash(baseUrl)}${path}`, {
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    throw new EventEditorApiError(
      "helper_unavailable",
      unavailableMessage,
      { cause: error },
    );
  }

  if (!response.ok) {
    const helperError = await readHelperError(response);
    throw new EventEditorApiError(
      helperError.code,
      helperError.message || `Helper returned HTTP ${response.status}.`,
      { status: response.status, details: helperError.details },
    );
  }

  return response.json() as Promise<T>;
}

async function postEventEditorJson<T>({
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
    throw new EventEditorApiError(
      "helper_unavailable",
      `Unable to reach the local event editor helper. Start it with ${HELPER_START_COMMAND}, then try again.`,
      { cause: error },
    );
  }

  if (!response.ok) {
    const helperError = await readHelperError(response);
    throw new EventEditorApiError(
      helperError.code,
      helperError.message || `Helper returned HTTP ${response.status}.`,
      { status: response.status, details: helperError.details },
    );
  }

  return response.json() as Promise<T>;
}

async function readHelperError(response: Response): Promise<{ code: string; message: string; details?: Record<string, unknown> }> {
  try {
    const body = (await response.json()) as {
      error?: { code?: string; message?: string; details?: unknown };
      details?: unknown;
      [key: string]: unknown;
    };
    const { error, ...topLevelDetails } = body;
    return {
      code: error?.code ?? "helper_error",
      message: error?.message ?? "",
      details: extractHelperErrorDetails(error?.details, body.details, topLevelDetails),
    };
  } catch {
    return {
      code: "helper_error",
      message: "",
    };
  }
}

function extractHelperErrorDetails(
  errorDetails: unknown,
  bodyDetails: unknown,
  topLevelDetails: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (isRecord(errorDetails)) {
    return errorDetails;
  }

  if (isRecord(bodyDetails)) {
    return bodyDetails;
  }

  const { details: _details, ...rest } = topLevelDetails;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
