import EventEditorPage from "./event-editor/EventEditorPage";
import "./styles.css";

const editorNavItems = [
  { label: "Event Editor", navLabel: "Event", status: "Available", disabled: false },
  { label: "Character Editor", navLabel: "Character", status: "Future", disabled: true },
  { label: "Map Editor", navLabel: "Map", status: "Future", disabled: true },
  { label: "Item Editor", navLabel: "Item", status: "Future", disabled: true },
  { label: "NPC Editor", navLabel: "NPC", status: "Future", disabled: true },
];

function App() {
  return (
    <main className="console-shell editor-shell">
      <header className="page-header editor-topbar">
        <div className="editor-topbar-brand">
          <p className="global-time">LOCAL GAME EDITOR</p>
          <h1>Game Editor</h1>
          <p>Local viewer for Stellar Frontier event content.</p>
        </div>

        <nav className="editor-topbar-nav" aria-label="Editor modules">
          {editorNavItems.map((item) => (
            <button
              key={item.label}
              type="button"
              className="editor-topbar-nav-item"
              disabled={item.disabled}
              aria-current={item.disabled ? undefined : "page"}
              aria-label={item.label}
              title={item.label}
            >
              <span>{item.navLabel}</span>
              <span className={`status-tag ${item.disabled ? "status-muted" : "status-success"}`}>{item.status}</span>
            </button>
          ))}
        </nav>
      </header>

      <EventEditorPage />
    </main>
  );
}

export default App;
