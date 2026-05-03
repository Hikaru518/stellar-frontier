/**
 * Minimal in-memory OPFS mock for unit tests under jsdom.
 *
 * Production code only relies on a small slice of the OPFS surface (see
 * `opfsRunStore.ts`); this mock implements just enough for it. We intentionally
 * do not re-implement spec-level details such as locking, busy detection, or
 * permission prompts — the real OPFS is the production target, not the mock.
 *
 * The file system tree is a `Map<string, MockFileSystemDirectoryHandle |
 * MockFileSystemFileHandle>` per directory. Files own a `Uint8Array` byte
 * buffer that grows on write.
 */

/** Subset of `FileSystemReadWriteOptions` used by SyncAccessHandle. */
export interface FsRWOptions {
  at?: number;
}

/**
 * Mock of `FileSystemSyncAccessHandle` — same operations, in-memory only.
 *
 * Tracks an internal cursor (`position`) that advances after each read/write
 * when no explicit `at` is supplied; this matches OPFS's append-friendly
 * default behavior.
 */
export class MockFileSystemSyncAccessHandle {
  private position = 0;
  private closed = false;

  constructor(private file: MockFileSystemFileHandle) {}

  write(buffer: ArrayBufferView | ArrayBuffer, opts?: FsRWOptions): number {
    if (this.closed) throw new Error("SyncAccessHandle is closed");
    const view =
      buffer instanceof ArrayBuffer
        ? new Uint8Array(buffer)
        : new Uint8Array(
            buffer.buffer,
            buffer.byteOffset,
            buffer.byteLength,
          );
    const at = opts?.at ?? this.position;
    const end = at + view.byteLength;
    if (end > this.file.bytes.length) {
      const grown = new Uint8Array(end);
      grown.set(this.file.bytes, 0);
      this.file.bytes = grown;
    }
    this.file.bytes.set(view, at);
    this.position = end;
    return view.byteLength;
  }

  read(buffer: ArrayBufferView, opts?: FsRWOptions): number {
    if (this.closed) throw new Error("SyncAccessHandle is closed");
    const at = opts?.at ?? this.position;
    const dest = new Uint8Array(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength,
    );
    const available = Math.max(0, this.file.bytes.length - at);
    const n = Math.min(dest.byteLength, available);
    dest.set(this.file.bytes.subarray(at, at + n), 0);
    this.position = at + n;
    return n;
  }

  truncate(size: number): void {
    if (this.closed) throw new Error("SyncAccessHandle is closed");
    if (size < this.file.bytes.length) {
      this.file.bytes = this.file.bytes.slice(0, size);
    } else if (size > this.file.bytes.length) {
      const grown = new Uint8Array(size);
      grown.set(this.file.bytes, 0);
      this.file.bytes = grown;
    }
    if (this.position > size) this.position = size;
  }

  getSize(): number {
    if (this.closed) throw new Error("SyncAccessHandle is closed");
    return this.file.bytes.length;
  }

  flush(): void {
    if (this.closed) throw new Error("SyncAccessHandle is closed");
    // no-op for in-memory
  }

  close(): void {
    this.closed = true;
  }

  /** Test-only helper. */
  isClosed(): boolean {
    return this.closed;
  }
}

/**
 * Mock of `FileSystemFileHandle`. Owns a byte buffer; multiple
 * SyncAccessHandles created from the same file all share that buffer (this
 * mock does not enforce single-writer locking — production code does).
 */
export class MockFileSystemFileHandle {
  public readonly kind = "file" as const;
  public bytes: Uint8Array = new Uint8Array(0);

  constructor(public readonly name: string) {}

  async getFile(): Promise<{ size: number; arrayBuffer(): Promise<ArrayBuffer> }> {
    const snapshot = this.bytes.slice();
    return {
      size: snapshot.byteLength,
      arrayBuffer: async () =>
        snapshot.buffer.slice(
          snapshot.byteOffset,
          snapshot.byteOffset + snapshot.byteLength,
        ),
    };
  }

  async createSyncAccessHandle(): Promise<MockFileSystemSyncAccessHandle> {
    return new MockFileSystemSyncAccessHandle(this);
  }
}

/**
 * Helper to build a NotFoundError DOMException-like object that production
 * code can branch on. jsdom provides a real DOMException, but we degrade
 * gracefully if it is missing.
 */
function notFoundError(name: string): Error {
  const Ctor: typeof DOMException | undefined =
    typeof DOMException === "undefined" ? undefined : DOMException;
  if (Ctor) {
    return new Ctor(`A requested file or directory could not be found: ${name}`, "NotFoundError");
  }
  const err = new Error(`NotFoundError: ${name}`);
  err.name = "NotFoundError";
  return err;
}

type DirEntry = MockFileSystemDirectoryHandle | MockFileSystemFileHandle;

/**
 * Mock of `FileSystemDirectoryHandle`. Async iterators return entries from the
 * internal Map; create / remove operations mutate the Map.
 */
export class MockFileSystemDirectoryHandle {
  public readonly kind = "directory" as const;
  private readonly entries_: Map<string, DirEntry> = new Map();

  constructor(public readonly name: string = "") {}

  async getDirectoryHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<MockFileSystemDirectoryHandle> {
    const existing = this.entries_.get(name);
    if (existing && existing.kind === "directory") return existing;
    if (existing && existing.kind === "file") {
      throw notFoundError(name); // type mismatch — surface as NotFound
    }
    if (options?.create) {
      const dir = new MockFileSystemDirectoryHandle(name);
      this.entries_.set(name, dir);
      return dir;
    }
    throw notFoundError(name);
  }

  async getFileHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<MockFileSystemFileHandle> {
    const existing = this.entries_.get(name);
    if (existing && existing.kind === "file") return existing;
    if (existing && existing.kind === "directory") {
      throw notFoundError(name);
    }
    if (options?.create) {
      const file = new MockFileSystemFileHandle(name);
      this.entries_.set(name, file);
      return file;
    }
    throw notFoundError(name);
  }

  async removeEntry(name: string): Promise<void> {
    if (!this.entries_.has(name)) throw notFoundError(name);
    this.entries_.delete(name);
  }

  async *values(): AsyncIterableIterator<DirEntry> {
    for (const v of this.entries_.values()) yield v;
  }

  async *keys(): AsyncIterableIterator<string> {
    for (const k of this.entries_.keys()) yield k;
  }

  async *entries(): AsyncIterableIterator<[string, DirEntry]> {
    for (const e of this.entries_.entries()) yield e;
  }

  /** Test-only helper: check membership without consuming the async iterator. */
  hasEntry(name: string): boolean {
    return this.entries_.has(name);
  }

  /** Test-only helper: directly inject a malformed file (e.g. wrong name). */
  injectFile(name: string, bytes?: Uint8Array): MockFileSystemFileHandle {
    const file = new MockFileSystemFileHandle(name);
    if (bytes) file.bytes = bytes;
    this.entries_.set(name, file);
    return file;
  }
}

/** Returns a fresh empty mock OPFS root, suitable as `rootGetter` payload. */
export function createMockOpfsRoot(): MockFileSystemDirectoryHandle {
  return new MockFileSystemDirectoryHandle("");
}
