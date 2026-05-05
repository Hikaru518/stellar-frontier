import type {
  EventDraftEditorState,
  EventDraftEnvelope,
  EventDraftHashes,
  EventDraftTargetRef,
  EventDraftWorkingCallTemplate,
  EventDraftWorkingDefinition,
} from "../types";
import {
  createDefaultCallTemplateShell,
  createDefaultEventDefinitionShell,
  isSafeEventId,
} from "./templates";

export interface CreateDefaultTargetRefOptions {
  domain: string;
  definitionId: string;
}

export interface CreateDefaultNewDraftEnvelopeOptions extends CreateDefaultTargetRefOptions {
  title?: string;
  summary?: string;
  createdAt: string | Date;
}

const EVENT_DRAFT_SCHEMA_VERSION = "event-editor-draft-v1";

export function createDefaultNewDraftEnvelope({
  domain,
  definitionId,
  title,
  summary,
  createdAt,
}: CreateDefaultNewDraftEnvelopeOptions): EventDraftEnvelope {
  const createdDate = normalizeDraftDate(createdAt);
  const timestamp = createdDate.toISOString();
  const workingDefinition: EventDraftWorkingDefinition = {
    ...createDefaultEventDefinitionShell({
      domain,
      definitionId,
      title,
      summary,
    }),
  };
  const workingCallTemplate: EventDraftWorkingCallTemplate = {
    ...createDefaultCallTemplateShell({
      domain,
      eventDefinitionId: definitionId,
      nodeId: "call",
    }),
  };

  return {
    schema_version: EVENT_DRAFT_SCHEMA_VERSION,
    draft_id: createDraftId(definitionId, createdDate),
    mode: "new",
    status: "active",
    source: null,
    target: createDefaultTargetRef({ domain, definitionId }),
    working_definition: workingDefinition,
    working_call_templates: [workingCallTemplate],
    editor_state: createDefaultEditorState(),
    hashes: createEmptyDraftHashes(),
    created_at: timestamp,
    updated_at: timestamp,
    published_at: null,
    published_files: [],
  };
}

export function createDefaultTargetRef({ domain, definitionId }: CreateDefaultTargetRefOptions): EventDraftTargetRef {
  return {
    domain,
    definition_id: definitionId,
    definition_file_path: `content/events/definitions/${domain}.json`,
    call_template_file_path: `content/events/call_templates/${domain}.json`,
  };
}

export function createDefaultEditorState(): EventDraftEditorState {
  return {
    active_step: "basic",
    selection: null,
    collapsed_sections: [],
  };
}

export function isSafeDraftTargetRef(value: unknown): value is EventDraftTargetRef {
  if (!isRecord(value) || !isSafeEventId(value.domain) || !isSafeEventId(value.definition_id)) {
    return false;
  }

  const expected = createDefaultTargetRef({
    domain: value.domain,
    definitionId: value.definition_id,
  });

  return value.definition_file_path === expected.definition_file_path && value.call_template_file_path === expected.call_template_file_path;
}

export function isEventDraftEnvelope(value: unknown): value is EventDraftEnvelope {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.schema_version === EVENT_DRAFT_SCHEMA_VERSION &&
    isSafeEventId(value.draft_id) &&
    isDraftMode(value.mode) &&
    isDraftStatus(value.status) &&
    (value.source === null || isRecord(value.source)) &&
    isSafeDraftTargetRef(value.target) &&
    isRecord(value.working_definition) &&
    Array.isArray(value.working_call_templates) &&
    isEditorState(value.editor_state) &&
    isDraftHashes(value.hashes) &&
    isIsoTimestamp(value.created_at) &&
    isIsoTimestamp(value.updated_at) &&
    (value.published_at === null || isIsoTimestamp(value.published_at)) &&
    Array.isArray(value.published_files) &&
    value.published_files.every((filePath) => typeof filePath === "string")
  );
}

function createEmptyDraftHashes(): EventDraftHashes {
  return {
    source_definition_file: null,
    source_call_template_file: null,
    source_manifest: null,
    draft: null,
  };
}

function normalizeDraftDate(value: string | Date): Date {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid draft timestamp.");
  }

  return date;
}

function createDraftId(definitionId: string, date: Date): string {
  return `${definitionId}_${formatDraftTimestamp(date)}`;
}

function formatDraftTimestamp(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, "0");

  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    "_",
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
  ].join("");
}

function isEditorState(value: unknown): value is EventDraftEditorState {
  return (
    isRecord(value) &&
    typeof value.active_step === "string" &&
    "selection" in value &&
    Array.isArray(value.collapsed_sections) &&
    value.collapsed_sections.every((section) => typeof section === "string")
  );
}

function isDraftHashes(value: unknown): value is EventDraftHashes {
  return (
    isRecord(value) &&
    isNullableString(value.source_definition_file) &&
    isNullableString(value.source_call_template_file) &&
    isNullableString(value.source_manifest) &&
    isNullableString(value.draft)
  );
}

function isDraftMode(value: unknown): boolean {
  return value === "new" || value === "edit_existing";
}

function isDraftStatus(value: unknown): boolean {
  return value === "active" || value === "archived";
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
