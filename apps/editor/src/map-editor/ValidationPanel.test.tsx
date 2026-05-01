import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ValidationPanel, { getIssueTileId } from "./ValidationPanel";
import type { MapValidationIssue } from "./apiClient";

describe("ValidationPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows an empty valid state", () => {
    render(<ValidationPanel errors={[]} warnings={[]} onIssueSelect={vi.fn()} />);

    expect(screen.getByLabelText("Validation panel")).toHaveTextContent("Valid");
    expect(screen.getByText("No validation issues reported.")).toBeInTheDocument();
  });

  it("lists validation issues and invokes jump handling for tile and layer targets", () => {
    const onIssueSelect = vi.fn();
    const errors: MapValidationIssue[] = [
      {
        severity: "error",
        code: "unknown_visual_cell_tile",
        message: "Visual cell references missing tile.",
        target: { kind: "cell", tileId: "2-3", layerId: "base" },
      },
    ];

    render(<ValidationPanel errors={errors} warnings={[]} onIssueSelect={onIssueSelect} />);

    const panel = screen.getByLabelText("Validation panel");
    expect(within(panel).getByText("1 errors")).toBeInTheDocument();
    expect(within(panel).getByText("unknown_visual_cell_tile")).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button"));

    expect(onIssueSelect).toHaveBeenCalledWith(errors[0]);
  });

  it("can derive tile ids from helper issue paths", () => {
    expect(getIssueTileId({ severity: "error", code: "x", message: "x", path: "visual.layers[0].cells.1-2" })).toBe("1-2");
  });
});
