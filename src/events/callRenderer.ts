import { evaluateConditions, type ConditionGameState } from "./conditions";
import type {
  CallNode,
  CallOption,
  CallTemplate,
  GameSeconds,
  Id,
  JsonObject,
  RenderedLine,
  RuntimeCall,
  RuntimeCallOption,
  RuntimeEvent,
  TextVariant,
  TextVariantGroup,
  TriggerContext,
} from "./types";

export interface CallRendererGameState extends ConditionGameState {
  elapsed_game_seconds?: number;
  elapsedGameSeconds?: number;
}

export type CallRendererErrorCode = "missing_variant" | "missing_option_template";

export interface CallRendererError {
  code: CallRendererErrorCode;
  path: string;
  message: string;
}

export interface RenderRuntimeCallInput {
  state: CallRendererGameState;
  event: RuntimeEvent;
  node: CallNode;
  template: CallTemplate;
  trigger_context: TriggerContext;
}

export interface RenderRuntimeCallResult {
  call: RuntimeCall;
  errors: CallRendererError[];
}

export function renderRuntimeCall(input: RenderRuntimeCallInput): RenderRuntimeCallResult {
  const crewId = resolveSpeakerCrewId(input);
  const occurredAt = now(input.trigger_context, input.state);
  const renderContextSnapshot = buildRenderContextSnapshot(input, crewId);
  const context = {
    state: stateWithEvent(input.state, input.event),
    trigger_context: runtimeTriggerContext(input.trigger_context, input.event, input.node.id, crewId),
    active_event_id: input.event.id,
  };
  const errors: CallRendererError[] = [];
  const renderedLines = renderLineGroups(
    [input.template.opening_lines, ...(input.template.body_lines ?? [])],
    context,
    renderContextSnapshot,
    crewId,
    errors,
  );
  const availableOptions = renderOptions(input.node.options, input.template, context, renderContextSnapshot, errors);

  return {
    call: {
      id: input.event.active_call_id ?? `${input.event.id}:${input.node.id}:call`,
      event_id: input.event.id,
      event_node_id: input.node.id,
      call_template_id: input.template.id,
      crew_id: crewId,
      status: "awaiting_choice",
      created_at: occurredAt,
      connected_at: null,
      ended_at: null,
      expires_at: typeof input.node.expires_in_seconds === "number" ? occurredAt + input.node.expires_in_seconds : null,
      render_context_snapshot: renderContextSnapshot,
      rendered_lines: renderedLines,
      available_options: availableOptions,
      selected_option_id: null,
      blocking_claim_id: input.node.blocking.occupies_communication ? `${input.event.id}:${input.node.id}:communication` : null,
    },
    errors,
  };
}

function renderLineGroups(
  groups: TextVariantGroup[],
  context: Parameters<typeof evaluateConditions>[1],
  renderContextSnapshot: JsonObject,
  speakerCrewId: Id,
  errors: CallRendererError[],
): RenderedLine[] {
  return groups.flatMap((group, groupIndex) =>
    selectVariants(group, context, `line_groups[${groupIndex}]`, errors).map((variant) => ({
      template_variant_id: variant.id,
      text: renderText(variant.text, renderContextSnapshot),
      speaker_crew_id: speakerCrewId,
    })),
  );
}

function renderOptions(
  options: CallOption[],
  template: CallTemplate,
  context: Parameters<typeof evaluateConditions>[1],
  renderContextSnapshot: JsonObject,
  errors: CallRendererError[],
): RuntimeCallOption[] {
  const renderedOptions: RuntimeCallOption[] = [];

  for (const option of options) {
    if (!conditionsPass(option.requirements ?? [], context, `options.${option.id}.requirements`)) {
      continue;
    }

    const group = template.option_lines[option.id];
    if (!group) {
      errors.push({
        code: "missing_option_template",
        path: `option_lines.${option.id}`,
        message: `Call template ${template.id} is missing option text for ${option.id}.`,
      });
      continue;
    }

    const [variant] = selectVariants(group, context, `option_lines.${option.id}`, errors);
    if (!variant) {
      continue;
    }

    renderedOptions.push({
      option_id: option.id,
      template_variant_id: variant.id,
      text: renderText(variant.text, renderContextSnapshot),
      is_default: option.is_default ?? false,
    });
  }

  return renderedOptions;
}

