import type { RunArchive } from "./types";
import { LoggerError } from "./types";

/**
 * OPFS run store — file management abstraction that runs inside the logger
 * Web Worker (ADR-001). Production code uses the browser's OPFS API; unit tests
 * inject a mock root via `rootGetter`.
 *
 * Errors are normalized to `LoggerError` with a small set of codes so callers
 * can branch on failure mode without parsing message strings.
 */

/**
 * Minimal SyncAccessHandle surface used by this module. Production type is
 * `FileSystemSyncAccessHandle` from the DOM lib; declaring our own structural
 * type lets the mock satisfy the interface without importing lib-only types
 * into test-paths.
 */
export interface SyncAccessHandleLike {
  write(buffer: ArrayBufferView | ArrayBuffer, opts?: { at?: number }): number;
  read(buffer: ArrayBufferView, opts?: { at?: number }): number;
  truncate(size: number): void;
  getSize(): number;
  flush(): void;
  close(): void;
}

/**
 * Public store API. See task description for behavior contract; key points:
 *   - createRun rejects with `run_already_exists` on collision.
 *   - rotate evicts oldest archives so the new total ≤ maxArchives (default 10).
 *   - listRuns silently drops entries whose filenames do not match the run-*
 *     format — the source of truth for `created_at_real_time` is the runId.
 */
export interface OpfsRunStore {
  init(): Promise<void>;
  createRun(runId: string): Promise<SyncAccessHandleLike>;
  closeCurrent(): void;
  deleteRun(runId: string): Promise<void>;
  listRuns(currentRunId: string | null): Promise<RunArchive[]>;
  readRun(runId: string): Promise<ArrayBuffer>;
  rotate(newRunId: string, maxArchives?: number): Promise<SyncAccessHandleLike>;
}

const RUNS_DIR = "runs";
const FILE_SUFFIX = ".jsonl";

/**
 * `run-YYYY-MM-DD-HHMM-<rand>` — see envelope.createRunId.
 *
 * Capture groups: 1=YYYY, 2=MM, 3=DD, 4=HH, 5=MM (4-digit time block).
 */
const RUN_ID_RE = /^run-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})-[a-z0-9]+$/;

/**
 * Detect DOMException-shaped NotFoundError objects from the real OPFS API as
 * well as the mock's `error.name === "NotFoundError"` form.
 */
function isNotFoundError(err: unknown): boolean {
  if (err && typeof err === "object" && "name" in err) {
    const name = (err as { name?: unknown }).name;
    if (name === "NotFoundError") return true;
  }
  return false;
}

/**
 * Translate `run-2026-05-01-1100-xyz` into ISO 8601 `2026-05-01T11:00:00.000Z`.
 * Returns `null` when the runId does not match the expected format so callers
 * can skip rather than crash on stray filenames.
 */
function parseRunIdToIso(runId: string): string | null {
  const m = RUN_ID_RE.exec(runId);
  if (!m) return null;
  const [, yyyy, mo, dd, hh, mi] = m;
  // The runId encodes UTC components (envelope.createRunId uses getUTC*).
  return `${yyyy}-${mo}-${dd}T${hh}:${mi}:00.000Z`;
}

/**
 * Strip `.jsonl` to recover the runId from a directory entry name. Returns
 * `null` when the name does not have the expected suffix.
 */
function fileNameToRunId(name: string): string | null {
  if (!name.endsWith(FILE_SUFFIX)) return null;
  return name.slice(0, -FILE_SUFFIX.length);
}

interface DirHandleLike {
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirHandleLike>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandleLike>;
  removeEntry(name: string): Promise<void>;
  values(): AsyncIterableIterator<DirHandleLike | FileHandleLike>;
}

interface FileHandleLike {
  readonly kind: "file";
  readonly name: string;
  getFile(): Promise<{ size: number; arrayBuffer(): Promise<ArrayBuffer> }>;
  createSyncAccessHandle(): Promise<SyncAccessHandleLike>;
}

