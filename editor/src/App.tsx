import Form from "@rjsf/core";
import type { RJSFSchema } from "@rjsf/utils";
import validator from "@rjsf/validator-ajv8";
import "./styles.css";

const editorNavItems = [
  { label: "Event Editor", status: "Available", disabled: false },
  { label: "Character Editor", status: "Future", disabled: true },
  { label: "Map Editor", status: "Future", disabled: true },
  { label: "Item Editor", status: "Future", disabled: true },
  { label: "NPC Editor", status: "Future", disabled: true },
];

const eventFormSchema: RJSFSchema = {
  title: "Event Draft Preview",
  type: "object",
  required: ["eventId"],
  properties: {
    eventId: {
      type: "string",
      title: "Event ID",
    },
  },
};

function App() {
  return (
    <main className="console-shell editor-shell">
      <header className="page-header">
        <div>
          <p className="global-time">LOCAL GAME EDITOR</p>
          <h1>Game Editor</h1>
          <p>Local tooling for browsing and editing Stellar Frontier content.</p>
        </div>
      </header>

      <section className="editor-layout" aria-label="Editor workspace">
        <nav className="panel editor-nav" aria-label="Editor modules">
          <h2 className="panel-title">Modules</h2>
          <div className="editor-nav-list">
            {editorNavItems.map((item) => (
              <button key={item.label} type="button" className="editor-nav-item" disabled={item.disabled} aria-label={item.label}>
                <span>{item.label}</span>
                <span className={`status-tag ${item.disabled ? "status-muted" : "status-success"}`}>{item.status}</span>
              </button>
            ))}
          </div>
        </nav>

        <section className="panel panel-accent editor-main">
          <div className="editor-panel-heading">
            <div>
              <h2 className="panel-title">Event Editor</h2>
              <p className="muted-text">Independent Vite entry. Player App is not mounted here.</p>
            </div>
            <span className="status-tag status-success">READY</span>
          </div>

          <div className="rjsf-preview" aria-label="RJSF preview">
            <h3>RJSF schema form layer ready</h3>
            <Form
              schema={eventFormSchema}
              validator={validator}
              formData={{ eventId: "event.placeholder" }}
              disabled
              noHtml5Validate
            >
              <button type="submit" disabled>
                Save unavailable in T002
              </button>
            </Form>
          </div>
        </section>
      </section>
    </main>
  );
}

export default App;
