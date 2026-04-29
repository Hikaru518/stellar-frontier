import { readFileSync } from "node:fs";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import EventBrowser from "./EventBrowser";
import { buildEventBrowserItems, filterEventBrowserItems } from "./eventFilters";
import type { EditorEventAsset, EventEditorLibraryResponse } from "./types";

describe("EventBrowser filters", () => {
  it("filters event assets by domain, type, trigger, handler, and query", () => {
    const library = createLibraryResponse({
      definitions: [
        createDefinitionAsset("forest.signal", {
          domain: "forest",
          data: createDefinitionData({
            id: "forest.signal",
            domain: "forest",
            triggerType: "arrival",
            title: "Signal flare",
            summary: "Crew finds a rescue marker.",
            handlerType: "grant_item",
          }),
        }),
        createDefinitionAsset("cave.echo", {
          domain: "cave",
          data: createDefinitionData({
            id: "cave.echo",
            domain: "cave",
            triggerType: "idle_time",
            title: "Echo chamber",
            summary: "A waiting event.",
            handlerType: "set_world_flag",
          }),
        }),
      ],
    });

    const items = buildEventBrowserItems(library);
    const result = filterEventBrowserItems(items, {
      domain: "forest",
      assetType: "event_definition",
      trigger: "arrival",
      handler: "grant_item",
      query: "rescue",
    });

    expect(result.map((item) => item.asset.id)).toEqual(["forest.signal"]);
  });
});

describe("EventBrowser", () => {
  afterEach(() => {
    cleanup();
  });

  it("keeps legacy event assets out of the editor surface", () => {
    const typeSource = readFileSync("src/event-editor/types.ts", "utf8");
    const browserSource = readFileSync("src/event-editor/EventBrowser.tsx", "utf8");
    const readmeSource = readFileSync("README.md", "utf8");

    expect(typeSource).not.toContain("legacy_event");
    expect(browserSource).not.toContain("legacy_event");
    expect(browserSource).not.toContain("legacy event");
    expect(readmeSource).not.toContain("events.json");
  });

  it("renders the available filter chips for the trimmed asset set", () => {
    const library = createLibraryResponse();

    render(<EventBrowser library={library} selectedAsset={null} onSelectAsset={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Event Browser" })).toBeInTheDocument();
    expect(screen.getByLabelText("Asset type filter")).toBeInTheDocument();
    expect(screen.queryByLabelText("Validation filter")).not.toBeInTheDocument();
  });

  it("shows definitions and call template associations without validation badges", () => {
    const library = createLibraryResponse({
      definitions: [
        createDefinitionAsset("forest.signal", {
          data: createDefinitionData({
            id: "forest.signal",
            title: "Signal flare",
            summary: "Crew finds a rescue marker.",
            triggerType: "arrival",
            handlerType: "grant_item",
          }),
        }),
      ],
      call_templates: [
        createCallTemplateAsset("forest.signal.call", {
          data: createCallTemplateData({
            id: "forest.signal.call",
            eventDefinitionId: "forest.signal",
            nodeId: "intro_call",
          }),
        }),
      ],
    });

    render(<EventBrowser library={library} selectedAsset={null} onSelectAsset={vi.fn()} />);

    const definitionRow = screen.getByRole("button", { name: /select forest.signal$/i });
    const callTemplateRow = screen.getByRole("button", { name: /select forest.signal.call/i });

    expect(within(definitionRow).getByText("forest.signal")).toBeInTheDocument();
    expect(definitionRow).toHaveTextContent("arrival");
    expect(callTemplateRow).toHaveTextContent("event_definition_id: forest.signal");
    expect(callTemplateRow).toHaveTextContent("node_id: intro_call");
    expect(definitionRow).not.toHaveTextContent(/OK|ERROR|WARNING/);
    expect(callTemplateRow).not.toHaveTextContent(/OK|ERROR|WARNING/);
  });

  it("includes structured preset and handler assets in the browser", () => {
    const library = createLibraryResponse({
      presets: [createPresetAsset("forest.relic_preset")],
      handlers: [createHandlerAsset("grant_item")],
    });

    render(<EventBrowser library={library} selectedAsset={null} onSelectAsset={vi.fn()} />);

    const presetRow = screen.getByRole("button", { name: /select forest.relic_preset/i });
    const handlerRow = screen.getByRole("button", { name: /select grant_item/i });

    expect(presetRow).toHaveTextContent("preset");
    expect(handlerRow).toHaveTextContent("handler");
    expect(screen.getByLabelText("Asset type filter")).toHaveTextContent("Presets");
    expect(screen.getByLabelText("Asset type filter")).toHaveTextContent("Handlers");
  });

  it("lets users combine browser filters and select a matching asset", () => {
    const onSelectAsset = vi.fn();
    const library = createLibraryResponse({
      definitions: [
        createDefinitionAsset("forest.signal", {
          domain: "forest",
          data: createDefinitionData({
            id: "forest.signal",
            domain: "forest",
            triggerType: "arrival",
            title: "Signal flare",
            summary: "Crew finds a rescue marker.",
            handlerType: "grant_item",
          }),
        }),
        createDefinitionAsset("cave.echo", {
          domain: "cave",
          data: createDefinitionData({
            id: "cave.echo",
            domain: "cave",
            triggerType: "idle_time",
            title: "Echo chamber",
            summary: "A waiting event.",
            handlerType: "set_world_flag",
          }),
        }),
      ],
    });

    render(<EventBrowser library={library} selectedAsset={null} onSelectAsset={onSelectAsset} />);

    fireEvent.change(screen.getByLabelText("Domain filter"), { target: { value: "forest" } });
    fireEvent.change(screen.getByLabelText("Trigger filter"), { target: { value: "arrival" } });
    fireEvent.change(screen.getByLabelText("Browser search"), { target: { value: "rescue" } });

    const resultList = screen.getByRole("list", { name: "Event assets" });
    expect(within(resultList).getByText("forest.signal")).toBeInTheDocument();
    expect(within(resultList).queryByText("cave.echo")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /select forest.signal/i }));

    expect(onSelectAsset).toHaveBeenCalledWith(expect.objectContaining({ id: "forest.signal", asset_type: "event_definition" }));
  });
});