export function createOpfsRunStore(
  rootGetter: () => Promise<FileSystemDirectoryHandle>,
): OpfsRunStore {
  let runsDir: DirHandleLike | null = null;
  let currentHandle: SyncAccessHandleLike | null = null;

  /** Resolve the runs/ directory, throwing `opfs_unavailable` on getter failure. */
  async function ensureRunsDir(): Promise<DirHandleLike> {
    if (runsDir) return runsDir;
    let root: FileSystemDirectoryHandle;
    try {
      root = await rootGetter();
    } catch (cause) {
      throw new LoggerError({
        code: "opfs_unavailable",
        message: "OPFS root is unavailable",
        cause,
      });
    }
    try {
      const dir = (await (
        root as unknown as DirHandleLike
      ).getDirectoryHandle(RUNS_DIR, { create: true })) as DirHandleLike;
      runsDir = dir;
      return dir;
    } catch (cause) {
      throw new LoggerError({
        code: "opfs_unavailable",
        message: "Failed to open runs/ directory",
        cause,
      });
    }
  }

  function fileName(runId: string): string {
    return `${runId}${FILE_SUFFIX}`;
  }

  async function init(): Promise<void> {
    await ensureRunsDir();
  }

  async function createRun(runId: string): Promise<SyncAccessHandleLike> {
    const dir = await ensureRunsDir();
    const name = fileName(runId);

    // Check for prior existence first — `getFileHandle` with `create: false`
    // is the canonical "does this file exist?" probe in the OPFS API.
    let preExisted = false;
    try {
      await dir.getFileHandle(name, { create: false });
      preExisted = true;
    } catch (err) {
      if (!isNotFoundError(err)) {
        throw new LoggerError({
          code: "opfs_unavailable",
          message: `Failed to probe run file ${name}`,
          cause: err,
        });
      }
    }
    if (preExisted) {
      throw new LoggerError({
        code: "run_already_exists",
        message: `Run already exists: ${runId}`,
      });
    }

    let fileHandle: FileHandleLike;
    try {
      fileHandle = await dir.getFileHandle(name, { create: true });
    } catch (cause) {
      throw new LoggerError({
        code: "opfs_unavailable",
        message: `Failed to create run file ${name}`,
        cause,
      });
    }

    let access: SyncAccessHandleLike;
    try {
      access = await fileHandle.createSyncAccessHandle();
    } catch (cause) {
      throw new LoggerError({
        code: "writer_busy",
        message: `Failed to acquire SyncAccessHandle for ${runId}`,
        cause,
      });
    }
    currentHandle = access;
    return access;
  }

  function closeCurrent(): void {
    if (!currentHandle) return;
    try {
      currentHandle.close();
    } catch {
      // Idempotent close — swallow errors from already-closed handles so the
      // store stays in a usable state.
    }
    currentHandle = null;
  }

  async function deleteRun(runId: string): Promise<void> {
    const dir = await ensureRunsDir();
    try {
      await dir.removeEntry(fileName(runId));
    } catch (err) {
      if (isNotFoundError(err)) {
        throw new LoggerError({
          code: "run_not_found",
          message: `Run not found: ${runId}`,
          cause: err,
        });
      }
      throw new LoggerError({
        code: "opfs_unavailable",
        message: `Failed to delete run ${runId}`,
        cause: err,
      });
    }
  }

  async function listRuns(currentRunId: string | null): Promise<RunArchive[]> {
    const dir = await ensureRunsDir();
    const archives: RunArchive[] = [];
    for await (const entry of dir.values()) {
      if ((entry as { kind?: string }).kind !== "file") continue;
      const file = entry as FileHandleLike;
      const runId = fileNameToRunId(file.name);
      if (runId == null) continue; // ignore non-`.jsonl` entries
      const iso = parseRunIdToIso(runId);
      if (iso == null) continue; // ignore filenames that do not match run-* format

      let size = 0;
      try {
        const f = await file.getFile();
        size = f.size;
      } catch {
        // If size is unobtainable, fall back to 0 rather than dropping the
        // entry — the run still exists on disk.
        size = 0;
      }

      archives.push({
        run_id: runId,
        created_at_real_time: iso,
        // updated_at is intentionally aliased to created_at — OPFS lastModified
        // is not reliably exposed (technical design notes this).
        updated_at_real_time: iso,
        size_bytes: size,
        is_current: currentRunId !== null && runId === currentRunId,
      });
    }
    // ISO 8601 strings sort lexically by time; reverse for newest-first.
    archives.sort((a, b) =>
      a.created_at_real_time < b.created_at_real_time
        ? 1
        : a.created_at_real_time > b.created_at_real_time
          ? -1
          : 0,
    );
    return archives;
  }

  async function readRun(runId: string): Promise<ArrayBuffer> {
    const dir = await ensureRunsDir();
    let fileHandle: FileHandleLike;
    try {
      fileHandle = await dir.getFileHandle(fileName(runId), { create: false });
    } catch (err) {
      if (isNotFoundError(err)) {
        throw new LoggerError({
          code: "run_not_found",
          message: `Run not found: ${runId}`,
          cause: err,
        });
      }
      throw new LoggerError({
        code: "opfs_unavailable",
        message: `Failed to open run ${runId}`,
        cause: err,
      });
    }
    const file = await fileHandle.getFile();
    return file.arrayBuffer();
  }

  async function rotate(
    newRunId: string,
    maxArchives: number = 10,
  ): Promise<SyncAccessHandleLike> {
    closeCurrent();
    // We pass `null` here because the previous current run is being retired;
    // its `is_current` is irrelevant for the eviction calculation below.
    const archives = await listRuns(null);
    // After we add `newRunId` we want length === maxArchives. We currently
    // have `archives.length` archives; if archives.length + 1 > maxArchives
    // we need to delete (archives.length + 1 - maxArchives) of the oldest.
    if (archives.length + 1 > maxArchives) {
      const toEvict = archives.length + 1 - maxArchives;
      // listRuns is sorted desc by created_at; oldest entries are at the end.
      const oldest = archives.slice(archives.length - toEvict);
      for (const a of oldest) {
        await deleteRun(a.run_id);
      }
    }
    return createRun(newRunId);
  }

  return {
    init,
    createRun,
    closeCurrent,
    deleteRun,
    listRuns,
    readRun,
    rotate,
  };
}
