import { useEffect, useMemo, useState } from "react";
import type { EventDraftEnvelope } from "../types";
import { formatJsonPathForDisplay, isJsonPathWithin, normalizeJsonPathToPointer } from "./jsonPath";

interface StructuredJsonViewerProps {
  draft: EventDraftEnvelope;
  focusPath?: string | null;
}

interface JsonSection {
  id: string;
  label: string;
  path: string;
  value: unknown;
  summary: string;
  defaultCollapsed: boolean;
}

export default function StructuredJsonViewer({ draft, focusPath = null }: StructuredJsonViewerProps) {
  const sections = useMemo(() => buildJsonSections(draft), [draft]);
  const [query, setQuery] = useState("");
  const [openSectionIds, setOpenSectionIds] = useState<Set<string>>(() => {
    return new Set(sections.filter((section) => !section.defaultCollapsed).map((section) => section.id));
  });
  const normalizedFocusPath = normalizeJsonPathToPointer(focusPath);
  const focusedSectionId = getFocusedSectionId(sections, normalizedFocusPath);

  useEffect(() => {
    const focusedSection = sections.find((section) => section.id === focusedSectionId);
    if (!focusedSection) {
      return;
    }

    setOpenSectionIds((current) => new Set([...current, focusedSection.id]));
  }, [focusedSectionId, sections]);

  const normalizedQuery = query.trim().toLowerCase();

  return (
    <section className="structured-json-viewer" aria-label="Structured raw JSON viewer">
      <div className="event-authoring-section-heading">
        <div>
          <h3>Raw JSON Viewer</h3>
          <p className="muted-text">Read-only structured view of the draft, generated definition, and call templates.</p>
        </div>
        <span className="status-tag status-muted">read only</span>
      </div>

      <label className="structured-json-search">
        Search raw JSON
        <input
          aria-label="Search raw JSON"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="id, node, path, effect..."
        />
      </label>

      <div className="structured-json-section-list">
        {sections.map((section) => {
          const matchesSearch = normalizedQuery.length > 0 && sectionMatchesQuery(section, normalizedQuery);
          const isFocused = section.id === focusedSectionId;
          const isOpen = openSectionIds.has(section.id) || matchesSearch || isFocused;

          return (
            <section key={section.id} className="structured-json-section" aria-labelledby={`${section.id}-heading`}>
              <div className="structured-json-section-header">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={`${section.id}-content`}
                  onClick={() => toggleSection(section.id)}
                >
                  <span aria-hidden="true">{isOpen ? "v" : ">"}</span>
                  <strong id={`${section.id}-heading`}>{section.label}</strong>
                </button>
                <span className="status-tag status-muted">{section.summary}</span>
                {matchesSearch ? <span className="status-tag status-warning">match</span> : null}
                {isFocused ? <span className="status-tag status-success">focused path</span> : null}
                <CopyPathButton path={section.path || "/"} />
              </div>
              {isOpen ? (
                <div id={`${section.id}-content`} className="structured-json-section-content">
                  <JsonTree value={section.value} path={section.path} label={section.label} focusPath={normalizedFocusPath} query={normalizedQuery} />
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </section>
  );

  function toggleSection(sectionId: string): void {
    setOpenSectionIds((current) => {
      const next = new Set(current);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }
}

function JsonTree({
  value,
  path,
  label,
  focusPath,
  query,
}: {
  value: unknown;
  path: string;
  label: string;
  focusPath: string;
  query: string;
}) {
  return (
    <ul className="structured-json-tree" aria-label={`${label} JSON tree`}>
      <JsonNode value={value} path={path} label={label} focusPath={focusPath} query={query} />
    </ul>
  );
}

function JsonNode({
  value,
  path,
  label,
  focusPath,
  query,
}: {
  value: unknown;
  path: string;
  label: string;
  focusPath: string;
  query: string;
}) {
  const normalizedPath = normalizeJsonPathToPointer(path);
  const isFocused = Boolean(focusPath) && normalizedPath === focusPath;
  const isMatch = query.length > 0 && nodeMatchesQuery(label, path, value, query);
  const children = getJsonChildren(value, path);

  return (
    <li className="structured-json-node">
      <div className="structured-json-row" data-focused={isFocused ? "true" : undefined} data-search-match={isMatch ? "true" : undefined}>
        <code>{formatJsonPathForDisplay(path || "/")}</code>
        <strong>{label}</strong>
        <span>{formatJsonValueSummary(value)}</span>
        {isFocused ? <span className="status-tag status-success">focused</span> : null}
        {isMatch ? <span className="status-tag status-warning">match</span> : null}
        <CopyPathButton path={path || "/"} />
      </div>
      {children.length > 0 ? (
        <ul>
          {children.map((child) => (
            <JsonNode
              key={child.path}
              value={child.value}
              path={child.path}
              label={child.label}
              focusPath={focusPath}
              query={query}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function CopyPathButton({ path }: { path: string }) {
  return (
    <button type="button" className="structured-json-copy" aria-label={`Copy path ${path}`} onClick={() => copyPath(path)}>
      Copy path
    </button>
  );
}

function buildJsonSections(draft: EventDraftEnvelope): JsonSection[] {
  const definition = draft.working_definition;
  const graph = definition.event_graph;
  const envelope = {
    schema_version: draft.schema_version,
    draft_id: draft.draft_id,
    mode: draft.mode,
    status: draft.status,
    source: draft.source,
    target: draft.target,
    editor_state: draft.editor_state,
    hashes: draft.hashes,
    created_at: draft.created_at,
    updated_at: draft.updated_at,
    published_at: draft.published_at,
    published_files: draft.published_files,
  };

  return [
    {
      id: "raw-draft-envelope",
      label: "Draft Envelope",
      path: "",
      value: envelope,
      summary: `${Object.keys(envelope).length} fields`,
      defaultCollapsed: false,
    },
    {
      id: "raw-event-definition",
      label: "Event Definition",
      path: "/working_definition",
      value: definition,
      summary: `${Object.keys(definition).length} fields`,
      defaultCollapsed: true,
    },
    {
      id: "raw-trigger",
      label: "Trigger",
      path: "/working_definition/trigger",
      value: definition.trigger ?? null,
      summary: definition.trigger && typeof definition.trigger === "object" ? "configured" : "missing",
      defaultCollapsed: false,
    },
    {
      id: "raw-graph-nodes",
      label: "Graph Nodes",
      path: "/working_definition/event_graph/nodes",
      value: graph && typeof graph === "object" && "nodes" in graph ? graph.nodes : [],
      summary: `${Array.isArray(graph?.nodes) ? graph.nodes.length : 0} nodes`,
      defaultCollapsed: true,
    },
    {
      id: "raw-effect-groups",
      label: "Effect Groups",
      path: "/working_definition/effect_groups",
      value: definition.effect_groups ?? [],
      summary: `${Array.isArray(definition.effect_groups) ? definition.effect_groups.length : 0} groups`,
      defaultCollapsed: true,
    },
    {
      id: "raw-log-templates",
      label: "Log Templates",
      path: "/working_definition/log_templates",
      value: definition.log_templates ?? [],
      summary: `${Array.isArray(definition.log_templates) ? definition.log_templates.length : 0} templates`,
      defaultCollapsed: true,
    },
    {
      id: "raw-call-templates",
      label: "Call Templates",
      path: "/working_call_templates",
      value: draft.working_call_templates,
      summary: `${draft.working_call_templates.length} templates`,
      defaultCollapsed: true,
    },
  ];
}

function getJsonChildren(value: unknown, parentPath: string): { label: string; path: string; value: unknown }[] {
  if (Array.isArray(value)) {
    return value.map((item, index) => ({
      label: String(index),
      path: `${parentPath}/${index}`,
      value: item,
    }));
  }

  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value).map(([key, childValue]) => ({
    label: key,
    path: parentPath ? `${parentPath}/${escapePathSegment(key)}` : `/${escapePathSegment(key)}`,
    value: childValue,
  }));
}

function sectionMatchesQuery(section: JsonSection, query: string): boolean {
  const serializedValue = JSON.stringify(section.value) ?? "";
  return (
    section.label.toLowerCase().includes(query) ||
    section.path.toLowerCase().includes(query) ||
    serializedValue.toLowerCase().includes(query)
  );
}

function getFocusedSectionId(sections: readonly JsonSection[], normalizedFocusPath: string): string | null {
  if (!normalizedFocusPath) {
    return null;
  }

  return (
    sections
      .filter((section) => section.path && isJsonPathWithin(normalizedFocusPath, section.path))
      .sort((left, right) => normalizeJsonPathToPointer(right.path).length - normalizeJsonPathToPointer(left.path).length)[0]?.id ??
    null
  );
}

function nodeMatchesQuery(label: string, path: string, value: unknown, query: string): boolean {
  return (
    label.toLowerCase().includes(query) ||
    path.toLowerCase().includes(query) ||
    (isPrimitive(value) && String(value).toLowerCase().includes(query))
  );
}

function formatJsonValueSummary(value: unknown): string {
  if (Array.isArray(value)) {
    return `array(${value.length})`;
  }
  if (isRecord(value)) {
    return `object(${Object.keys(value).length})`;
  }
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  return String(value);
}

function escapePathSegment(segment: string): string {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPrimitive(value: unknown): boolean {
  return value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function copyPath(path: string): void {
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    return;
  }

  void Promise.resolve(navigator.clipboard.writeText(path)).catch(() => {
    // Clipboard permission is browser-focus dependent; path remains visible for manual copy.
  });
}
