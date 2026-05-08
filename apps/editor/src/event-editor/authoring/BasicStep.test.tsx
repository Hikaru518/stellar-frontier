import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EventDraftEnvelope } from "../types";
import BasicStep from "./BasicStep";
import { createDefaultNewDraftEnvelope } from "./draftEnvelope";

const CREATED_AT = "2026-05-05T15:30:12.000Z";

describe("BasicStep", () => {
  afterEach(() => {
    cleanup();
  });

  it("edits title, summary, tags, candidate selection, and repeat policy through the reducer", () => {
    const onDraftChange = vi.fn();

    render(<BasicStepHarness draft={createDraft()} onDraftChange={onDraftChange} />);

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Revised bridge choice" } });
    expect(onDraftChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        working_definition: expect.objectContaining({ title: "Revised bridge choice" }),
      }),
    );

    fireEvent.change(screen.getByLabelText("Summary"), {
      target: { value: "Choose whether to cross, repair, or retreat." },
    });
    expect(onDraftChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        working_definition: expect.objectContaining({ summary: "Choose whether to cross, repair, or retreat." }),
      }),
    );

    fireEvent.change(screen.getByLabelText("Tags"), { target: { value: " bridge, crew_choice, , urgent " } });
    expect(onDraftChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        working_definition: expect.objectContaining({ tags: ["bridge", "crew_choice", "urgent"] }),
      }),
    );

    const candidate = screen.getByRole("group", { name: "Candidate selection" });
    fireEvent.change(within(candidate).getByLabelText("Priority"), { target: { value: "12" } });
    fireEvent.change(within(candidate).getByLabelText("Weight"), { target: { value: "3.5" } });
    fireEvent.change(within(candidate).getByLabelText("Mutex group"), { target: { value: "forest_bridge" } });
    fireEvent.change(within(candidate).getByLabelText("Max instances per trigger"), { target: { value: "2" } });
    fireEvent.click(within(candidate).getByLabelText("Requires blocking slot"));
    expect(onDraftChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        working_definition: expect.objectContaining({
          candidate_selection: {
            priority: 12,
            weight: 3.5,
            mutex_group: "forest_bridge",
            max_instances_per_trigger: 2,
            requires_blocking_slot: true,
          },
        }),
      }),
    );

    const repeat = screen.getByRole("group", { name: "Repeat policy" });
    fireEvent.change(within(repeat).getByLabelText("Scope"), { target: { value: "crew_tile" } });
    fireEvent.change(within(repeat).getByLabelText("Max trigger count"), { target: { value: "4" } });
    fireEvent.change(within(repeat).getByLabelText("Cooldown seconds"), { target: { value: "90" } });
    fireEvent.change(within(repeat).getByLabelText("History key template"), {
      target: { value: "bridge:{crew_id}:{tile_id}" },
    });
    fireEvent.click(within(repeat).getByLabelText("Allow while active"));
    expect(onDraftChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        working_definition: expect.objectContaining({
          repeat_policy: {
            scope: "crew_tile",
            max_trigger_count: 4,
            cooldown_seconds: 90,
            history_key_template: "bridge:{crew_id}:{tile_id}",
            allow_while_active: true,
          },
        }),
      }),
    );
  });

  it("keeps edit-existing identity controls disabled and visibly locked", () => {
    render(<BasicStep draft={{ ...createDraft(), mode: "edit_existing" }} onDraftChange={vi.fn()} />);

    expect(screen.getByLabelText("Domain")).toBeDisabled();
    expect(screen.getByLabelText("Definition id")).toBeDisabled();
    expect(screen.getByLabelText("Draft identity")).toHaveTextContent("Locked");
  });

  it("shows a field error and does not update the draft for invalid numeric input", () => {
    const onDraftChange = vi.fn();
    const draft = createDraft();

    render(<BasicStep draft={draft} onDraftChange={onDraftChange} />);

    const priorityInput = within(screen.getByRole("group", { name: "Candidate selection" })).getByLabelText("Priority");
    fireEvent.change(priorityInput, { target: { value: "not-a-number" } });

    expect(priorityInput).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Priority must be a valid number.");
    expect(onDraftChange).not.toHaveBeenCalled();
    expect(draft.working_definition.candidate_selection?.priority).toBe(0);
  });

  it("maps blank optional fields to null without losing surrounding nested fields", () => {
    const onDraftChange = vi.fn();

    render(
      <BasicStepHarness
        draft={createDraft({
          working_definition: {
            ...createDraft().working_definition,
            candidate_selection: {
              priority: 12,
              weight: 3,
              mutex_group: "forest_bridge",
              max_instances_per_trigger: 2,
              requires_blocking_slot: true,
            },
            repeat_policy: {
              scope: "crew",
              max_trigger_count: 5,
              cooldown_seconds: 60,
              history_key_template: "bridge:{crew_id}",
              allow_while_active: true,
            },
          },
        })}
        onDraftChange={onDraftChange}
      />,
    );

    fireEvent.change(within(screen.getByRole("group", { name: "Candidate selection" })).getByLabelText("Mutex group"), {
      target: { value: " " },
    });
    expect(onDraftChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        working_definition: expect.objectContaining({
          candidate_selection: {
            priority: 12,
            weight: 3,
            mutex_group: null,
            max_instances_per_trigger: 2,
            requires_blocking_slot: true,
          },
        }),
      }),
    );

    fireEvent.change(within(screen.getByRole("group", { name: "Repeat policy" })).getByLabelText("Max trigger count"), {
      target: { value: "" },
    });
    expect(onDraftChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        working_definition: expect.objectContaining({
          repeat_policy: {
            scope: "crew",
            max_trigger_count: null,
            cooldown_seconds: 60,
            history_key_template: "bridge:{crew_id}",
            allow_while_active: true,
          },
        }),
      }),
    );
  });
});

function BasicStepHarness({
  draft,
  onDraftChange,
}: {
  draft: EventDraftEnvelope;
  onDraftChange: (draft: EventDraftEnvelope) => void;
}) {
  const [currentDraft, setCurrentDraft] = useState(draft);

  return (
    <BasicStep
      draft={currentDraft}
      onDraftChange={(nextDraft) => {
        setCurrentDraft(nextDraft);
        onDraftChange(nextDraft);
      }}
    />
  );
}

function createDraft(overrides: Partial<EventDraftEnvelope> = {}): EventDraftEnvelope {
  const draft = createDefaultNewDraftEnvelope({
    domain: "forest",
    definitionId: "forest_bridge_choice",
    title: "Bridge choice",
    summary: "Choose how to cross the bridge.",
    createdAt: CREATED_AT,
  });

  return {
    ...draft,
    ...overrides,
  };
}
