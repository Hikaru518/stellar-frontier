import { buildAssetSchema, type SchemaNode } from "./schemaUi";
import type { EditorEventAsset, EventEditorLibraryResponse } from "./types";

const EVENT_DEFINITION_SCHEMA_PATH = "content/schemas/events/event-definition.schema.json";
const CALL_TEMPLATE_SCHEMA_PATH = "content/schemas/events/call-template.schema.json";

interface SchemaPanelProps {
  asset: EditorEventAsset<unknown>;
  draft: unknown;
  library: EventEditorLibraryResponse;
}

interface FieldSummary {
  path: string;
  label: string;
  type: string;
  description?: string;
  required: boolean;
}

export default function SchemaPanel({ asset, draft, library }: SchemaPanelProps) {
  const schemaPath = schemaPathForAsset(asset);
  const rawSchema = getRawAssetSchema(asset, library);
  const schema = rawSchema ?? buildAssetSchema(asset, library, draft);
  const fields = summarizeSchemaFields(schema);

  return (
    <section className="inspector-panel" aria-label="Schema inspector">
      <h4>Schema Reference</h4>
      {schemaPath ? (
        <p>
          <code>{schemaPath}</code>
        </p>
      ) : (
        <p className="muted-text">No dedicated schema is registered for this asset type. Showing inferred draft fields.</p>
      )}

      {fields.length > 0 ? (
        <ul className="inspector-list" aria-label="Schema fields">
          {fields.map((field) => (
            <li key={field.path} className="inspector-card">
              <div className="inspector-card-heading">
                <code>{field.path}</code>
                {field.required ? <span className="status-tag status-warning">REQUIRED</span> : null}
              </div>
              <p>
                <strong>{field.label}</strong> <span className="muted-text">({field.type})</span>
              </p>
              {field.description ? <p className="muted-text">{field.description}</p> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted-text">This schema does not expose object fields.</p>
      )}
    </section>
  );
}

function schemaPathForAsset(asset: EditorEventAsset<unknown>): string | null {
  if (asset.asset_type === "event_definition") {
    return EVENT_DEFINITION_SCHEMA_PATH;
  }
  if (asset.asset_type === "call_template") {
    return CALL_TEMPLATE_SCHEMA_PATH;
  }
  return null;
}

function getRawAssetSchema(asset: EditorEventAsset<unknown>, library: EventEditorLibraryResponse): SchemaNode | null {
  const schemaPath = schemaPathForAsset(asset);
  if (!schemaPath) {
    return null;
  }

  const rootSchema = library.schemas[schemaPath];
  const definitionName = asset.asset_type === "event_definition" ? "event_definition" : "call_template";
  const definition = getDefs(rootSchema)?.[definitionName];
  return isRecord(definition) ? (definition as SchemaNode) : null;
}

function summarizeSchemaFields(schema: SchemaNode): FieldSummary[] {
  const required = Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === "string") : [];
  return summarizeProperties(getProperties(schema), "$", new Set(required));
}

function summarizeProperties(properties: Record<string, SchemaNode>, parentPath: string, required: Set<string>): FieldSummary[] {
  return Object.entries(properties).flatMap(([key, property]) => {
    const path = `${parentPath}.${key}`;
    const childRequired = Array.isArray(property.required)
      ? new Set(property.required.filter((item): item is string => typeof item === "string"))
      : new Set<string>();
    const summary: FieldSummary = {
      path,
      label: typeof property.title === "string" ? property.title : humanizeKey(key),
      type: formatSchemaType(property),
      description: typeof property.description === "string" ? property.description : undefined,
      required: required.has(key),
    };

    return [summary, ...summarizeProperties(getProperties(property), path, childRequired)];
  });
}

function getDefs(schema: unknown): Record<string, unknown> | null {
  return isRecord(schema) && isRecord(schema.$defs) ? (schema.$defs as Record<string, unknown>) : null;
}

function getProperties(schema: SchemaNode): Record<string, SchemaNode> {
  return isRecord(schema.properties) ? (schema.properties as Record<string, SchemaNode>) : {};
}

function formatSchemaType(schema: SchemaNode): string {
  if (Array.isArray(schema.type)) {
    return schema.type.join(" | ");
  }
  if (typeof schema.type === "string") {
    return schema.type;
  }
  if (schema.enum) {
    return "enum";
  }
  return "value";
}

function humanizeKey(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
