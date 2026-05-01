import { afterEach, describe, expect, it, vi } from "vitest";

import { triggerDownload } from "../download";

/**
 * `triggerDownload` is the synchronous DOM helper that turns a Blob into a
 * browser file save. We exercise it under jsdom by spying on the surrounding
 * URL / DOM APIs rather than touching the real download dialog.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

describe("triggerDownload", () => {
  it("creates an <a>, sets href + download, clicks, then revokes the object URL", () => {
    const fakeUrl = "blob:fake-url";
    const createUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue(fakeUrl);
    const revokeUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {
      // no-op stub
    });

    // Track the order of calls between click and revokeObjectURL so we can
    // assert revoke happens AFTER click.
    const callOrder: string[] = [];
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        callOrder.push("click");
      });
    revokeUrl.mockImplementation(() => {
      callOrder.push("revoke");
    });

    const createElementSpy = vi.spyOn(document, "createElement");

    const blob = new Blob(["hello"], { type: "application/x-ndjson" });
    const result = triggerDownload(blob, "test.jsonl");

    expect(result).toBeUndefined();

    // createObjectURL called exactly once with the blob.
    expect(createUrl).toHaveBeenCalledTimes(1);
    expect(createUrl).toHaveBeenCalledWith(blob);

    // createElement('a') called at least once and we can find the constructed
    // anchor in the call results.
    const anchorCalls = createElementSpy.mock.calls.filter(([tag]) => tag === "a");
    expect(anchorCalls.length).toBe(1);
    const anchor = createElementSpy.mock.results.find(
      (r) => r.type === "return" && (r.value as HTMLElement).tagName === "A",
    )?.value as HTMLAnchorElement | undefined;
    expect(anchor).toBeDefined();
    expect(anchor!.download).toBe("test.jsonl");
    expect(anchor!.href).toBe(fakeUrl);

    // click() called exactly once.
    expect(clickSpy).toHaveBeenCalledTimes(1);

    // revokeObjectURL called exactly once with the same URL, AFTER click.
    expect(revokeUrl).toHaveBeenCalledTimes(1);
    expect(revokeUrl).toHaveBeenCalledWith(fakeUrl);
    expect(callOrder).toEqual(["click", "revoke"]);

    // Anchor must not remain attached to the document body.
    expect(document.body.contains(anchor!)).toBe(false);
  });
});
