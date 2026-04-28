import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import EventBrowser from "./EventBrowser";
import { buildEventBrowserItems, filterEventBrowserItems } from "./eventFilters";
import type { EditorEventAsset, EventEditorLibraryResponse } from "./types";

describe("EventBrowser filters", () => {
  it("filters event assets by domain, type, trigger, handler, validation status, and query", () => {
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
      validation: {
        passed: false,
        issues: [
          {
            severity: "error",
            code: "missing_call_template",
            message: "Missing call template.",
            asset_type: "event_definition",
            asset_id: "forest.signal",
          },
        ],
      },
    });

    const items = buildEventBrowserItems(library);
    const result = filterEventBrowserItems(items, {
      domain: "forest",
      assetType: "event_definition",
      trigger: "arrival",
      handler: "grant_item",
      validationStatus: "issues",
      query: "rescue",
    });

    expect(result.map((item) => item.asset.id)).toEqual(["forest.signal"]);
  });
});

describe("EventBrowser", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows definitions, call template associations, legacy read-only status, and validation issues", () => {
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
      legacy_events: [
        createLegacyAsset("legacy.distress", {
          data: { id: "legacy.distress", title: "Legacy distress beacon" },
          editable: false,
        }),
      ],
      validation: {
        passed: false,
        issues: [
          {
            severity: "warning",
            code: "deprecated_field",
            message: "Deprecated field.",
            asset_type: "call_template",
            asset_id: "forest.signal.call",
          },
        ],
      },
    });

    render(<EventBrowser library={library} selectedAsset={null} onSelectAsset={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Event Browser" })).toBeInTheDocument();
    const definitionRow = screen.getByRole("button", { name: /select forest.signal$/i });
    const callTemplateRow = screen.getByRole("button", { name: /select forest.signal.call/i });
    const legacyRow = screen.getByRole("button", { name: /select legacy.distress/i });

    expect(within(definitionRow).getByText("forest.signal")).toBeInTheDocument();
    expect(definitionRow).toHaveTextContent("arrival");
    expect(callTemplateRow).toHaveTextContent("event_definition_id: forest.signal");
    expect(callTemplateRow).toHaveTextContent("node_id: intro_call");
    expect(legacyRow).toHaveTextContent("legacy.distress");
    expect(legacyRow).toHaveTextContent("READ-ONLY LEGACY");
    expect(callTemplateRow).toHaveTextContent("WARNING");
  });

  it("lets users combine browser filters and select a matching asset", () => {
    const onSelectAsset = vi.fn();
    const library = createLibraryResponse({
      domains: ["forest", "cave"],
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
    asset_type: "event_definition",
    file_path: "content/events/definitions/forest.json",
    json_path: "$.event_definitions[0]",
    base_hash: "base-a",
    data: { id },
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
