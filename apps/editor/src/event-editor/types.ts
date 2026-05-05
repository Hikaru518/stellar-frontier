import type { CallTemplate, EventDefinition } from "../../../pc-client/src/events/types";

export type EditorEventAssetType = "event_definition" | "call_template" | "handler" | "preset";

export interface EditorEventAsset<T> {
  id: string;
  domain: string;
  asset_type: EditorEventAssetType;
  file_path: string;
  json_path: string;
  data: T;
  editable: boolean;
}

export interface EventDomainSummary {
  id: string;
  manifest_path: string;
  manifest_json_path: string;
  definitions_file_path: string;
  call_templates_file_path: string;
  presets_file_path: string | null;
  definition_count: number;
  call_template_count: number;
  preset_count: number;
  has_presets: boolean;
  editable: boolean;
}

export type EventDraftMode = "new" | "edit_existing";
export type EventDraftStatus = "active" | "archived";
export type EventDraftHash = string | null;
export type EventEditorStep = "basic" | "trigger" | "graph" | "effects" | "review" | "domain";
export type EventDraftWorkingDefinition = Partial<EventDefinition> & Record<string, unknown>;
export type EventDraftWorkingCallTemplate = Partial<CallTemplate> & Record<string, unknown>;

export interface EventDraftSourceRef {
  definition_id: string;
  domain: string;
  definition_file_path: string;
  definition_json_path: string;
  call_template_file_path: string;
  call_template_ids: string[];
  call_template_json_paths?: string[];
  manifest_file_path: string;
}

export interface EventDraftTargetRef {
  domain: string;
  definition_id: string;
  definition_file_path: string;
  call_template_file_path: string;
}

export interface EventDraftEditorState {
  active_step: EventEditorStep;
  selection: unknown | null;
  collapsed_sections: string[];
  [key: string]: unknown;
}

export interface EventDraftHashes {
  source_definition_file: EventDraftHash;
  source_call_template_file: EventDraftHash;
  source_manifest: EventDraftHash;
  draft: EventDraftHash;
}

export interface EventDraftEnvelope {
  schema_version: "event-editor-draft-v1";
  draft_id: string;
  mode: EventDraftMode;
  status: EventDraftStatus;
  source: EventDraftSourceRef | null;
  target: EventDraftTargetRef;
  working_definition: EventDraftWorkingDefinition;
  working_call_templates: EventDraftWorkingCallTemplate[];
  editor_state: EventDraftEditorState;
  hashes: EventDraftHashes;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  published_files: string[];
}

export interface EventDraftSummary {
  draft_id: string;
  mode: EventDraftMode;
  status: EventDraftStatus;
  file_path: string;
  domain: string | null;
  definition_id: string | null;
  target: EventDraftTargetRef | null;
  source: EventDraftSourceRef | null;
  title: string | null;
  summary: string | null;
  active_step: string | null;
  created_at: string | null;
  updated_at: string | null;
  published_at: string | null;
  draft_hash: string;
}

export interface EventEditorIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  asset_type?: "draft" | "event_definition" | "call_template" | "manifest" | "domain";
  asset_id?: string;
  json_path?: string;
  editor_location?: {
    step: EventEditorStep;
    section?: string;
    node_id?: string;
    option_id?: string;
    effect_group_id?: string;
    effect_id?: string;
    call_template_id?: string;
    field_path?: string;
  };
}

export interface EventEditorLibraryResponse {
  definitions: EditorEventAsset<EventDefinition>[];
  call_templates: EditorEventAsset<CallTemplate>[];
  presets: EditorEventAsset<unknown>[];
  handlers: EditorEventAsset<unknown>[];
  schemas: Record<string, unknown>;
  domains: EventDomainSummary[];
  drafts: EventDraftSummary[];
}

export interface CreateDomainRequest {
  domain_id: string;
}

export interface CreateDomainResponse {
  created: boolean;
  domain: EventDomainSummary;
  written_files: string[];
  issues: EventEditorIssue[];
}

export type CreateDraftRequest =
  | {
      mode: "new";
      target_domain: string;
      definition_id: string;
      title?: string;
      summary?: string;
    }
  | {
      mode: "edit_existing";
      definition_id: string;
      domain: string;
    };

export interface CreateDraftResponse {
  draft: EventDraftEnvelope;
  file_path: string;
}

export interface SaveDraftRequest {
  draft: EventDraftEnvelope;
  expected_draft_hash?: string | null;
}

export interface SaveDraftResponse {
  saved: boolean;
  file_path: string;
  draft_hash: string;
  issues: EventEditorIssue[];
  draft: EventDraftEnvelope;
}

export interface ValidateDraftRequest {
  draft?: EventDraftEnvelope;
  level: "draft" | "publish";
}

export interface ValidateDraftResponse {
  valid: boolean;
  issues: EventEditorIssue[];
  generated?: {
    definition?: EventDefinition;
    call_templates?: CallTemplate[];
  };
}
