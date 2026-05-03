import { describe, expect, it } from "vitest";
import { createOpfsRunStore } from "../opfsRunStore";
import { LoggerError } from "../types";
import {
  createMockOpfsRoot,
  type MockFileSystemDirectoryHandle,
  type MockFileSystemSyncAccessHandle,
} from "../../test/mocks/opfs";

/**
 * Helper — wrap a mock root in the rootGetter shape that opfsRunStore expects.
 * Cast to `unknown` first because the mock structurally matches but is not the
 * lib-dom `FileSystemDirectoryHandle` type.
 */
function rootGetterFor(root: MockFileSystemDirectoryHandle): () => Promise<FileSystemDirectoryHandle> {
  return async () => root as unknown as FileSystemDirectoryHandle;
}

const TEXT = (s: string) => new TextEncoder().encode(s);
const FROM_AB = (ab: ArrayBuffer) => new TextDecoder().decode(new Uint8Array(ab));

describe("opfsRunStore — AC1: basic IO", () => {
  it("createRun + write + close round-trips through readRun byte-for-byte", async () => {
    const root = createMockOpfsRoot();
    const store = createOpfsRunStore(rootGetterFor(root));
    await store.init();

    const handle = (await store.createRun(
      "run-2026-05-01-1000-aaaa",
    )) as unknown as MockFileSystemSyncAccessHandle;

    const payload = TEXT('{"hello":"world"}\n{"second":2}\n');
    handle.write(payload);
    handle.flush();
    handle.close();
    store.closeCurrent();

    const readBack = await store.readRun("run-2026-05-01-1000-aaaa");
    // Compare via Array.from to avoid jsdom realm differences between the
    // TextEncoder-produced Uint8Array and the Uint8Array built from `readBack`.
    // Byte-for-byte equality is the actual contract; prototype identity is not.
    expect(readBack.byteLength).toBe(payload.byteLength);
    expect(Array.from(new Uint8Array(readBack))).toEqual(Array.from(payload));
    expect(FROM_AB(readBack)).toBe('{"hello":"world"}\n{"second":2}\n');
  });

  it("createRun on an existing runId throws LoggerError code=run_already_exists", async () => {
    const root = createMockOpfsRoot();
    const store = createOpfsRunStore(rootGetterFor(root));
    await store.init();

    await store.createRun("run-2026-05-01-1000-aaaa");

    await expect(store.createRun("run-2026-05-01-1000-aaaa")).rejects.toMatchObject({
      name: "LoggerError",
      code: "run_already_exists",
    });
  });
});

describe("opfsRunStore — AC2: rotate honors maxArchives", () => {
  it("rotate keeps exactly maxArchives entries, evicting the oldest, and closes the prior handle", async () => {
    const root = createMockOpfsRoot();
    const store = createOpfsRunStore(rootGetterFor(root));
    await store.init();

    // Pre-fill 10 archives with strictly increasing timestamps. The oldest is
    // 0900, the newest is 0918 (every two minutes apart for simplicity).
    const ids = Array.from({ length: 10 }, (_, i) => {
      const m = String(i * 2).padStart(2, "0");
      return `run-2026-05-01-09${m}-id${i}`;
    });
    let lastHandle: MockFileSystemSyncAccessHandle | null = null;
    for (const id of ids) {
      const h = (await store.createRun(id)) as unknown as MockFileSystemSyncAccessHandle;
      // simulate that the writer leaves the most recent handle open
      lastHandle = h;
      // mark the run as "closed" by store-level close everything except the last
      if (id !== ids[ids.length - 1]) {
        h.close();
      }
    }
    // The last createRun is what `currentHandle` should be tracking now.
    expect(lastHandle?.isClosed()).toBe(false);

    const newId = "run-2026-05-01-1000-newx";
    const newHandle = (await store.rotate(newId, 10)) as unknown as MockFileSystemSyncAccessHandle;

    // The previously tracked handle was closed by rotate -> closeCurrent.
    expect(lastHandle?.isClosed()).toBe(true);
    expect(newHandle.isClosed()).toBe(false);

    const archives = await store.listRuns(newId);
    expect(archives).toHaveLength(10);

    const archiveIds = archives.map((a) => a.run_id);
    // Oldest one (ids[0]) is gone, newId is present.
    expect(archiveIds).not.toContain(ids[0]);
    expect(archiveIds).toContain(newId);

    // is_current is set on the new run.
    const current = archives.find((a) => a.run_id === newId);
    expect(current?.is_current).toBe(true);
  });
});

