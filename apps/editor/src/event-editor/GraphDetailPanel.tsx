import type { CallNode, CallOption, Condition, EventDefinition, EventNode, Id, TargetRef } from "../../../pc-client/src/events/types";
import type { EventEditorLibraryResponse } from "./types";
import { findCallTemplate, formatEdgeMechanism, resolveEffectRefs, resolveLogTemplate, type DerivedEdge } from "./graphModel";

export type GraphSelection = { type: "trigger" } | { type: "node"; nodeId: Id } | { type: "edge"; edgeKey: string };

interface GraphDetailPanelProps {
  definition: EventDefinition;
  library: EventEditorLibraryResponse;
  edges: DerivedEdge[];
  selection: GraphSelection;
  onSelect: (selection: GraphSelection) => void;
}

export default function GraphDetailPanel({ definition, library, edges, selection, onSelect }: GraphDetailPanelProps) {
  if (selection.type === "edge") {
    const edge = edges.find((candidate) => candidate.key === selection.edgeKey);
    return edge ? <EdgeDetail definition={definition} library={library} edge={edge} onSelect={onSelect} /> : <TriggerDetail definition={definition} />;
  }

  if (selection.type === "node") {
    const node = definition.event_graph.nodes.find((candidate) => candidate.id === selection.nodeId);
    return node ? <NodeDetail definition={definition} library={library} node={node} edges={edges} onSelect={onSelect} /> : <TriggerDetail definition={definition} />;
  }

  return <TriggerDetail definition={definition} />;
}

export function TriggerSummary({ definition }: { definition: EventDefinition }) {
  const conditions = definition.trigger.conditions ?? [];
  const intendedCrewIds = definition.content_refs?.crew_ids ?? [];

  return (
    <section className="graph-trigger-summary" aria-label="Event trigger summary">
      <div className="graph-section-heading">
        <h4>Event Trigger</h4>
        <span className="status-tag status-muted">{definition.trigger.type}</span>
      </div>
      <dl className="inspector-summary">
        <div>
          <dt>Required Context</dt>
          <dd>{definition.trigger.required_context?.join(", ") || "None"}</dd>
        </div>
        <div>
          <dt>Conditions</dt>
          <dd>
            {conditions.length === 0 ? (
              "None"
            ) : (
              <ul className="trigger-condition-list">
                {conditions.map((c, i) => (
                  <li key={i}><code>{summarizeCondition(c)}</code></li>
                ))}
              </ul>
            )}
          </dd>
        </div>
        <div>
          <dt>Repeat Policy</dt>
          <dd>{summarizeRepeatPolicy(definition.repeat_policy)}</dd>
        </div>
        {intendedCrewIds.length > 0 ? (
          <div>
            <dt>Intended For</dt>
            <dd>{intendedCrewIds.join(", ")}</dd>
          </div>
        ) : null}
        <div>
          <dt>Samples</dt>
          <dd>{definition.sample_contexts.length}</dd>
        </div>
      </dl>
    </section>
  );
}

function summarizeCondition(c: Condition): string {
  switch (c.type) {
    case "has_tag":
      return `${formatTarget(c.target)}.${c.field ?? "?"} 包含 "${String(c.value ?? "")}"`;
    case "lacks_tag":
      return `${formatTarget(c.target)}.${c.field ?? "?"} 不包含 "${String(c.value ?? "")}"`;
    case "compare_field":
    case "attribute_check":
      return `${formatTarget(c.target)}.${c.field ?? "?"} ${c.op ?? "?"} ${JSON.stringify(c.value)}`;
    case "all_of":
    case "any_of":
      return `${c.type} (${c.conditions?.length ?? 0} 子条件)`;
    case "not":
      return `not (${c.conditions?.length ?? 0} 子条件)`;
    case "handler_condition":
      return `handler:${c.handler_type ?? "?"}`;
    default:
      return c.description ?? c.type;
  }
}

