import { describe, expect, it } from "vitest";
import { DEFAULT_YUAN_HOST_URL, resolveConfiguredYuanHostUrl } from "./yuanHostConfig";

describe("yuanHostConfig", () => {
  it("uses the remote Yuan Host default unless an override is configured", () => {
    expect(DEFAULT_YUAN_HOST_URL).toBe("ws://8.159.128.125:8888/");
    expect(resolveConfiguredYuanHostUrl()).toBe("ws://8.159.128.125:8888/");
    expect(resolveConfiguredYuanHostUrl("ws://localhost:8888/")).toBe("ws://localhost:8888/");
  });
});
