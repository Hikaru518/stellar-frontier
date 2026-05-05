// @vitest-environment node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEventDraftStore } from "./eventDraftStore.mjs";

describe("eventDraftStore", () => {
  let repoRoot;
  let store;

  beforeEach(async () => {
    repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "stellar-event-draft-store-"));
    store = createEventDraftStore({
      repoRoot,
      now: () => new Date("2026-05-05T15:30:12.000Z"),
    });

    await writeJson("content/events/manifest.json", {
      schema_version: "event-manifest.v1",
      domains: [manifestDomain("forest"), manifestDomain("desert")],
    });
    await writeJson("content/events/definitions/forest.json", {
      event_definitions: [
        {
          schema_version: "event-program-model-v1",
          id: "forest_trace_small_camp",
          domain: "forest",
          title: "Small camp trace",
          summary: "A partial but formal source event.",
        },
      ],
    });
    await writeJson("content/events/call_templates/forest.json", {
      call_templates: [
        {
          schema_version: "event-program-model-v1",
          id: "forest_trace_small_camp.call.report",
          domain: "forest",
          event_definition_id: "forest_trace_small_camp",
          node_id: "trace_report",
        },
        {
          schema_version: "event-program-model-v1",
          id: "other_event.call.report",
          domain: "forest",
          event_definition_id: "other_event",
          node_id: "other_report",
        },
      ],
    });
    await writeJson("content/events/definitions/desert.json", { event_definitions: [] });
    await writeJson("content/events/call_templates/desert.json", { call_templates: [] });
  });

  afterEach(async () => {
    await fs.rm(repoRoot, { recursive: true, force: true });
  });

  it("creates an active draft envelope for a new event", async () => {
    const result = await store.createDraft({
      mode: "new",
      target_domain: "forest",
      definition_id: "forest_bridge_choice",
      title: "Bridge choice",
      summary: "Choose how to cross the bridge.",
    });

    expect(result.file_path).toBe("content/events/drafts/forest_bridge_choice_20260505_153012.json");
    expect(result.draft).toEqual(
      expect.objectContaining({
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
          summary: "Choose how to cross the bridge.",
        },
        working_call_templates: [],
        editor_state: {
          active_step: "basic",
          selection: null,
          collapsed_sections: [],
        },
        hashes: expect.objectContaining({
          source_definition_file: null,
          source_call_template_file: null,
          source_manifest: null,
          draft: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
        created_at: "2026-05-05T15:30:12.000Z",
        updated_at: "2026-05-05T15:30:12.000Z",
        published_at: null,
        published_files: [],
      }),
    );
    await expect(readText(result.file_path)).resolves.toBe(`${JSON.stringify(result.draft, null, 2)}\n`);
  });

  it("creates an edit-existing draft with source refs and source hashes", async () => {
    const result = await store.createDraft({
      mode: "edit_existing",
      domain: "forest",
      definition_id: "forest_trace_small_camp",
    });

    expect(result.draft.source).toEqual({
      definition_id: "forest_trace_small_camp",
      domain: "forest",
      definition_file_path: "content/events/definitions/forest.json",
      definition_json_path: "/event_definitions/0",
      call_template_file_path: "content/events/call_templates/forest.json",
      call_template_ids: ["forest_trace_small_camp.call.report"],
      call_template_json_paths: ["/call_templates/0"],
      manifest_file_path: "content/events/manifest.json",
    });
    expect(result.draft.working_definition).toEqual(
      expect.objectContaining({
        id: "forest_trace_small_camp",
        domain: "forest",
      }),
    );
    expect(result.draft.working_call_templates).toEqual([
      expect.objectContaining({
        id: "forest_trace_small_camp.call.report",
        event_definition_id: "forest_trace_small_camp",
      }),
    ]);
    expect(result.draft.hashes).toEqual(
      expect.objectContaining({
        source_definition_file: await sha256Text("content/events/definitions/forest.json"),
        source_call_template_file: await sha256Text("content/events/call_templates/forest.json"),
        source_manifest: await sha256Text("content/events/manifest.json"),
        draft: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });

  it("saves incomplete working content but rejects immutable field tampering", async () => {
    const created = await store.createDraft({
      mode: "new",
      target_domain: "forest",
      definition_id: "forest_bridge_choice",
    });

    const incompleteDraft = {
      ...created.draft,
      working_definition: { title: "Still missing formal fields" },
      working_call_templates: [],
    };
    const saved = await store.saveDraft({
      draftId: created.draft.draft_id,
      draft: incompleteDraft,
      expectedDraftHash: created.draft.hashes.draft,
    });
    expect(saved).toEqual(
      expect.objectContaining({
        saved: true,
        file_path: created.file_path,
        draft_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        issues: [],
      }),
    );

    await expect(
      store.saveDraft({
        draftId: created.draft.draft_id,
        draft: { ...created.draft, draft_id: "other_draft" },
        expectedDraftHash: saved.draft_hash,
      }),
    ).rejects.toMatchObject({ code: "immutable_draft_id_changed" });

    await expect(
      store.saveDraft({
        draftId: created.draft.draft_id,
        draft: {
          ...created.draft,
          target: { ...created.draft.target, domain: "desert" },
        },
        expectedDraftHash: saved.draft_hash,
      }),
    ).rejects.toMatchObject({ code: "immutable_target_changed" });

    const editDraft = await store.createDraft({
      mode: "edit_existing",
      domain: "forest",
      definition_id: "forest_trace_small_camp",
    });
    await expect(
      store.saveDraft({
        draftId: editDraft.draft.draft_id,
        draft: {
          ...editDraft.draft,
          source: {
            ...editDraft.draft.source,
            definition_json_path: "/event_definitions/1",
          },
        },
        expectedDraftHash: editDraft.draft.hashes.draft,
      }),
    ).rejects.toMatchObject({ code: "immutable_source_changed" });
  });

  it("moves an active draft to archive and removes it from active summaries", async () => {
    const created = await store.createDraft({
      mode: "new",
      target_domain: "forest",
      definition_id: "forest_bridge_choice",
    });

    await expect(store.listActiveDraftSummaries()).resolves.toEqual([
      expect.objectContaining({
        draft_id: created.draft.draft_id,
        status: "active",
        file_path: created.file_path,
      }),
    ]);

    const archived = await store.archiveDraft({
      draftId: created.draft.draft_id,
      publishedAt: "2026-05-05T16:00:00.000Z",
      publishedFiles: ["content/events/definitions/forest.json"],
    });

    expect(archived).toEqual(
      expect.objectContaining({
        archived: true,
        active_file_path: created.file_path,
        archived_file_path: "content/events/drafts/archive/forest_bridge_choice_20260505_153012.json",
      }),
    );
    await expect(fs.access(path.join(repoRoot, created.file_path))).rejects.toThrow();
    const archivedDraft = await store.loadDraft(created.draft.draft_id, { includeArchived: true });
    expect(archivedDraft).toEqual(
      expect.objectContaining({
        status: "archived",
        published_at: "2026-05-05T16:00:00.000Z",
        published_files: ["content/events/definitions/forest.json"],
      }),
    );
    await expect(store.listActiveDraftSummaries()).resolves.toEqual([]);
  });

  it("rejects unsafe draft ids and path traversal inputs", async () => {
    await expect(store.loadDraft("../outside")).rejects.toMatchObject({ code: "invalid_draft_id" });
    await expect(
      store.createDraft({
        mode: "new",
        target_domain: "../forest",
        definition_id: "forest_bridge_choice",
      }),
    ).rejects.toMatchObject({ code: "invalid_domain_id" });
    await expect(
      store.createDraft({
        mode: "new",
        target_domain: "forest",
        definition_id: "Bad/Event",
      }),
    ).rejects.toMatchObject({ code: "invalid_definition_id" });
  });

  async function writeJson(relativePath, value) {
    await writeText(relativePath, `${JSON.stringify(value, null, 2)}\n`);
  }

  async function writeText(relativePath, value) {
    const absolutePath = path.join(repoRoot, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, value, "utf8");
  }

  async function readText(relativePath) {
    return fs.readFile(path.join(repoRoot, relativePath), "utf8");
  }

  async function sha256Text(relativePath) {
    return crypto.createHash("sha256").update(await readText(relativePath)).digest("hex");
  }
});

function manifestDomain(id) {
  return {
    id,
    definitions: `definitions/${id}.json`,
    call_templates: `call_templates/${id}.json`,
    presets: null,
  };
}
