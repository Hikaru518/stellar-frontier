import type { CallTemplate, EventDefinition, HandlerDefinition, PresetDefinition } from "../../../pc-client/src/events/types";

export interface EventManifestDomain {
  id: string;
  definitions: string;
  call_templates: string;
  presets?: string | null;
}

export interface EventManifest {
  schema_version: "event-manifest.v1";
  domains: EventManifestDomain[];
}

export type EditorEventAssetType = "event_definition" | "call_template" | "handler" | "preset" | "legacy_event";

export interface EditorEventAsset<T> {
  id: string;
  domain: string;
  asset_type: EditorEventAssetType;
  file_path: string;
  json_path: string;
  base_hash: string;
  data: T;
  editable: boolean;
}

export interface ValidationIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  file_path?: string;
  asset_type?: "event_definition" | "call_template" | "handler" | "preset" | "legacy_event" | "manifest";
  asset_id?: string;
  json_path?: string;
}

export interface ValidationReport {
  passed: boolean;
  issues: ValidationIssue[];
  command?: string;
}

export interface EventEditorDraftRequest {
  asset_type: "event_definition" | "call_template";
  asset_id: string;
  file_path: string;
  json_path: string;
  base_hash: string;
  draft: unknown;
  change_summary?: string;
}

export type EventEditorSaveRequest = EventEditorDraftRequest;

export interface EventEditorValidateDraftResponse {
  status: "validated";
  file_path: string;
  asset_type: EventEditorDraftRequest["asset_type"];
  asset_id: string;
  validation: ValidationReport;
}

export interface EventEditorSaveResponse {
  status: "saved";
  file_path: string;
  asset_type: EventEditorDraftRequest["asset_type"];
  asset_id: string;
  base_hash: string;
  validation: ValidationReport;
}

export interface EventEditorLibraryResponse {
  manifest: EventManifest;
  domains: string[];
  definitions: EditorEventAsset<EventDefinition>[];
  call_templates: EditorEventAsset<CallTemplate>[];
  handlers: HandlerDefinition[];
  presets: EditorEventAsset<PresetDefinition>[];
  legacy_events: EditorEventAsset<unknown>[];
  schemas: Record<string, unknown>;
  validation: ValidationReport;
}