function createLibraryResponse(overrides: Partial<EventEditorLibraryResponse> = {}): EventEditorLibraryResponse {
  return {
    definitions: [],
    call_templates: [],
    presets: [],
    handlers: [],
    schemas: {},
    ...overrides,
  };
}

function createAsset(id: string, overrides: Partial<EditorEventAsset<unknown>> = {}): EditorEventAsset<unknown> {
  return {
    id,
    domain: "forest",
    asset_type: "event_definition",
    file_path: "content/events/definitions/forest.json",
    json_path: "$.event_definitions[0]",
    data: { id },
    editable: false,
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

function createPresetAsset(id: string, overrides: Partial<EditorEventAsset<unknown>> = {}): EditorEventAsset<unknown> {
  return createAsset(id, {
    asset_type: "preset",
    file_path: "content/events/presets/forest.json",
    json_path: "/presets/0",
    data: { id, type: "condition" },
    ...overrides,
  });
}

function createHandlerAsset(id: string, overrides: Partial<EditorEventAsset<unknown>> = {}): EditorEventAsset<unknown> {
  return createAsset(id, {
    domain: "global",
    asset_type: "handler",
    file_path: "content/events/handler_registry.json",
    json_path: "/handlers/0",
    data: { handler_type: id, kind: "effect" },
    ...overrides,
  });
}

function createDefinitionData({
  id,
  domain = "forest",
  triggerType,
  title,
  summary,
  handlerType,
}: {
  id: string;
  domain?: string;
  triggerType: string;
  title: string;
  summary: string;
  handlerType: string;
}): unknown {
  return {
    schema_version: "event-definition.v1",
    id,
    version: 1,
    domain,
    title,
    summary,
    status: "ready_for_test",
    trigger: { type: triggerType },
    event_graph: { nodes: [] },
    effect_groups: [
      {
        id: "effects",
        effects: [{ id: "effect", type: "handler_effect", handler_type: handlerType }],
      },
    ],
  };
}

function createCallTemplateData({
  id,
  eventDefinitionId,
  nodeId,
}: {
  id: string;
  eventDefinitionId: string;
  nodeId: string;
}): unknown {
  return {
    schema_version: "event-call-template.v1",
    id,
    version: 1,
    domain: "forest",
    event_definition_id: eventDefinitionId,
    node_id: nodeId,
    opening_lines: { variants: [], selection: "first_match" },
    option_lines: {},
    fallback_order: [],
    default_variant_required: true,
  };
}
