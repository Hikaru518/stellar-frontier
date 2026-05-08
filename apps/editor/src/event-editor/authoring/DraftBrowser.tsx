import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { CreateDraftRequest, EventDomainSummary, EventDraftSummary } from "../types";
import DomainDialog from "./DomainDialog";

interface DraftBrowserProps {
  domains: EventDomainSummary[];
  drafts: EventDraftSummary[];
  isBusy?: boolean;
  busyLabel?: string | null;
  errorMessage?: string | null;
  domainErrorMessage?: string | null;
  onOpenDraft: (draftId: string) => void | Promise<void>;
  onCreateDraft: (request: CreateDraftRequest) => void | Promise<void>;
  onCreateDomain: (domainId: string) => void | Promise<void>;
}

export default function DraftBrowser({
  domains,
  drafts,
  isBusy = false,
  busyLabel = null,
  errorMessage = null,
  domainErrorMessage = null,
  onOpenDraft,
  onCreateDraft,
  onCreateDomain,
}: DraftBrowserProps) {
  const sortedDomains = useMemo(() => [...domains].sort((first, second) => first.id.localeCompare(second.id)), [domains]);
  const activeDrafts = useMemo(
    () => drafts.filter((draft) => draft.status === "active").sort(compareDraftUpdatedAtDesc),
    [drafts],
  );
  const [selectedDomain, setSelectedDomain] = useState(sortedDomains[0]?.id ?? "");
  const [definitionId, setDefinitionId] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [isDomainDialogOpen, setIsDomainDialogOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (sortedDomains.length === 0) {
      setSelectedDomain("");
      return;
    }

    if (!sortedDomains.some((domain) => domain.id === selectedDomain)) {
      setSelectedDomain(sortedDomains[0].id);
    }
  }, [selectedDomain, sortedDomains]);

  return (
    <section className="event-browser event-draft-browser" aria-label="Draft Browser">
      <div className="event-browser-heading">
        <div>
          <h3>Draft Browser</h3>
          <p className="muted-text">
            {activeDrafts.length} active draft{activeDrafts.length === 1 ? "" : "s"}
          </p>
        </div>
        <button type="button" onClick={() => setIsDomainDialogOpen(true)} disabled={isBusy}>
          Create Domain
        </button>
      </div>

      <form className="event-create-draft-form" onSubmit={handleCreateDraft}>
        <label>
          Domain
          <select
            aria-label="Create event domain"
            value={selectedDomain}
            onChange={(event) => setSelectedDomain(event.target.value)}
            disabled={isBusy || sortedDomains.length === 0}
          >
            {sortedDomains.length > 0 ? (
              sortedDomains.map((domain) => (
                <option key={domain.id} value={domain.id}>
                  {domain.id}
                </option>
              ))
            ) : (
              <option value="">No domains</option>
            )}
          </select>
        </label>
        <label>
          Definition id
          <input
            aria-label="Definition id"
            value={definitionId}
            onChange={(event) => {
              setDefinitionId(event.target.value);
              setLocalError(null);
            }}
            placeholder="forest_bridge_choice"
            disabled={isBusy}
          />
        </label>
        <label>
          Title
          <input aria-label="Title" value={title} onChange={(event) => setTitle(event.target.value)} disabled={isBusy} />
        </label>
        <label>
          Summary
          <textarea aria-label="Summary" value={summary} onChange={(event) => setSummary(event.target.value)} disabled={isBusy} />
        </label>
        <button type="submit" disabled={isBusy || sortedDomains.length === 0}>
          Create Event
        </button>
      </form>

      {busyLabel ? <p className="event-action-status" aria-live="polite">{busyLabel}</p> : null}
      {localError ? <p className="event-action-error" role="alert">{localError}</p> : null}
      {errorMessage ? <p className="event-action-error" role="alert">{errorMessage}</p> : null}

      {activeDrafts.length > 0 ? (
        <ul className="event-browser-list event-draft-list" aria-label="Active drafts">
          {activeDrafts.map((draft) => (
            <li key={draft.draft_id}>
              <button
                type="button"
                className="event-browser-row"
                aria-label={`Open draft ${draft.draft_id}`}
                onClick={() => {
                  void onOpenDraft(draft.draft_id);
                }}
                disabled={isBusy}
              >
                <DraftRow draft={draft} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted-text">No active drafts.</p>
      )}

      <DomainDialog
        isOpen={isDomainDialogOpen}
        isBusy={isBusy}
        errorMessage={domainErrorMessage}
        onCancel={() => setIsDomainDialogOpen(false)}
        onCreateDomain={async (domainId) => {
          try {
            await onCreateDomain(domainId);
            setIsDomainDialogOpen(false);
          } catch {
            // Parent owns the visible helper error state; keep the dialog open for correction.
          }
        }}
      />
    </section>
  );

  function handleCreateDraft(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const targetDomain = selectedDomain.trim();
    const trimmedDefinitionId = definitionId.trim();
    if (!targetDomain) {
      setLocalError("Select a domain before creating an event.");
      return;
    }
    if (!trimmedDefinitionId) {
      setLocalError("Definition id is required.");
      return;
    }

    const request: CreateDraftRequest = {
      mode: "new",
      target_domain: targetDomain,
      definition_id: trimmedDefinitionId,
      ...(title.trim() ? { title: title.trim() } : {}),
      ...(summary.trim() ? { summary: summary.trim() } : {}),
    };
    void onCreateDraft(request);
  }
}

function DraftRow({ draft }: { draft: EventDraftSummary }) {
  const targetDomain = draft.target?.domain ?? draft.domain ?? "unknown";
  const definitionId = draft.target?.definition_id ?? draft.definition_id ?? "unassigned";

  return (
    <>
      <span className="event-browser-row-topline">
        <strong>{draft.draft_id}</strong>
        <span className="status-tag status-warning">{draft.mode}</span>
      </span>
      <span className="event-browser-meta">
        <span>{targetDomain}</span>
        <span>{definitionId}</span>
        {draft.active_step ? <span>step: {draft.active_step}</span> : null}
      </span>
      {draft.title || draft.summary ? (
        <span className="event-browser-meta">
          {draft.title ? <span>{draft.title}</span> : null}
          {draft.summary ? <span>{draft.summary}</span> : null}
        </span>
      ) : null}
      <span className="event-browser-meta">
        <span>updated: {formatTimestamp(draft.updated_at)}</span>
        <span>hash: {draft.draft_hash.slice(0, 8)}</span>
      </span>
    </>
  );
}

function compareDraftUpdatedAtDesc(first: EventDraftSummary, second: EventDraftSummary): number {
  return (Date.parse(second.updated_at ?? "") || 0) - (Date.parse(first.updated_at ?? "") || 0);
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "unknown";
  }

  return value.replace("T", " ").replace(/\.\d{3}Z$/, "Z");
}
