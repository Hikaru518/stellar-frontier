// @vitest-environment node

import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadEventEditorLibrary } from "./contentStore.mjs";

describe("contentStore", () => {
  const repoRoot = path.resolve(import.meta.dirname, "../../..");

  it("loads structured event content, manifest, schemas, and validation report", async () => {
    const library = await loadEventEditorLibrary({ repoRoot });

    expect(library.manifest.schema_version).toBe("event-manifest.v1");
    expect(library.domains).toEqual(["crash_site", "crew_kael", "desert", "forest", "mine", "mountain"]);
    expect(library.definitions.length).toBeGreaterThan(0);
    expect(library.call_templates.length).toBeGreaterThan(0);
    expect(library.handlers.length).toBeGreaterThan(0);
    expect(library.definitions[0]).toEqual(
      expect.objectContaining({
        asset_type: "event_definition",
        file_path: "content/events/definitions/crash_site.json",
        json_path: "/event_definitions/0",
        editable: true,
      }),
    );
    expect(library.call_templates[0]).toEqual(
      expect.objectContaining({
        asset_type: "call_template",
        file_path: "content/events/call_templates/crash_site.json",
        json_path: "/call_templates/0",
        editable: true,
      }),
    );
    expect(library.presets).toEqual([]);
    expect(Object.keys(library.schemas)).toEqual(
      expect.arrayContaining([
        "content/schemas/events/event-definition.schema.json",
        "content/schemas/events/call-template.schema.json",
        "content/schemas/events/handler-registry.schema.json",
        "content/schemas/events.schema.json",
      ]),
    );
    expect(library.validation).toEqual({
      passed: true,
      issues: [],
      command: "npm run validate:content",
    });
  });

  it("marks legacy events as readonly assets with file ownership metadata", async () => {
    const library = await loadEventEditorLibrary({ repoRoot });

    expect(library.legacy_events.length).toBeGreaterThan(0);
    expect(library.legacy_events[0]).toMatchObject({
      id: "survey_forest_scattered_wood",
      domain: "legacy",
      asset_type: "legacy_event",
      file_path: "content/events/events.json",
      json_path: "/events/0",
      editable: false,
    });
    expect(library.legacy_events[0].base_hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
