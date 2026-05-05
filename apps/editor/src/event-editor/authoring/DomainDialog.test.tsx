import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DomainDialog from "./DomainDialog";

describe("DomainDialog", () => {
  afterEach(() => {
    cleanup();
  });

  it("submits a trimmed domain id", () => {
    const onCreateDomain = vi.fn();

    render(
      <DomainDialog
        isOpen={true}
        onCancel={vi.fn()}
        onCreateDomain={onCreateDomain}
      />,
    );

    fireEvent.change(screen.getByLabelText("Domain id"), { target: { value: " ruins " } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(onCreateDomain).toHaveBeenCalledWith("ruins");
  });

  it("shows local and helper errors without closing the dialog", () => {
    render(
      <DomainDialog
        isOpen={true}
        errorMessage="Domain already exists."
        onCancel={vi.fn()}
        onCreateDomain={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(screen.getByText("Domain id is required.")).toBeInTheDocument();
    expect(screen.getByText("Domain already exists.")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Create Domain" })).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(
      <DomainDialog
        isOpen={false}
        onCancel={vi.fn()}
        onCreateDomain={vi.fn()}
      />,
    );

    expect(screen.queryByRole("dialog", { name: "Create Domain" })).not.toBeInTheDocument();
  });
});
