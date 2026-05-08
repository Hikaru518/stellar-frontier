import { useState, type FormEvent } from "react";

interface DomainDialogProps {
  isOpen: boolean;
  isBusy?: boolean;
  errorMessage?: string | null;
  onCancel: () => void;
  onCreateDomain: (domainId: string) => void | Promise<void>;
}

export default function DomainDialog({
  isOpen,
  isBusy = false,
  errorMessage = null,
  onCancel,
  onCreateDomain,
}: DomainDialogProps) {
  const [domainId, setDomainId] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="event-domain-dialog-backdrop" role="presentation">
      <section className="event-domain-dialog editor-state-card" role="dialog" aria-modal="true" aria-label="Create Domain">
        <div className="event-domain-dialog-heading">
          <h3>Create Domain</h3>
          <button type="button" className="browser-pane-toggle" aria-label="Cancel Create Domain" onClick={onCancel}>
            x
          </button>
        </div>

        <form className="event-domain-form" onSubmit={handleSubmit}>
          <label>
            Domain id
            <input
              aria-label="Domain id"
              value={domainId}
              onChange={(event) => {
                setDomainId(event.target.value);
                setLocalError(null);
              }}
              placeholder="ruins"
              disabled={isBusy}
            />
          </label>

          {localError ? <p className="event-action-error" role="alert">{localError}</p> : null}
          {errorMessage ? <p className="event-action-error" role="alert">{errorMessage}</p> : null}

          <div className="event-domain-dialog-actions">
            <button type="button" onClick={onCancel} disabled={isBusy}>
              Cancel
            </button>
            <button type="submit" disabled={isBusy}>
              {isBusy ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmedDomainId = domainId.trim();
    if (!trimmedDomainId) {
      setLocalError("Domain id is required.");
      return;
    }

    void onCreateDomain(trimmedDomainId);
  }
}
