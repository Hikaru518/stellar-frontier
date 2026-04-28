import type { RJSFSchema, UiSchema } from "@rjsf/utils";
import type { EditorEventAsset, EventEditorLibraryResponse } from "./types";

const EVENT_DEFINITION_SCHEMA_PATH = "content/schemas/events/event-definition.schema.json";
const CALL_TEMPLATE_SCHEMA_PATH = "content/schemas/events/call-template.schema.json";

export function buildAssetSchema(asset: EditorEventAsset<unknown>, library: EventEditorLibraryResponse, draft: unknown): RJSFSchema {
  const schema = getStructuredAssetSchema(asset, library);

  if (schema) {
    return schema;
  }

  return inferSchemaFromValue(draft, titleFromAsset(asset));
}

export function buildAssetUiSchema(asset: EditorEventAsset<unknown>): UiSchema {
  const common: UiSchema = {
    "ui:submitButtonOptions": { norender: true },
    "ui:globalOptions": {
      label: true,
    },
  };

  if (asset.asset_type === "event_definition") {
    return {
      ...common,
      event_graph: {
        "ui:field": "eventGraph",
      },
      trigger: {
        conditions: {
          "ui:field": "conditionsArray",
        },
      },
      effect_groups: {
        "ui:field": "effectGroups",
      },
      sample_contexts: {
        "ui:collapsed": true,
      },
    };
  }

  if (asset.asset_type === "call_template") {
    return {
      ...common,
      event_definition_id: {
        "ui:widget": "referenceText",
        "ui:options": { referenceKind: "event definition" },
      },
      node_id: {
        "ui:widget": "referenceText",
        "ui:options": { referenceKind: "event node" },
      },
      opening_lines: {
        variants: {
          items: {
            when: {
              "ui:field": "conditionsArray",
            },
          },
        },
      },
      body_lines: {
        items: {
          variants: {
            items: {
              when: {
                "ui:field": "conditionsArray",
              },
            },
          },
        },
      },
    };
  }

  return common;
}

function getStructuredAssetSchema(asset: EditorEventAsset<unknown>, library: EventEditorLibraryResponse): RJSFSchema | null {
  if (asset.asset_type === "event_definition") {
    const schema = getDefinitionSchema(library, EVENT_DEFINITION_SCHEMA_PATH, "event_definition");
    return schema ? sanitizeEventDefinitionSchema(schema) : null;
  }

  if (asset.asset_type === "call_template") {
    return getDefinitionSchema(library, CALL_TEMPLATE_SCHEMA_PATH, "call_template");
  }

  return null;
}

function getDefinitionSchema(library: EventEditorLibraryResponse, schemaPath: string, definitionName: string): RJSFSchema | null {
  const rootSchema = library.schemas[schemaPath] as RJSFSchema | undefined;
  const definition = getDefs(rootSchema)?.[definitionName];

  if (!definition || typeof definition !== "object") {
    return null;
  }

  return cloneSchema({
    ...(definition as RJSFSchema),
    title: (definition as RJSFSchema).title ?? titleFromDefinitionName(definitionName),
  });
}

function sanitizeEventDefinitionSchema(schema: RJSFSchema): RJSFSchema {
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

  const trigger = properties.trigger as RJSFSchema | undefined;
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

function inferSchemaFromValue(value: unknown, title: string): RJSFSchema {
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

function getDefs(schema: RJSFSchema | undefined): Record<string, unknown> | undefined {
  const maybeDefs = schema?.$defs;
  return maybeDefs && typeof maybeDefs === "object" && !Array.isArray(maybeDefs) ? (maybeDefs as Record<string, unknown>) : undefined;
}

function getSchemaProperties(schema: RJSFSchema | undefined): Record<string, RJSFSchema> {
  if (!schema?.properties || typeof schema.properties !== "object" || Array.isArray(schema.properties)) {
    return {};
  }

  return schema.properties as Record<string, RJSFSchema>;
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
