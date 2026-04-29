// @vitest-environment node

import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadEventEditorLibrary } from "./contentStore.mjs";

describe("contentStore", () => {
  const repoRoot = path.resolve(import.meta.dirname, "../../..");

  it("loads structured event definitions, call templates, and schemas", async () => {
    const library = await loadEventEditorLibrary({ repoRoot });

    expect(library.definitions.length).toBeGreaterThan(0);
    expect(library.call_templates.length).toBeGreaterThan(0);
    expect(library.presets).toEqual(expect.any(Array));
    expect(library.handlers.length).toBeGreaterThan(0);
    expect(library.definitions[0]).toEqual(
      expect.objectContaining({
        asset_type: "event_definition",
        file_path: "content/events/definitions/mainline_crash_site.json",
        json_path: "/event_definitions/0",
        editable: false,
      }),
    );
    expect(library.call_templates[0]).toEqual(
      expect.objectContaining({
        asset_type: "call_template",
        file_path: "content/events/call_templates/mainline_crash_site.json",
        json_path: "/call_templates/0",
        editable: false,
      }),
    );
    expect(library.handlers[0]).toEqual(
      expect.objectContaining({
        asset_type: "handler",
        file_path: "content/events/handler_registry.json",
        json_path: "/handlers/0",
        editable: false,
      }),
    );
    const schemaPaths = Object.keys(library.schemas);
    expect(schemaPaths).toEqual(
      expect.arrayContaining([
        "content/schemas/events/event-definition.schema.json",
        "content/schemas/events/call-template.schema.json",
        "content/schemas/events/handler-registry.schema.json",
      ]),
    );
    expect(schemaPaths).not.toContain("content/schemas/events.schema.json");
  });
});
