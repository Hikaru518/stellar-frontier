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

  it("lists validation issues and invokes jump handling for tile targets", () => {
    const onIssueSelect = vi.fn();
    const errors: MapValidationIssue[] = [
      {
        severity: "error",
        code: "unknown_object_id",
        message: "Tile references missing object.",
        target: { kind: "tile", tileId: "2-3", field: "objectIds" },
      },
    ];

    render(<ValidationPanel errors={errors} warnings={[]} onIssueSelect={onIssueSelect} />);

    const panel = screen.getByLabelText("Validation panel");
    expect(within(panel).getByText("1 errors")).toBeInTheDocument();
    expect(within(panel).getByText("unknown_object_id")).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button"));

    expect(onIssueSelect).toHaveBeenCalledWith(errors[0]);
  });

  it("can derive tile ids from helper issue paths", () => {
    expect(getIssueTileId({ severity: "error", code: "x", message: "x", path: "tiles/1-2/objectIds/0" })).toBe("1-2");
  });
});
