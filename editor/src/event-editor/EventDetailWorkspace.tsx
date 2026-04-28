import Form from "@rjsf/core";
import type { IChangeEvent } from "@rjsf/core";
import validator from "@rjsf/validator-ajv8";
import type { RJSFSchema } from "@rjsf/utils";
import { useEffect, useMemo, useState } from "react";
import JsonDraftPanel from "./JsonDraftPanel";
import { rjsfFields, rjsfWidgets } from "./rjsfWidgets";
import { buildAssetSchema, buildAssetUiSchema } from "./schemaUi";
import type { EditorEventAsset, EventEditorLibraryResponse } from "./types";

interface EventDetailWorkspaceProps {
  asset: EditorEventAsset<unknown>;
  draft: unknown;
  library: EventEditorLibraryResponse;
  onDraftChange: (draft: unknown) => void;
}

export default function EventDetailWorkspace({ asset, draft, library, onDraftChange }: EventDetailWorkspaceProps) {
  const [validDraft, setValidDraft] = useState<unknown>(draft);
  const [jsonText, setJsonText] = useState(formatJson(draft));
  const [parseError, setParseError] = useState<string | null>(null);
  const schema = useMemo(() => buildAssetSchema(asset, library, validDraft), [asset, library, validDraft]);
  const uiSchema = useMemo(() => buildAssetUiSchema(asset), [asset]);

  useEffect(() => {
    setValidDraft(draft);
    setJsonText(formatJson(draft));
    setParseError(null);
  }, [asset, draft]);

  if (!canEditAsset(asset)) {
    return <ReadonlyAssetSummary asset={asset} draft={draft} />;
  }

  return (
    <section className="event-detail-workspace" aria-label="Event detail workspace">
      <section className="event-detail-panel schema-form-panel" aria-label="Schema form panel">
        <div className="event-detail-panel-heading">
          <h3>Form Editor</h3>
          <span className="status-tag status-success">LOCAL DRAFT</span>
        </div>
        <p className="muted-text">Schema-driven fields edit the same draft shown in raw JSON.</p>
        <div role="form" aria-label="Schema form editor">
          <Form
            schema={schema}
            uiSchema={uiSchema}
            formData={validDraft}
            validator={validator}
            fields={rjsfFields}
            widgets={rjsfWidgets}
            liveValidate={false}
            omitExtraData={false}
            noHtml5Validate
            onChange={handleFormChange}
          />
        </div>
      </section>

      <JsonDraftPanel jsonText={jsonText} parseError={parseError} onJsonTextChange={handleJsonTextChange} />
    </section>
  );

  function handleFormChange(event: IChangeEvent<unknown, RJSFSchema>): void {
    if (event.formData === undefined) {
      return;
    }

    setValidDraft(event.formData);
    setJsonText(formatJson(event.formData));
    setParseError(null);
    onDraftChange(event.formData);
  }

  function handleJsonTextChange(nextText: string): void {
    setJsonText(nextText);

    try {
      const parsed = JSON.parse(nextText) as unknown;
      setValidDraft(parsed);
      setParseError(null);
      onDraftChange(parsed);
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "Invalid JSON.");
    }
  }
}

function ReadonlyAssetSummary({ asset, draft }: { asset: EditorEventAsset<unknown>; draft: unknown }) {
  return (
    <section className="event-detail-panel readonly-asset-summary" aria-label="Read-only asset summary">
      <div className="event-detail-panel-heading">
        <h3>Read-only legacy asset</h3>
        <span className="status-tag status-muted">READ ONLY</span>
      </div>
      <p className="muted-text">
        Legacy events are visible for reference, but they do not enter the Event Editor draft or save flow.
      </p>
      <dl>
        <div>
          <dt>ID</dt>
          <dd>{asset.id}</dd>
        </div>
        <div>
          <dt>File</dt>
          <dd>{asset.file_path}</dd>
        </div>
      </dl>
      <pre>{formatJson(draft)}</pre>
    </section>
  );
}

function canEditAsset(asset: EditorEventAsset<unknown>): boolean {
  return asset.editable && asset.asset_type !== "legacy_event";
}

function formatJson(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2);
}
