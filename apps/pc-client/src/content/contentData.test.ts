import { describe, expect, it } from "vitest";
import type { CallActionDef } from "./contentData";

describe("call-actions content exports", () => {
  it("exports typed call actions from basic and object content", async () => {
    const contentData = (await import("./contentData")) as unknown as {
      callActionsContent?: CallActionDef[];
    };

    expect(contentData.callActionsContent?.map((action) => action.id)).toEqual(
      expect.arrayContaining(["survey", "move", "standby", "stop", "gather", "build", "extract", "scan"]),
    );
    expect(contentData.callActionsContent?.find((action) => action.id === "stop")).toMatchObject({
      category: "universal",
      availableWhenBusy: true,
    });
    expect(contentData.callActionsContent?.filter((action) => action.category === "object_action")).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "gather", applicableObjectKinds: expect.any(Array) })]),
    );
  });
});
