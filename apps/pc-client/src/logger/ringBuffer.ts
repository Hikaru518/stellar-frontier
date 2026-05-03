/**
 * Listener invoked after each `push` / `pushAll` with the **newly added**
 * items (NOT the full snapshot).
 */
export type RingBufferListener<T> = (delta: { entries: T[] }) => void;

export interface RingBuffer<T> {
  /** Append a single item; trims the oldest entry if capacity is exceeded. */
  push(item: T): void;
  /** Append zero or more items in order; trims oldest entries if capacity is exceeded. */
  pushAll(items: readonly T[]): void;
  /** Return a fresh array of all current entries (oldest first). */
  snapshot(): T[];
  /** Number of currently buffered items. */
  size(): number;
  /** Discard every buffered entry without notifying subscribers. */
  clear(): void;
  /** Subscribe to delta notifications; returns an idempotent unsubscribe. */
  subscribe(listener: RingBufferListener<T>): () => void;
}

/**
 * In-memory ring buffer used as the main-thread tail for the logger UI and as
 * the OPFS-unavailable fallback (ADR-003).
 *
 * Implementation notes:
 * - Backed by a plain `T[]` with `Array.prototype.shift` for trimming. For the
 *   buffer sizes the logger uses (≤ ~1000 entries) this is sufficient and
 *   keeps the code obvious; switching to a deque would be a future refactor.
 * - Listener notifications are synchronous: subscribers see the new state
 *   inside the same tick the producer wrote it.
 * - Listener exceptions are caught per-listener so one misbehaving subscriber
 *   never blocks others or breaks the producer.
 */
export function createRingBuffer<T>(options: { capacity: number }): RingBuffer<T> {
  const capacity = options.capacity;
  const items: T[] = [];
  const listeners = new Set<RingBufferListener<T>>();

  function trim(): void {
    while (items.length > capacity) {
      items.shift();
    }
  }

  function notify(entries: T[]): void {
    if (entries.length === 0) {
      return;
    }
    const payload = { entries };
    for (const listener of listeners) {
      try {
        listener(payload);
      } catch {
        // Per-listener isolation: swallow and continue with remaining
        // listeners so a single broken subscriber cannot block others.
      }
    }
  }

  return {
    push(item: T) {
      items.push(item);
      trim();
      notify([item]);
    },
    pushAll(input: readonly T[]) {
      if (input.length === 0) {
        return;
      }
      // Copy so callers cannot mutate our internal view, and so the delta
      // we hand to listeners is a stable snapshot.
      const added = input.slice();
      for (const item of added) {
        items.push(item);
      }
      trim();
      notify(added);
    },
    snapshot() {
      return items.slice();
    },
    size() {
      return items.length;
    },
    clear() {
      // Drop in place; subscribers are not notified — `clear` is a state
      // reset, not a delta event.
      items.length = 0;
    },
    subscribe(listener: RingBufferListener<T>) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
