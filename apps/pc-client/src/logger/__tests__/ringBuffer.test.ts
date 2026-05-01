import { describe, expect, it, vi } from "vitest";
import { createRingBuffer } from "../ringBuffer";

describe("ringBuffer.createRingBuffer (AC3 / AC4)", () => {
  it("retains only the last `capacity` items when more are pushed (AC3)", () => {
    const rb = createRingBuffer<number>({ capacity: 3 });
    rb.push(1);
    rb.push(2);
    rb.push(3);
    rb.push(4);

    expect(rb.snapshot()).toEqual([2, 3, 4]);
    expect(rb.size()).toBe(3);
  });

  it("notifies subscriber once per push with a single-item delta (AC3)", () => {
    const rb = createRingBuffer<string>({ capacity: 5 });
    const listener = vi.fn();
    rb.subscribe(listener);

    rb.push("a");
    rb.push("b");

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenNthCalledWith(1, { entries: ["a"] });
    expect(listener).toHaveBeenNthCalledWith(2, { entries: ["b"] });
  });

  it("pushAll([a, b]) notifies once with a 2-item delta", () => {
    const rb = createRingBuffer<string>({ capacity: 10 });
    const listener = vi.fn();
    rb.subscribe(listener);

    rb.pushAll(["a", "b"]);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ entries: ["a", "b"] });
    expect(rb.snapshot()).toEqual(["a", "b"]);
  });

  it("pushAll([]) does NOT notify subscriber (AC4)", () => {
    const rb = createRingBuffer<string>({ capacity: 10 });
    const listener = vi.fn();
    rb.subscribe(listener);

    rb.pushAll([]);

    expect(listener).not.toHaveBeenCalled();
    expect(rb.snapshot()).toEqual([]);
    expect(rb.size()).toBe(0);
  });

  it("after unsubscribe the listener is no longer called (AC3)", () => {
    const rb = createRingBuffer<number>({ capacity: 5 });
    const listener = vi.fn();
    const unsub = rb.subscribe(listener);

    rb.push(1);
    expect(listener).toHaveBeenCalledTimes(1);

    unsub();
    rb.push(2);
    rb.pushAll([3, 4]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("calling unsubscribe multiple times does not throw", () => {
    const rb = createRingBuffer<number>({ capacity: 5 });
    const listener = vi.fn();
    const unsub = rb.subscribe(listener);

    unsub();
    expect(() => unsub()).not.toThrow();
    expect(() => unsub()).not.toThrow();

    rb.push(1);
    expect(listener).not.toHaveBeenCalled();
  });

  it("multiple subscribers each receive notifications independently", () => {
    const rb = createRingBuffer<number>({ capacity: 5 });
    const a = vi.fn();
    const b = vi.fn();
    rb.subscribe(a);
    rb.subscribe(b);

    rb.push(1);

    expect(a).toHaveBeenCalledTimes(1);
    expect(a).toHaveBeenCalledWith({ entries: [1] });
    expect(b).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledWith({ entries: [1] });
  });

  it("a throwing listener does not block other listeners", () => {
    const rb = createRingBuffer<number>({ capacity: 5 });
    const bad = vi.fn(() => {
      throw new Error("boom");
    });
    const good = vi.fn();
    rb.subscribe(bad);
    rb.subscribe(good);

    expect(() => rb.push(1)).not.toThrow();
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledWith({ entries: [1] });
  });

  it("size() reflects buffer length before and after pushes", () => {
    const rb = createRingBuffer<number>({ capacity: 3 });
    expect(rb.size()).toBe(0);
    rb.push(1);
    expect(rb.size()).toBe(1);
    rb.pushAll([2, 3]);
    expect(rb.size()).toBe(3);
    rb.push(4); // overflow drops the oldest
    expect(rb.size()).toBe(3);
  });

  it("pushAll trims items beyond capacity, keeping the most recent", () => {
    const rb = createRingBuffer<number>({ capacity: 3 });
    rb.push(0);
    const listener = vi.fn();
    rb.subscribe(listener);

    rb.pushAll([1, 2, 3, 4]);

    expect(rb.snapshot()).toEqual([2, 3, 4]);
    expect(rb.size()).toBe(3);
    // The delta reported is the items that were pushed (not the surviving set).
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ entries: [1, 2, 3, 4] });
  });

  it("snapshot returns a fresh array (mutating the result must not corrupt internal state)", () => {
    const rb = createRingBuffer<number>({ capacity: 5 });
    rb.pushAll([1, 2, 3]);
    const snap = rb.snapshot();
    snap.push(999);
    expect(rb.snapshot()).toEqual([1, 2, 3]);
  });
});
