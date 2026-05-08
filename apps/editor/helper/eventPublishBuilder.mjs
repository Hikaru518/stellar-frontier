export const EVENT_PROGRAM_SCHEMA_VERSION = "event-program-model-v1";

const READY_FOR_TEST_STATUS = "ready_for_test";
const NORMALIZED_GRAPH_RULES = {
  acyclic: true,
  max_active_nodes: 1,
  allow_parallel_nodes: false,
};

export function buildEventPublishContent(draft) {
  const issues = validateDraftTarget(draft);
  if (hasBlockingIssues(issues)) {
    return {
      valid: false,
      issues,
    };
  }

  const target = draft.target;
  const definitionId = target.definition_id;
  const domain = target.domain;
  const definition = buildFormalDefinition({ draft, definitionId, domain, issues });
  const callTemplates = buildFormalCallTemplates({ draft, definition, definitionId, domain, issues });

  definition.content_refs = buildContentRefs(definition.content_refs, callTemplates);

  return {
    valid: !hasBlockingIssues(issues),
    issues,
    generated: {
      definition,
      call_templates: callTemplates,
    },
  };
}

function validateDraftTarget(draft) {
  const issues = [];

  if (!isRecord(draft)) {
    issues.push(
      createIssue({
        code: "invalid_draft_envelope",
        message: "Draft envelope must be an object.",
        json_path: "/",
      }),
    );
    return issues;
  }

  if (!isRecord(draft.target)) {
    issues.push(
      createIssue({
        code: "missing_target",
        message: "Draft target must be an object.",
        draft,
        json_path: "/target",
      }),
    );
    return issues;
  }

  if (!isNonEmptyString(draft.target.domain)) {
    issues.push(
      createIssue({
        code: "missing_target_domain",
        message: "Draft target.domain is required to build publish content.",
        draft,
        json_path: "/target/domain",
      }),
    );
  }

  if (!isNonEmptyString(draft.target.definition_id)) {
    issues.push(
      createIssue({
        code: "missing_target_definition_id",
        message: "Draft target.definition_id is required to build publish content.",
        draft,
        json_path: "/target/definition_id",
      }),
    );
  }

  return issues;
}

function buildFormalDefinition({ draft, definitionId, domain }) {
  const workingDefinition = isRecord(draft.working_definition) ? cloneJson(draft.working_definition) : {};
  const definition = {
    ...workingDefinition,
    schema_version: EVENT_PROGRAM_SCHEMA_VERSION,
    id: definitionId,
    domain,
    status: READY_FOR_TEST_STATUS,
  };

  if (isRecord(definition.event_graph)) {
    definition.event_graph = {
      ...definition.event_graph,
      graph_rules: { ...NORMALIZED_GRAPH_RULES },
    };
  }

  return definition;
}

function buildFormalCallTemplates({ draft, definition, definitionId, domain, issues }) {
  const nodes = Array.isArray(definition.event_graph?.nodes) ? definition.event_graph.nodes : [];
  const workingCallTemplates = Array.isArray(draft.working_call_templates) ? draft.working_call_templates : [];
  const usedTemplateIndexes = new Set();
  const callTemplates = [];

  definition.event_graph = isRecord(definition.event_graph) ? definition.event_graph : { nodes: [] };
  definition.event_graph.nodes = nodes.map((node, nodeIndex) => {
    if (!isRecord(node) || node.type !== "call") {
      return node;
    }

    if (!isNonEmptyString(node.id)) {
      issues.push(
        createIssue({
          code: "missing_call_node_id",
          message: "Call nodes need an id before publish content can be generated.",
          draft,
          asset_type: "event_definition",
          asset_id: definitionId,
          json_path: `/working_definition/event_graph/nodes/${nodeIndex}/id`,
        }),
      );
      return node;
    }

    const callTemplateId = isNonEmptyString(node.call_template_id) ? node.call_template_id : defaultCallTemplateId(definitionId, node.id);
    const nextNode = {
      ...node,
      call_template_id: callTemplateId,
    };
    const templateMatch = findWorkingCallTemplate({
      workingCallTemplates,
      usedTemplateIndexes,
      callTemplateId,
      nodeId: node.id,
    });

    callTemplates.push(
      buildFormalCallTemplate({
        baseTemplate: templateMatch?.template ?? null,
        callTemplateId,
        node: nextNode,
        definitionId,
        domain,
      }),
    );

    return nextNode;
  });

  return callTemplates;
}