function formatTarget(t?: TargetRef | null): string {
  if (!t) return "(?)";
  if ((t.type === "crew_id" || t.type === "tile_id" || t.type === "objective_id") && t.id) {
    return `${t.type}:${t.id}`;
  }
  return t.type;
}

function summarizeRepeatPolicy(p: EventDefinition["repeat_policy"]): string {
  const scopeLabels: Record<EventDefinition["repeat_policy"]["scope"], string> = {
    world: "全局",
    crew: "每位队员",
    tile: "每个地块",
    crew_tile: "每位队员 × 地块",
    objective: "每个目标",
    event: "每个事件实例",
  };
  const parts: string[] = [scopeLabels[p.scope] ?? p.scope];
  if (p.max_trigger_count != null) parts.push(`最多 ${p.max_trigger_count} 次`);
  if (p.cooldown_seconds > 0) parts.push(`冷却 ${p.cooldown_seconds}s`);
  if (p.allow_while_active) parts.push("活跃中可重入");
  return parts.join(" · ");
}

function TriggerDetail({ definition }: { definition: EventDefinition }) {
  return (
    <section className="graph-detail-panel" aria-label="Graph detail panel">
      <div className="graph-section-heading">
        <h4>Trigger Detail</h4>
        <span className="status-tag status-muted">{definition.trigger.type}</span>
      </div>
      <JsonBlock label="Trigger Definition" value={definition.trigger} />
      {definition.sample_contexts.length > 0 ? <JsonBlock label="Sample Contexts" value={definition.sample_contexts} /> : <p className="muted-text">No sample contexts recorded.</p>}
    </section>
  );
}

