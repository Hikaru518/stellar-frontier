import { useState } from "react";
import EventEditorPage from "./event-editor/EventEditorPage";
import MapEditorPage from "./map-editor/MapEditorPage";
import "./styles.css";

type EditorModule = "event" | "map";

const editorNavItems = [
  { id: "event", label: "Event Editor", navLabel: "Event", status: "Available", disabled: false },
  { label: "Character Editor", navLabel: "Character", status: "Future", disabled: true },
  { id: "map", label: "Map Editor", navLabel: "Map", status: "Available", disabled: false },
  { label: "Item Editor", navLabel: "Item", status: "Future", disabled: true },
  { label: "NPC Editor", navLabel: "NPC", status: "Future", disabled: true },
] satisfies Array<
  | { id: EditorModule; label: string; navLabel: string; status: string; disabled: false }
  | { id?: never; label: string; navLabel: string; status: string; disabled: true }
>;

function App() {
  const [activeModule, setActiveModule] = useState<EditorModule>("event");

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
              aria-current={!item.disabled && item.id === activeModule ? "page" : undefined}
              aria-label={item.label}
              title={item.label}
              onClick={() => {
                if (!item.disabled) {
                  setActiveModule(item.id);
                }
              }}
            >
              <span>{item.navLabel}</span>
              <span className={`status-tag ${item.disabled ? "status-muted" : "status-success"}`}>{item.status}</span>
            </button>
          ))}
        </nav>
      </header>

      {activeModule === "event" ? <EventEditorPage /> : <MapEditorPage />}
    </main>
  );
}

export default App;
