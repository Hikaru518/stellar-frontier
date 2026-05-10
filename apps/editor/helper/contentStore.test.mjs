// @vitest-environment node

import fs from "node:fs/promises";
import os from "node:os";
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
    const iafsDomain = library.domains.find((domain) => domain.id === "iafs-inspection");
    expect(iafsDomain).toEqual(
      expect.objectContaining({
        id: "iafs-inspection",
        manifest_path: "content/events/manifest.json",
        manifest_json_path: "/domains/0",
        definitions_file_path: "content/events/definitions/iafs-inspection.json",
        call_templates_file_path: "content/events/call_templates/iafs-inspection.json",
        presets_file_path: null,
        has_presets: false,
      }),
    );
    expect(iafsDomain.definition_count).toBeGreaterThan(0);
    expect(iafsDomain.call_template_count).toBeGreaterThan(0);
    expect(library.definitions.find((definition) => definition.file_path === "content/events/definitions/iafs-inspection.json")).toEqual(
      expect.objectContaining({
        asset_type: "event_definition",
        file_path: "content/events/definitions/iafs-inspection.json",
        json_path: "/event_definitions/0",
        editable: false,
      }),
    );
    expect(library.call_templates.find((template) => template.file_path === "content/events/call_templates/iafs-inspection.json")).toEqual(
      expect.objectContaining({
        asset_type: "call_template",
        file_path: "content/events/call_templates/iafs-inspection.json",
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

  it("returns active event draft summaries with the editor library", async () => {
    const tempRepoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "stellar-content-store-drafts-"));

    try {
      await writeJson(tempRepoRoot, "content/events/manifest.json", {
        schema_version: "event-manifest.v1",
        domains: [
          {
            id: "forest",
            definitions: "definitions/forest.json",
            call_templates: "call_templates/forest.json",
            presets: null,
          },
        ],
      });
      await writeJson(tempRepoRoot, "content/events/definitions/forest.json", {
        event_definitions: [{ id: "forest_trace_small_camp", domain: "forest" }],
      });
      await writeJson(tempRepoRoot, "content/events/call_templates/forest.json", {
        call_templates: [{ id: "forest_trace_small_camp.call.report", domain: "forest" }],
      });
      await writeJson(tempRepoRoot, "content/events/handler_registry.json", { handlers: [] });
      await writeJson(tempRepoRoot, "content/events/drafts/forest_bridge_choice_20260505_153012.json", {
        schema_version: "event-editor-draft-v1",
        draft_id: "forest_bridge_choice_20260505_153012",
        mode: "new",
        status: "active",
        source: null,
        target: {
          domain: "forest",
          definition_id: "forest_bridge_choice",
          definition_file_path: "content/events/definitions/forest.json",
          call_template_file_path: "content/events/call_templates/forest.json",
        },
        working_definition: {
          id: "forest_bridge_choice",
          domain: "forest",
          title: "Bridge choice",
        },
        working_call_templates: [],
        editor_state: {
          active_step: "basic",
          selection: null,
          collapsed_sections: [],
        },
        hashes: {
          source_definition_file: null,
          source_call_template_file: null,
          source_manifest: null,
          draft: null,
        },
        created_at: "2026-05-05T15:30:12.000Z",
        updated_at: "2026-05-05T15:30:12.000Z",
        published_at: null,
        published_files: [],
      });
      await writeJson(tempRepoRoot, "content/events/drafts/archive/archived_draft.json", {
        schema_version: "event-editor-draft-v1",
        draft_id: "archived_draft",
        mode: "new",
        status: "archived",
        source: null,
        target: {
          domain: "forest",
          definition_id: "archived_draft",
          definition_file_path: "content/events/definitions/forest.json",
          call_template_file_path: "content/events/call_templates/forest.json",
        },
        working_definition: {},
        working_call_templates: [],
        editor_state: {
          active_step: "basic",
          selection: null,
          collapsed_sections: [],
        },
        hashes: {
          source_definition_file: null,
          source_call_template_file: null,
          source_manifest: null,
          draft: null,
        },
        created_at: "2026-05-05T15:30:12.000Z",
        updated_at: "2026-05-05T15:30:12.000Z",
        published_at: "2026-05-05T16:00:00.000Z",
        published_files: [],
      });
      for (const schemaPath of EVENT_SCHEMA_PATHS) {
        await writeJson(tempRepoRoot, schemaPath, {});
      }

      const library = await loadEventEditorLibrary({ repoRoot: tempRepoRoot });

      expect(library.drafts).toEqual([
        expect.objectContaining({
          draft_id: "forest_bridge_choice_20260505_153012",
          mode: "new",
          status: "active",
          domain: "forest",
          definition_id: "forest_bridge_choice",
          file_path: "content/events/drafts/forest_bridge_choice_20260505_153012.json",
          title: "Bridge choice",
        }),
      ]);
    } finally {
      await fs.rm(tempRepoRoot, { recursive: true, force: true });
    }
  });
});

const EVENT_SCHEMA_PATHS = [
  "content/schemas/events/condition.schema.json",
  "content/schemas/events/effect.schema.json",
  "content/schemas/events/event-graph.schema.json",
  "content/schemas/events/event-definition.schema.json",
  "content/schemas/events/call-template.schema.json",
  "content/schemas/events/handler-registry.schema.json",
];

async function writeJson(repoRoot, relativePath, value) {
  const absolutePath = path.join(repoRoot, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
