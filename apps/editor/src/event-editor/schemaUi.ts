import type { EditorEventAsset, EventEditorLibraryResponse } from "./types";

const EVENT_DEFINITION_SCHEMA_PATH = "content/schemas/events/event-definition.schema.json";
const CALL_TEMPLATE_SCHEMA_PATH = "content/schemas/events/call-template.schema.json";

export interface SchemaNode {
  title?: string;
  type?: string | string[];
  description?: string;
  properties?: Record<string, SchemaNode>;
  required?: string[];
  enum?: unknown[];
  $defs?: Record<string, SchemaNode>;
  items?: SchemaNode;
}

export function buildAssetSchema(asset: EditorEventAsset<unknown>, library: EventEditorLibraryResponse, draft: unknown): SchemaNode {
  const schema = getStructuredAssetSchema(asset, library);

  if (schema) {
    return schema;
  }

  return inferSchemaFromValue(draft, titleFromAsset(asset));
}

function getStructuredAssetSchema(asset: EditorEventAsset<unknown>, library: EventEditorLibraryResponse): SchemaNode | null {
  if (asset.asset_type === "event_definition") {
    const schema = getDefinitionSchema(library, EVENT_DEFINITION_SCHEMA_PATH, "event_definition");
    return schema ? sanitizeEventDefinitionSchema(schema) : null;
  }

  if (asset.asset_type === "call_template") {
    return getDefinitionSchema(library, CALL_TEMPLATE_SCHEMA_PATH, "call_template");
  }

  return null;
}

function getDefinitionSchema(library: EventEditorLibraryResponse, schemaPath: string, definitionName: string): SchemaNode | null {
  const rootSchema = library.schemas[schemaPath] as SchemaNode | undefined;
  const rootDefs = getDefs(rootSchema);
  const definition = rootDefs?.[definitionName];

  if (!definition || typeof definition !== "object") {
    return null;
  }

  return cloneSchema({
    ...(definition as SchemaNode),
    $defs: rootDefs,
    title: (definition as SchemaNode).title ?? titleFromDefinitionName(definitionName),
  });
}

function sanitizeEventDefinitionSchema(schema: SchemaNode): SchemaNode {
  const sanitized = cloneSchema(schema);
  const properties = getSchemaProperties(sanitized);

  if (properties.event_graph) {
    properties.event_graph = { type: "object", title: "Event graph" };
  }
  if (properties.effect_groups) {
    properties.effect_groups = {
      type: "array",
      title: "Effect groups",
      items: { type: "object" },
    };
  }

  if (properties.trigger) {
    properties.trigger = {
      type: "object",
      title: "Trigger",
      properties: {
        type: {
          type: "string",
          title: "Trigger type",
        },
        conditions: {
          type: "array",
          title: "Conditions",
          items: { type: "object" },
        },
      },
    };
  }

  const trigger = properties.trigger;
  const triggerProperties = getSchemaProperties(trigger);
  if (triggerProperties.conditions) {
    triggerProperties.conditions = {
      type: "array",
      title: "Conditions",
      items: { type: "object" },
    };
  }

  return sanitized;
}

function inferSchemaFromValue(value: unknown, title: string): SchemaNode {
  if (Array.isArray(value)) {
    return {
      title,
      type: "array",
      items: inferSchemaFromValue(value[0] ?? "", "Item"),
    };
  }

  if (value && typeof value === "object") {
    const properties = Object.fromEntries(
      Object.entries(value).map(([key, childValue]) => [key, inferSchemaFromValue(childValue, humanizeKey(key))]),
    );

    return {
      title,
      type: "object",
      properties,
    };
  }

  return {
    title,
    type: typeof value === "number" ? "number" : typeof value === "boolean" ? "boolean" : "string",
  };
}

function getDefs(schema: SchemaNode | undefined): Record<string, SchemaNode> | undefined {
  const maybeDefs = schema?.$defs;
  return maybeDefs && typeof maybeDefs === "object" && !Array.isArray(maybeDefs) ? maybeDefs : undefined;
}

function getSchemaProperties(schema: SchemaNode | undefined): Record<string, SchemaNode> {
  if (!schema?.properties || typeof schema.properties !== "object" || Array.isArray(schema.properties)) {
    return {};
  }

  return schema.properties;
}

function titleFromAsset(asset: EditorEventAsset<unknown>): string {
  return `${titleFromDefinitionName(asset.asset_type)} ${asset.id}`;
}

function titleFromDefinitionName(value: string): string {
  return humanizeKey(value);
}

function humanizeKey(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

function cloneSchema<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