function findWorkingCallTemplate({ workingCallTemplates, usedTemplateIndexes, callTemplateId, nodeId }) {
  const byId = findTemplateIndex(workingCallTemplates, usedTemplateIndexes, (template) => template?.id === callTemplateId);
  if (byId >= 0) {
    usedTemplateIndexes.add(byId);
    return { template: workingCallTemplates[byId], index: byId };
  }

  const byNode = findTemplateIndex(workingCallTemplates, usedTemplateIndexes, (template) => template?.node_id === nodeId);
  if (byNode >= 0) {
    usedTemplateIndexes.add(byNode);
    return { template: workingCallTemplates[byNode], index: byNode };
  }

  return null;
}

function findTemplateIndex(templates, usedIndexes, predicate) {
  return templates.findIndex((template, index) => !usedIndexes.has(index) && isRecord(template) && predicate(template));
}

function buildFormalCallTemplate({ baseTemplate, callTemplateId, node, definitionId, domain }) {
  const template = isRecord(baseTemplate) ? cloneJson(baseTemplate) : {};

  return {
    ...template,
    schema_version: EVENT_PROGRAM_SCHEMA_VERSION,
    id: callTemplateId,
    version: toPositiveInteger(template.version) ?? 1,
    domain,
    event_definition_id: definitionId,
    node_id: node.id,
    render_context_fields: Array.isArray(template.render_context_fields) ? template.render_context_fields : [],
    opening_lines: isRecord(template.opening_lines) ? template.opening_lines : placeholderVariantGroup(`Opening line for ${node.title ?? node.id}.`),
    option_lines: buildOptionLines({
      optionLines: template.option_lines,
      options: node.options,
    }),
    fallback_order: Array.isArray(template.fallback_order) ? template.fallback_order : ["default"],
    default_variant_required: typeof template.default_variant_required === "boolean" ? template.default_variant_required : true,
  };
}

function buildOptionLines({ optionLines, options }) {
  const existingOptionLines = isRecord(optionLines) ? optionLines : {};
  const nextOptionLines = {};

  if (!Array.isArray(options)) {
    return nextOptionLines;
  }

  for (const option of options) {
    if (!isRecord(option) || !isNonEmptyString(option.id)) {
      continue;
    }

    nextOptionLines[option.id] = isRecord(existingOptionLines[option.id])
      ? cloneJson(existingOptionLines[option.id])
      : placeholderVariantGroup(`TODO option line for ${option.id}.`);
  }

  return nextOptionLines;
}

function buildContentRefs(contentRefs, callTemplates) {
  const refs = isRecord(contentRefs) ? cloneJson(contentRefs) : {};

  return {
    ...refs,
    call_template_ids: callTemplates.map((template) => template.id),
  };
}

function defaultCallTemplateId(definitionId, nodeId) {
  return `${definitionId}.call.${nodeId}`;
}

function placeholderVariantGroup(text) {
  return {
    variants: [{ id: "default", text, priority: 1 }],
    selection: "first_match",
  };
}

function createIssue({ code, message, draft, asset_type = "draft", asset_id = draft?.draft_id, json_path }) {
  return {
    severity: "error",
    code,
    message,
    asset_type,
    asset_id,
    json_path,
    editor_location: {
      step: "review",
      section: "publish_builder",
      field_path: json_path,
    },
  };
}

function hasBlockingIssues(issues) {
  return issues.some((issue) => issue.severity === "error");
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function toPositiveInteger(value) {
  return Number.isInteger(value) && value >= 1 ? value : null;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}