function selectVariants(
  group: TextVariantGroup,
  context: Parameters<typeof evaluateConditions>[1],
  path: string,
  errors: CallRendererError[],
): TextVariant[] {
  const eligible = group.variants.filter((variant) => conditionsPass(variant.when ?? [], context, `${path}.variants.${variant.id}.when`));
  const fallback = group.variants.find((variant) => variant.id === "default" || variant.id.endsWith("_default"));
  const candidates = eligible.length > 0 ? eligible : fallback ? [fallback] : [];

  if (candidates.length === 0) {
    errors.push({
      code: "missing_variant",
      path,
      message: `No text variant matched ${path}.`,
    });
    return [];
  }

  const maxLines = group.max_lines ?? 1;
  if (group.selection === "first_match") {
    return candidates.slice(0, maxLines);
  }

  return [...candidates]
    .sort((left, right) => right.priority - left.priority || variantWeight(right) - variantWeight(left) || left.id.localeCompare(right.id))
    .slice(0, maxLines);
}

function conditionsPass(
  conditions: NonNullable<TextVariant["when"]>,
  context: Parameters<typeof evaluateConditions>[1],
  path: string,
): boolean {
  const result = evaluateConditions(conditions, context, path);
  return result.passed && result.errors.length === 0;
}

function buildRenderContextSnapshot(input: RenderRuntimeCallInput, crewId: Id): JsonObject {
  const crew = readCrew(input.state, crewId);
  const fieldValues: Record<string, unknown> = {
    crew_id: crewId,
    crew_display_name: readPath(crew, "display_name") ?? readPath(crew, "displayName"),
    crew_voice_type: readPath(crew, "crew_voice_type") ?? readPath(crew, "voice_type"),
    personality_tags: readPath(crew, "personality_tags") ?? [],
    expertise_tags: readPath(crew, "expertise_tags") ?? [],
    crew_conditions: readPath(crew, "condition_tags") ?? [],
    event_pressure: input.node.urgency,
    previous_choices: input.event.selected_options,
    event_id: input.event.id,
    event_definition_id: input.event.event_definition_id,
    node_id: input.node.id,
    tile_id: input.event.primary_tile_id ?? input.trigger_context.tile_id ?? null,
  };

  return Object.fromEntries(input.template.render_context_fields.map((field) => [field, fieldValues[field] ?? null]));
}

function renderText(text: string, renderContextSnapshot: JsonObject): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key: string) => {
    const value = renderContextSnapshot[key];
    if (value === null || value === undefined) {
      return "";
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    return JSON.stringify(value);
  });
}

function resolveSpeakerCrewId(input: RenderRuntimeCallInput): Id {
  const ref = input.node.speaker_crew_ref;
  if (ref.type === "crew_id" && (ref.id || ref.ref)) {
    return ref.id ?? ref.ref ?? "unknown_crew";
  }
  if (ref.type === "related_crew" && input.event.related_crew_ids[0]) {
    return input.event.related_crew_ids[0];
  }
  return input.event.primary_crew_id ?? input.trigger_context.crew_id ?? "unknown_crew";
}

function readCrew(state: CallRendererGameState, crewId: Id): unknown {
  const crew = state.crew;
  if (Array.isArray(crew)) {
    return crew.find((item) => readPath(item, "id") === crewId || readPath(item, "crewId") === crewId);
  }
  return crew?.[crewId];
}

function readPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!isRecord(current)) {
      return undefined;
    }
    return current[segment];
  }, value);
}

function runtimeTriggerContext(triggerContext: TriggerContext, event: RuntimeEvent, nodeId: Id, crewId: Id): TriggerContext {
  return {
    ...triggerContext,
    event_id: event.id,
    event_definition_id: event.event_definition_id,
    node_id: nodeId,
    crew_id: crewId,
  };
}

function stateWithEvent(state: CallRendererGameState, event: RuntimeEvent): CallRendererGameState {
  return {
    ...state,
    active_events: {
      ...state.active_events,
      [event.id]: event,
    },
  };
}

function now(triggerContext: TriggerContext, state: CallRendererGameState): GameSeconds {
  return triggerContext.occurred_at ?? state.elapsed_game_seconds ?? state.elapsedGameSeconds ?? 0;
}

function variantWeight(variant: TextVariant): number {
  return variant.weight ?? 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
