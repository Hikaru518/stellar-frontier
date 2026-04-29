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

export interface EventEditorLibraryResponse {
  definitions: EditorEventAsset<EventDefinition>[];
  call_templates: EditorEventAsset<CallTemplate>[];
  presets: EditorEventAsset<unknown>[];
  handlers: EditorEventAsset<unknown>[];
  schemas: Record<string, unknown>;
}
