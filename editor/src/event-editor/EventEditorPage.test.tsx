import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEditorApiError } from "./apiClient";
import { buildDraftStorageKey } from "./draftStorage";
import EventEditorPage from "./EventEditorPage";
import type { EditorEventAsset, EventEditorLibraryResponse } from "./types";

describe("EventEditorPage", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  afterEach(() => {
    cleanup();
  });

  it("loads the helper library and shows a summary", async () => {
    const loadLibrary = vi.fn(async () =>
      createLibraryResponse({
        definitions: [createDefinitionAsset("forest.signal")],
        call_templates: [createCallTemplateAsset("forest.signal.call")],
        handlers: [createHandler()],
      }),
    );

    render(<EventEditorPage loadLibrary={loadLibrary} />);

    expect(screen.getByText("Loading event library...")).toBeInTheDocument();
    expect(await screen.findByText("Library loaded")).toBeInTheDocument();
    expect(screen.getByText("1 definition")).toBeInTheDocument();
    expect(screen.getByText("1 call template")).toBeInTheDocument();
    expect(screen.getByText("1 handler")).toBeInTheDocument();
  });

  it("shows the local helper startup hint when loading fails", async () => {
    const loadLibrary = vi.fn(
      async () =>
        Promise.reject(
          new EventEditorApiError("helper_unavailable", "Unable to reach helper. Start it with npm run editor:helper.", {
            status: 0,
          }),
        ),
    );

    render(<EventEditorPage loadLibrary={loadLibrary} />);

    expect(await screen.findByText("Helper unavailable")).toBeInTheDocument();
    expect(screen.getAllByText(/npm run editor:helper/).length).toBeGreaterThan(0);
  });

  it("shows an empty state when the library has no editable assets", async () => {
    const loadLibrary = vi.fn(async () => createLibraryResponse());

    render(<EventEditorPage loadLibrary={loadLibrary} />);

    expect(await screen.findByText("No editable event assets found")).toBeInTheDocument();
  });

  it("restores a matching local draft and keeps changed-base drafts out of the active state", async () => {
    const asset = createDefinitionAsset("forest.signal", { base_hash: "base-a" });
    const staleAsset = createDefinitionAsset("forest.signal", { base_hash: "base-old" });
    window.localStorage.setItem(buildDraftStorageKey(asset), JSON.stringify({ id: "forest.signal", notes: "matching draft" }));
    window.localStorage.setItem(buildDraftStorageKey(staleAsset), JSON.stringify({ id: "forest.signal", notes: "stale draft" }));
    const loadLibrary = vi.fn(async () => createLibraryResponse({ definitions: [asset] }));

    render(<EventEditorPage loadLibrary={loadLibrary} />);

    expect(await screen.findByText("1 local draft restored")).toBeInTheDocument();
    expect(screen.getByDisplayValue(/matching draft/)).toBeInTheDocument();
    expect(screen.queryByText("stale draft")).not.toBeInTheDocument();
  });

  it("persists draft edits to localStorage", async () => {
    const asset = createDefinitionAsset("forest.signal", { data: { id: "forest.signal", status: "ready" } });
    const loadLibrary = vi.fn(async () => createLibraryResponse({ definitions: [asset] }));

    render(<EventEditorPage loadLibrary={loadLibrary} />);
    const draftInput = await screen.findByLabelText("Draft JSON scratchpad");
    fireEvent.change(draftInput, {
      target: { value: '{\n  "id": "forest.signal",\n  "notes": "local change"\n}' },
    });

    await waitFor(() => {
      expect(window.localStorage.getItem(buildDraftStorageKey(asset))).toContain("local change");
    });
  });

  it("updates the selection summary from the event browser and keeps legacy assets read-only", async () => {
    const definition = createDefinitionAsset("forest.signal", {
      data: {
        id: "forest.signal",
        title: "Signal flare",
        summary: "Crew finds a rescue marker.",
        trigger: { type: "arrival" },
        effect_groups: [],
      },
    });
    const legacy = createLegacyAsset("legacy.distress");
    const loadLibrary = vi.fn(async () =>
      createLibraryResponse({
        definitions: [definition],
        legacy_events: [legacy],
      }),
    );

    render(<EventEditorPage loadLibrary={loadLibrary} />);

    expect(await screen.findByRole("heading", { name: "Event Browser" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /select legacy.distress/i }));

    expect(screen.getByRole("heading", { name: "Selection summary" })).toBeInTheDocument();
    const summary = screen.getByLabelText("Selection summary");
    expect(summary).toHaveTextContent("legacy.distress");
    expect(summary).toHaveTextContent("Read-only legacy format");
    expect(screen.queryByLabelText("Draft JSON scratchpad")).not.toBeInTheDocument();
  });
});

function createLibraryResponse(overrides: Partial<EventEditorLibraryResponse> = {}): EventEditorLibraryResponse {
  return {
    manifest: { schema_version: "event-manifest.v1", domains: [] },
    domains: ["forest"],
    definitions: [],
    call_templates: [],
    handlers: [],
    presets: [],
    legacy_events: [],
    schemas: {},
    validation: { passed: true, issues: [] },
    ...overrides,
  };
}

function createAsset(id: string, overrides: Partial<EditorEventAsset<unknown>> = {}): EditorEventAsset<unknown> {
  return {
    id,
    domain: "forest",
    asset_type: "event_definition" as const,
    file_path: "content/events/definitions/forest.json",
    json_path: "$.event_definitions[0]",
    base_hash: "base-a",
    data: { id, status: "ready" },
    editable: true,
    ...overrides,
  };
}

function createDefinitionAsset(
  id: string,
  overrides: Partial<EditorEventAsset<unknown>> = {},
): EventEditorLibraryResponse["definitions"][number] {
  return createAsset(id, overrides) as EventEditorLibraryResponse["definitions"][number];
}

function createCallTemplateAsset(
  id: string,
  overrides: Partial<EditorEventAsset<unknown>> = {},
): EventEditorLibraryResponse["call_templates"][number] {
  return createAsset(id, {
    asset_type: "call_template",
    file_path: "content/events/call_templates/forest.json",
    ...overrides,
  }) as EventEditorLibraryResponse["call_templates"][number];
}

function createLegacyAsset(id: string, overrides: Partial<EditorEventAsset<unknown>> = {}): EditorEventAsset<unknown> {
  return createAsset(id, {
    asset_type: "legacy_event",
    file_path: "content/events/events.json",
    editable: false,
    data: { id, title: "Legacy distress beacon" },
    ...overrides,
  });
}

function createHandler() {
  return {
    handler_type: "grant_item",
    kind: "effect" as const,
    description: "Grant item",
    params_schema_ref: "#/$defs/grant_item",
    allowed_target_types: ["crew_inventory" as const],
    deterministic: true,
    uses_random: false,
    failure_policy: "fail_event" as const,
    sample_fixtures: [],
  };
}

function installMemoryLocalStorage(): void {
  const values = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
      key: (index: number) => Array.from(values.keys())[index] ?? null,
      get length() {
        return values.size;
      },
    } satisfies Storage,
  });
}
