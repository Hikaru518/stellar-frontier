import EventEditorPage from "./event-editor/EventEditorPage";
import "./styles.css";

const editorNavItems = [
  { label: "Event Editor", status: "Available", disabled: false },
  { label: "Character Editor", status: "Future", disabled: true },
  { label: "Map Editor", status: "Future", disabled: true },
  { label: "Item Editor", status: "Future", disabled: true },
  { label: "NPC Editor", status: "Future", disabled: true },
];

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

        <EventEditorPage />
      </section>
    </main>
  );
}

export default App;