describe("opfsRunStore — AC3: deleteRun", () => {
  it("deleteRun removes the file so listRuns no longer returns it", async () => {
    const root = createMockOpfsRoot();
    const store = createOpfsRunStore(rootGetterFor(root));
    await store.init();

    await store.createRun("run-2026-05-01-1000-aaaa");
    store.closeCurrent();
    await store.createRun("run-2026-05-01-1100-bbbb");
    store.closeCurrent();

    await store.deleteRun("run-2026-05-01-1000-aaaa");

    const remaining = (await store.listRuns(null)).map((a) => a.run_id);
    expect(remaining).not.toContain("run-2026-05-01-1000-aaaa");
    expect(remaining).toContain("run-2026-05-01-1100-bbbb");
  });

  it("deleteRun on a non-existent id throws LoggerError code=run_not_found", async () => {
    const root = createMockOpfsRoot();
    const store = createOpfsRunStore(rootGetterFor(root));
    await store.init();

    await expect(store.deleteRun("run-2026-05-01-9999-zzzz")).rejects.toMatchObject({
      name: "LoggerError",
      code: "run_not_found",
    });
  });

  it("readRun on a non-existent id throws LoggerError code=run_not_found", async () => {
    const root = createMockOpfsRoot();
    const store = createOpfsRunStore(rootGetterFor(root));
    await store.init();

    await expect(store.readRun("run-2026-05-01-9999-zzzz")).rejects.toMatchObject({
      name: "LoggerError",
      code: "run_not_found",
    });
  });
});

describe("opfsRunStore — AC4: opfs_unavailable", () => {
  it("init() rejects with LoggerError code=opfs_unavailable when rootGetter rejects", async () => {
    const cause = new Error("nav");
    const store = createOpfsRunStore(async () => {
      throw cause;
    });

    const err = await store.init().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LoggerError);
    expect((err as LoggerError).code).toBe("opfs_unavailable");
    expect((err as LoggerError).cause).toBe(cause);
  });
});

describe("opfsRunStore — robustness", () => {
  it("listRuns skips files whose name does not match the run-* pattern", async () => {
    const root = createMockOpfsRoot();
    const store = createOpfsRunStore(rootGetterFor(root));
    await store.init();

    await store.createRun("run-2026-05-01-1000-aaaa");
    store.closeCurrent();

    // Inject a malformed file directly into the runs/ directory.
    const runsDir = await root.getDirectoryHandle("runs");
    runsDir.injectFile("weird.jsonl", TEXT("not a real run file"));

    const archives = await store.listRuns(null);
    const ids = archives.map((a) => a.run_id);
    expect(ids).toContain("run-2026-05-01-1000-aaaa");
    expect(ids).not.toContain("weird");
    expect(ids).not.toContain("weird.jsonl");
  });

  it("listRuns sorts archives by created_at_real_time descending", async () => {
    const root = createMockOpfsRoot();
    const store = createOpfsRunStore(rootGetterFor(root));
    await store.init();

    // Create out-of-order so we can verify sort is by parsed timestamp,
    // not by insertion order or by raw filename.
    await store.createRun("run-2026-05-01-1100-mid1");
    store.closeCurrent();
    await store.createRun("run-2026-05-01-0900-old1");
    store.closeCurrent();
    await store.createRun("run-2026-05-01-1300-new1");
    store.closeCurrent();

    const ids = (await store.listRuns(null)).map((a) => a.run_id);
    expect(ids).toEqual([
      "run-2026-05-01-1300-new1",
      "run-2026-05-01-1100-mid1",
      "run-2026-05-01-0900-old1",
    ]);
  });

  it("closeCurrent() is idempotent — calling twice does not throw", async () => {
    const root = createMockOpfsRoot();
    const store = createOpfsRunStore(rootGetterFor(root));
    await store.init();

    await store.createRun("run-2026-05-01-1000-aaaa");

    expect(() => store.closeCurrent()).not.toThrow();
    expect(() => store.closeCurrent()).not.toThrow();
  });

  it("listRuns reports size_bytes from the actual file size", async () => {
    const root = createMockOpfsRoot();
    const store = createOpfsRunStore(rootGetterFor(root));
    await store.init();

    const handle = (await store.createRun(
      "run-2026-05-01-1000-aaaa",
    )) as unknown as MockFileSystemSyncAccessHandle;
    handle.write(TEXT("hello world"));
    handle.close();
    store.closeCurrent();

    const archives = await store.listRuns(null);
    const r = archives.find((a) => a.run_id === "run-2026-05-01-1000-aaaa");
    expect(r?.size_bytes).toBe(11);
  });

  it("listRuns marks the matching runId as is_current and others as not", async () => {
    const root = createMockOpfsRoot();
    const store = createOpfsRunStore(rootGetterFor(root));
    await store.init();

    await store.createRun("run-2026-05-01-1000-aaaa");
    store.closeCurrent();
    await store.createRun("run-2026-05-01-1100-bbbb");
    store.closeCurrent();

    const archives = await store.listRuns("run-2026-05-01-1100-bbbb");
    const aaaa = archives.find((a) => a.run_id === "run-2026-05-01-1000-aaaa");
    const bbbb = archives.find((a) => a.run_id === "run-2026-05-01-1100-bbbb");
    expect(aaaa?.is_current).toBe(false);
    expect(bbbb?.is_current).toBe(true);
  });
});
