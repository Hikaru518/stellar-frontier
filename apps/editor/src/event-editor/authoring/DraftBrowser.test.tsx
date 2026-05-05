import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DraftBrowser from "./DraftBrowser";
import type { CreateDraftRequest, EventDomainSummary, EventDraftSummary } from "../types";

describe("DraftBrowser", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows active drafts and filters archived drafts by default", () => {
    render(
      <DraftBrowser
        domains={[createDomainSummary("forest")]}
        drafts={[
          createDraftSummary("forest_bridge_choice_20260505_153012", { status: "active", title: "Bridge choice" }),
          createDraftSummary("forest_archived_20260505_153012", { status: "archived", title: "Old archived draft" }),
        ]}
        onOpenDraft={vi.fn()}
        onCreateDraft={vi.fn()}
        onCreateDomain={vi.fn()}
      />,
    );

    const draftList = screen.getByRole("list", { name: "Active drafts" });
    expect(within(draftList).getByText("forest_bridge_choice_20260505_153012")).toBeInTheDocument();
    expect(within(draftList).getByText("Bridge choice")).toBeInTheDocument();
    expect(within(draftList).queryByText("forest_archived_20260505_153012")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Event" })).toBeInTheDocument();
  });

  it("submits a new event draft request from the create event form", () => {
    const onCreateDraft = vi.fn();
    render(
      <DraftBrowser
        domains={[createDomainSummary("forest"), createDomainSummary("ruins")]}
        drafts={[]}
        onOpenDraft={vi.fn()}
        onCreateDraft={onCreateDraft}
        onCreateDomain={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Create event domain"), { target: { value: "ruins" } });
    fireEvent.change(screen.getByLabelText("Definition id"), { target: { value: "ruins_bridge_choice" } });
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Bridge choice" } });
    fireEvent.change(screen.getByLabelText("Summary"), { target: { value: "Choose how to cross the bridge." } });
    fireEvent.click(screen.getByRole("button", { name: "Create Event" }));

    expect(onCreateDraft).toHaveBeenCalledWith({
      mode: "new",
      target_domain: "ruins",
      definition_id: "ruins_bridge_choice",
      title: "Bridge choice",
      summary: "Choose how to cross the bridge.",
    } satisfies CreateDraftRequest);
  });

  it("opens active drafts through the draft row action", () => {
    const onOpenDraft = vi.fn();
    render(
      <DraftBrowser
        domains={[createDomainSummary("forest")]}
        drafts={[createDraftSummary("forest_bridge_choice_20260505_153012")]}
        onOpenDraft={onOpenDraft}
        onCreateDraft={vi.fn()}
        onCreateDomain={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open draft forest_bridge_choice_20260505_153012" }));

    expect(onOpenDraft).toHaveBeenCalledWith("forest_bridge_choice_20260505_153012");
  });
});

function createDomainSummary(id: string): EventDomainSummary {
  return {
    id,
    manifest_path: "content/events/manifest.json",
    manifest_json_path: "/domains/0",
    definitions_file_path: `content/events/definitions/${id}.json`,
    call_templates_file_path: `content/events/call_templates/${id}.json`,
    presets_file_path: null,
    definition_count: 0,
    call_template_count: 0,
    preset_count: 0,
    has_presets: false,
    editable: true,
  };
}

function createDraftSummary(draftId: string, overrides: Partial<EventDraftSummary> = {}): EventDraftSummary {
  return {
    draft_id: draftId,
    mode: "new",
    status: "active",
    file_path: `content/events/drafts/${draftId}.json`,
    domain: "forest",
    definition_id: "forest_bridge_choice",
    target: null,
    source: null,
    title: "Bridge choice",
    summary: "Choose how to cross the bridge.",
    active_step: "basic",
    created_at: "2026-05-05T15:30:12.000Z",
    updated_at: "2026-05-05T15:30:12.000Z",
    published_at: null,
    draft_hash: "a".repeat(64),
    ...overrides,
  };
}
