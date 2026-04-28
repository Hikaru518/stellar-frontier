import { renderRuntimeCall, type CallRendererError, type CallRendererGameState } from "../../../apps/pc-client/src/events/callRenderer";
import type {
  CallNode,
  CallTemplate,
  EventDefinition,
  RenderedLine,
  RuntimeCallOption,
  RuntimeEvent,
  TriggerContext,
} from "../../../apps/pc-client/src/events/types";
import type { EditorEventAsset, EventEditorLibraryResponse } from "./types";

export type EventEditorPreviewStatus = "rendered" | "missing_context" | "unavailable" | "error";

export interface EventEditorPreviewResult {
  status: EventEditorPreviewStatus;
  reason?: string;
  definitionId?: string;
  nodeId?: string;
  templateId?: string;
  lines: RenderedLine[];
  options: RuntimeCallOption[];
  missingContext: string[];
  errors: CallRendererError[];
}

interface RenderEventEditorPreviewInput {
  asset: EditorEventAsset<unknown>;
  draft: unknown;
  library: EventEditorLibraryResponse;
  previewState?: CallRendererGameState;
}

interface PreviewTarget {
  definition: EventDefinition;
  node: CallNode;
  template: CallTemplate;
}

export function renderEventEditorPreview(input: RenderEventEditorPreviewInput): EventEditorPreviewResult {
  const target = resolvePreviewTarget(input);
  if (!target) {
    return emptyPreview("unavailable", "Current asset does not resolve to a call node and call template.");
  }

  const sampleContext = target.definition.sample_contexts?.[0] ?? buildFallbackTriggerContext(target.definition);
  const initialMissingContext = target.definition.sample_contexts?.[0] ? [] : ["sample_contexts[0]"];
  const state = buildPreviewState(input.previewState ?? readPreviewState(sampleContext), sampleContext);
  const event = buildRuntimeEvent(target.definition, target.node, sampleContext);

  try {
    const rendered = renderRuntimeCall({
      state,
      event,
      node: target.node,
      template: target.template,
      trigger_context: sampleContext,
    });
    const missingContext = [
      ...initialMissingContext,
      ...target.template.render_context_fields.filter((field) => {
        const value = rendered.call.render_context_snapshot[field];
        return value === null || value === undefined;
      }),
    ];

    return {
      status: rendered.errors.length > 0 ? "error" : missingContext.length > 0 ? "missing_context" : "rendered",
      definitionId: target.definition.id,
      nodeId: target.node.id,
      templateId: target.template.id,
      lines: rendered.call.rendered_lines,
      options: rendered.call.available_options,
      missingContext,
      errors: rendered.errors,
    };
  } catch (error) {
    return {
      ...emptyPreview("error", error instanceof Error ? error.message : "Preview rendering failed."),
      definitionId: target.definition.id,
      nodeId: target.node.id,
      templateId: target.template.id,
    };
  }
}

function resolvePreviewTarget(input: RenderEventEditorPreviewInput): PreviewTarget | null {
  const draft = input.draft;

  if (input.asset.asset_type === "event_definition" && isEventDefinition(draft)) {
    const node = draft.event_graph.nodes.find(isCallNode);
    if (!node) {
      return null;
    }

    const template = input.library.call_templates
      .map((asset) => asset.data)
      .find(
        (candidate): candidate is CallTemplate =>
          isCallTemplate(candidate) &&
          candidate.event_definition_id === draft.id &&
          (candidate.node_id === node.id || candidate.id === node.call_template_id),
      );

    return template ? { definition: draft, node, template } : null;
  }

  if (input.asset.asset_type === "call_template" && isCallTemplate(draft)) {
    const definition = input.library.definitions.map((asset) => asset.data).find((candidate) => isEventDefinition(candidate) && candidate.id === draft.event_definition_id);
    const node = definition?.event_graph.nodes.find((candidate): candidate is CallNode => isCallNode(candidate) && candidate.id === draft.node_id);
    return definition && node ? { definition, node, template: draft } : null;
  }

  return null;
}

function buildRuntimeEvent(definition: EventDefinition, node: CallNode, sampleContext: TriggerContext): RuntimeEvent {
  const occurredAt = sampleContext.occurred_at ?? 0;

  return {
    id: `${definition.id}:preview`,
    event_definition_id: definition.id,
    event_definition_version: definition.version,
    status: "waiting_call",
    current_node_id: node.id,
    primary_crew_id: sampleContext.crew_id ?? null,
    related_crew_ids: sampleContext.crew_id ? [sampleContext.crew_id] : [],
    primary_tile_id: sampleContext.tile_id ?? null,
    related_tile_ids: sampleContext.tile_id ? [sampleContext.tile_id] : [],
    child_event_ids: [],
    objective_ids: [],
    selected_options: {},
    random_results: {},
    blocking_claim_ids: [],
    created_at: occurredAt,
    updated_at: occurredAt,
    trigger_context_snapshot: sampleContext,
    history_keys: [],
  };
}

function buildPreviewState(state: CallRendererGameState | undefined, sampleContext: TriggerContext): CallRendererGameState {
  return {
    ...(state ?? {}),
    elapsed_game_seconds: state?.elapsed_game_seconds ?? state?.elapsedGameSeconds ?? sampleContext.occurred_at ?? 0,
  };
}

function readPreviewState(sampleContext: TriggerContext): CallRendererGameState | undefined {
  const previewState = sampleContext.payload?.preview_state;
  return isRecord(previewState) ? (previewState as CallRendererGameState) : undefined;
}

function buildFallbackTriggerContext(definition: EventDefinition): TriggerContext {
  return {
    trigger_type: definition.trigger.type,
    occurred_at: 0,
    source: "event_node",
    event_definition_id: definition.id,
  };
}

function emptyPreview(status: EventEditorPreviewStatus, reason: string): EventEditorPreviewResult {
  return {
    status,
    reason,
    lines: [],
    options: [],
    missingContext: [],
    errors: [],
  };
}

function isEventDefinition(value: unknown): value is EventDefinition {
  return isRecord(value) && typeof value.id === "string" && isRecord(value.event_graph) && Array.isArray(value.event_graph.nodes);
}

function isCallTemplate(value: unknown): value is CallTemplate {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.event_definition_id === "string" &&
    typeof value.node_id === "string" &&
    Array.isArray(value.render_context_fields) &&
    isRecord(value.opening_lines) &&
    isRecord(value.option_lines)
  );
}

function isCallNode(value: unknown): value is CallNode {
  return isRecord(value) && value.type === "call" && typeof value.id === "string" && typeof value.call_template_id === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