function NodeDetail({
  definition,
  library,
  node,
  edges,
  onSelect,
}: {
  definition: EventDefinition;
  library: EventEditorLibraryResponse;
  node: EventNode;
  edges: DerivedEdge[];
  onSelect: (selection: GraphSelection) => void;
}) {
  const outgoingEdges = edges.filter((edge) => edge.fromNodeId === node.id);
  const isEntry = definition.event_graph.entry_node_id === node.id;
  const isTerminal = definition.event_graph.terminal_node_ids.includes(node.id);

  return (
    <section className="graph-detail-panel" aria-label="Graph detail panel">
      <div className="graph-section-heading">
        <h4>Node Detail</h4>
        <div className="graph-heading-tags">
          <span className="status-tag status-muted">{node.type}</span>
          {isEntry ? <span className="status-tag status-success">ENTRY</span> : null}
          {isTerminal ? <span className="status-tag status-warning">END</span> : null}
        </div>
      </div>

      <div className="graph-node-title">
        <code>{node.id}</code>
        <strong>{node.title}</strong>
      </div>
      {node.description ? <p>{node.description}</p> : null}

      <NodeSpecificDetail definition={definition} library={library} node={node} />
      <CommonNodeDetail definition={definition} node={node} />

      <h5>What happens next</h5>
      {outgoingEdges.length > 0 ? (
        <ul className="inspector-list" aria-label="Outgoing graph transitions">
          {outgoingEdges.map((edge) => (
            <li key={edge.key} className="inspector-card">
              <button type="button" className="graph-select-row" onClick={() => onSelect({ type: "edge", edgeKey: edge.key })}>
                <span>{formatEdgeMechanism(edge.mechanism)}</span>
                <code>{edge.toNodeId}</code>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted-text">No outgoing transitions.</p>
      )}
    </section>
  );
}

function EdgeDetail({
  definition,
  library,
  edge,
  onSelect,
}: {
  definition: EventDefinition;
  library: EventEditorLibraryResponse;
  edge: DerivedEdge;
  onSelect: (selection: GraphSelection) => void;
}) {
  const fromNode = definition.event_graph.nodes.find((node) => node.id === edge.fromNodeId);
  const toNode = definition.event_graph.nodes.find((node) => node.id === edge.toNodeId);
  const optionText = edge.mechanism.kind === "option" && fromNode?.type === "call" ? getOptionText(library, definition, fromNode, edge.mechanism.optionId) : null;
  const effects = resolveEffectRefs(definition, edge.effectRefs);

  return (
    <section className="graph-detail-panel" aria-label="Graph detail panel">
      <div className="graph-section-heading">
        <h4>Transition Detail</h4>
        <span className="status-tag status-muted">{formatEdgeMechanism(edge.mechanism)}</span>
      </div>
      <dl className="graph-detail-list">
        <div>
          <dt>From</dt>
          <dd>
            <code>{edge.fromNodeId}</code> {fromNode?.title ?? ""}
          </dd>
        </div>
        <div>
          <dt>To</dt>
          <dd>
            <code>{edge.toNodeId}</code> {toNode?.title ?? ""}
          </dd>
        </div>
        {optionText ? (
          <div>
            <dt>Option Text</dt>
            <dd>{optionText}</dd>
          </div>
        ) : null}
      </dl>
      <EffectList title="Transition Effects" effects={effects} />
      {toNode ? (
        <button type="button" className="graph-select-row graph-detail-action" onClick={() => onSelect({ type: "node", nodeId: toNode.id })}>
          <span>View target node</span>
          <code>{toNode.id}</code>
        </button>
      ) : null}
    </section>
  );
}

function NodeSpecificDetail({ definition, library, node }: { definition: EventDefinition; library: EventEditorLibraryResponse; node: EventNode }) {
  switch (node.type) {
    case "call":
      return <CallNodeDetail definition={definition} library={library} node={node} />;
    case "check":
      return <JsonBlock label="Check Branches" value={{ branches: node.branches, default_next_node_id: node.default_next_node_id }} />;
    case "random":
      return <JsonBlock label="Random Branches" value={{ branches: node.branches, default_next_node_id: node.default_next_node_id, seed_scope: node.seed_scope }} />;
    case "action_request":
      return <JsonBlock label="Action Request" value={{ action_type: node.action_type, action_params: node.action_params, completion_trigger: node.completion_trigger, on_accepted_node_id: node.on_accepted_node_id, on_completed_node_id: node.on_completed_node_id, on_failed_node_id: node.on_failed_node_id }} />;
    case "objective":
      return <JsonBlock label="Objective" value={{ mode: node.mode, objective_template: node.objective_template, on_created_node_id: node.on_created_node_id, on_completed_node_id: node.on_completed_node_id, on_failed_node_id: node.on_failed_node_id }} />;
    case "spawn_event":
      return <JsonBlock label="Spawn Event" value={{ event_definition_id: node.event_definition_id, spawn_policy: node.spawn_policy, context_mapping: node.context_mapping, next_node_id: node.next_node_id }} />;
    case "log_only":
      return <LogOnlyDetail definition={definition} node={node} />;
    case "end":
      return <JsonBlock label="Resolution" value={{ resolution: node.resolution, result_key: node.result_key, cleanup_policy: node.cleanup_policy }} />;
    case "wait":
      return <JsonBlock label="Wait" value={{ duration_seconds: node.duration_seconds, wake_trigger_type: node.wake_trigger_type, next_node_id: node.next_node_id, on_interrupted: node.on_interrupted }} />;
  }
}

function CallNodeDetail({ definition, library, node }: { definition: EventDefinition; library: EventEditorLibraryResponse; node: CallNode }) {
  return (
    <>
      <dl className="graph-detail-list">
        <div>
          <dt>Template</dt>
          <dd>
            <code>{node.call_template_id}</code>
          </dd>
        </div>
        <div>
          <dt>Delivery</dt>
          <dd>{node.delivery}</dd>
        </div>
        <div>
          <dt>Urgency</dt>
          <dd>{node.urgency}</dd>
        </div>
        <div>
          <dt>Expires</dt>
          <dd>{node.expires_in_seconds ?? "None"}</dd>
        </div>
      </dl>
      <h5>Options</h5>
      <ul className="inspector-list" aria-label="Call node options">
        {node.options.map((option) => (
          <li key={option.id} className="inspector-card">
            <div className="inspector-card-heading">
              <code>{option.id}</code>
              {option.is_default ? <span className="status-tag status-success">DEFAULT</span> : null}
              <span className="status-tag status-muted">to {node.option_node_mapping[option.id] ?? "unmapped"}</span>
            </div>
            <p>{getOptionText(library, definition, node, option.id) ?? "No option text found."}</p>
            <OptionEffects definition={definition} option={option} />
          </li>
        ))}
      </ul>
    </>
  );
}

function LogOnlyDetail({ definition, node }: { definition: EventDefinition; node: Extract<EventNode, { type: "log_only" }> }) {
  const template = resolveLogTemplate(definition, node.event_log_template_id);
  return (
    <dl className="graph-detail-list">
      <div>
        <dt>Log Template</dt>
        <dd>{template ? `${template.id}: ${template.summary}` : node.event_log_template_id}</dd>
      </div>
      <div>
        <dt>Next Node</dt>
        <dd>
          <code>{node.next_node_id}</code>
        </dd>
      </div>
    </dl>
  );
}

function CommonNodeDetail({ definition, node }: { definition: EventDefinition; node: EventNode }) {
  const enterEffects = resolveEffectRefs(definition, node.enter_effect_refs ?? []);
  const exitEffects = resolveEffectRefs(definition, node.exit_effect_refs ?? []);
  const inlineEffects = node.inline_effects ?? [];
  const logTemplate = "event_log_template_id" in node ? resolveLogTemplate(definition, node.event_log_template_id) : null;

  return (
    <>
      {node.requirements && node.requirements.length > 0 ? <JsonBlock label="Requirements" value={node.requirements} /> : null}
      {logTemplate ? <JsonBlock label="Event Log Template" value={logTemplate} /> : null}
      {node.history_writes && node.history_writes.length > 0 ? <JsonBlock label="History Writes" value={node.history_writes} /> : null}
      <JsonBlock label="Blocking" value={node.blocking} />
      {node.timeout ? <JsonBlock label="Timeout" value={node.timeout} /> : null}
      {node.auto_next_node_id ? <JsonBlock label="Auto Next" value={{ auto_next_node_id: node.auto_next_node_id }} /> : null}
      <EffectList title="Enter Effects" effects={enterEffects} />
      <EffectList title="Exit Effects" effects={exitEffects} />
      <EffectList title="Inline Effects" effects={inlineEffects} />
    </>
  );
}

function OptionEffects({ definition, option }: { definition: EventDefinition; option: CallOption }) {
  const effects = resolveEffectRefs(definition, option.effect_refs ?? []);
  return <EffectList title="Option Effects" effects={effects} />;
}

function EffectList({ title, effects }: { title: string; effects: readonly unknown[] }) {
  if (effects.length === 0) {
    return null;
  }

  return <JsonBlock label={title} value={effects} />;
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <section className="graph-json-block">
      <h5>{label}</h5>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </section>
  );
}

function getOptionText(library: EventEditorLibraryResponse, definition: EventDefinition, node: CallNode, optionId: Id): string | null {
  const template = findCallTemplate(library, definition.id, node.id);
  const variants = template?.option_lines[optionId]?.variants ?? [];
  const text = variants[0]?.text;
  if (!text) {
    return null;
  }

  return renderTemplateText(text, definition.sample_contexts[0]?.payload ?? {});
}

function renderTemplateText(text: string, payload: Record<string, unknown>): string {
  const previewState = isRecord(payload.preview_state) ? payload.preview_state : {};
  const crew = isRecord(previewState.crew) ? previewState.crew : {};
  const firstCrew = Object.values(crew).find(isRecord);
  const values: Record<string, unknown> = {
    crew_display_name: firstCrew?.display_name,
  };

  return text.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined || value === null ? match : String(value);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
