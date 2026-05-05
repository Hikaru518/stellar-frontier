import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Condition } from "../../../../pc-client/src/events/types";
import type { EventDraftEnvelope } from "../types";
import {
  conditionHandlerOptions,
  triggerCapabilities,
} from "./capabilityCatalog";
import CapabilityCatalogPanel from "./CapabilityCatalogPanel";
import { createDefaultNewDraftEnvelope } from "./draftEnvelope";
import { eventAuthoringReducer } from "./eventAuthoringReducer";
import TriggerStep from "./TriggerStep";

const CREATED_AT = "2026-05-05T15:30:12.000Z";

describe("TriggerStep", () => {
  afterEach(() => {
    cleanup();
  });

  it("lists every trigger capability type and applies registry defaults when the trigger type changes", () => {
    const onDraftChange = vi.fn();
    const existingCondition: Condition = { type: "world_flag_equals", field: "bridge_ready", value: true };

    render(
      <TriggerStepHarness
        draft={createDraft({
          working_definition: {
            ...createDraft().working_definition,
            trigger: {
              type: "arrival",
              required_context: ["crew_id"],
              conditions: [existingCondition],
              probability: { base: 0.25 },
            },
          },
        })}
        onDraftChange={onDraftChange}
      />,
    );

    const triggerTypeSelect = screen.getByLabelText("Trigger type") as HTMLSelectElement;
    expect(Array.from(triggerTypeSelect.options).map((option) => option.value)).toEqual(
      triggerCapabilities.map((capability) => capability.type),
    );

    fireEvent.change(triggerTypeSelect, { target: { value: "call_choice" } });

    expect(onDraftChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        working_definition: expect.objectContaining({
          trigger: {
            type: "call_choice",
            required_context: getTriggerTemplate("call_choice").required_context,
            conditions: [existingCondition],
            probability: { base: 0.25 },
          },
        }),
      }),
    );
  });

  it("edits required_context and probability while rejecting invalid probability input", () => {
    const onDraftChange = vi.fn();

    render(
      <TriggerStepHarness
        draft={createDraft({
          working_definition: {
            ...createDraft().working_definition,
            trigger: {
              type: "arrival",
              conditions: [],
              probability: { base: 0.5 },
            },
          },
        })}
        onDraftChange={onDraftChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Required context"), {
      target: { value: "crew_id, tile_id, , call_id" },
    });
    expect(onDraftChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        working_definition: expect.objectContaining({
          trigger: expect.objectContaining({ required_context: ["crew_id", "tile_id", "call_id"] }),
        }),
      }),
    );

    const callCountBeforeInvalidProbability = onDraftChange.mock.calls.length;
    const probabilityInput = screen.getByLabelText("Probability base");
    fireEvent.change(probabilityInput, { target: { value: "not-a-number" } });

    expect(probabilityInput).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Probability base must be a valid number.");
    expect(onDraftChange).toHaveBeenCalledTimes(callCountBeforeInvalidProbability);

    fireEvent.change(probabilityInput, { target: { value: "0.75" } });
    expect(onDraftChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        working_definition: expect.objectContaining({
          trigger: expect.objectContaining({ probability: { base: 0.75 } }),
        }),
      }),
    );
  });

  it("inserts condition templates at the selected trigger condition position and supports updates and removal", () => {
    const onDraftChange = vi.fn();
    const firstCondition: Condition = { type: "time_compare", op: "gte", value: 0 };
    const secondCondition: Condition = { type: "world_flag_equals", field: "bridge_ready", value: false };

    render(
      <TriggerAuthoringHarness
        draft={createDraft({
          working_definition: {
            ...createDraft().working_definition,
            trigger: {
              type: "arrival",
              conditions: [firstCondition, secondCondition],
            },
          },
        })}
        onDraftChange={onDraftChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Condition insert position"), { target: { value: "1" } });
    fireEvent.click(
      within(screen.getByLabelText("Capability catalog")).getByRole("button", {
        name: "Insert Has tag template",
      }),
    );

    expect(onDraftChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        working_definition: expect.objectContaining({
          trigger: expect.objectContaining({
            conditions: [
              firstCondition,
              { type: "has_tag", target: { type: "primary_crew" }, value: "TODO_TAG" },
              secondCondition,
            ],
          }),
        }),
      }),
    );

    fireEvent.change(screen.getByLabelText("Condition 2 field"), { target: { value: "tags" } });
    fireEvent.change(screen.getByLabelText("Condition 2 value"), { target: { value: "bridge_scout" } });
    expect(onDraftChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        working_definition: expect.objectContaining({
          trigger: expect.objectContaining({
            conditions: [
              firstCondition,
              { type: "has_tag", target: { type: "primary_crew" }, field: "tags", value: "bridge_scout" },
              secondCondition,
            ],
          }),
        }),
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove condition 2" }));
    expect(onDraftChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        working_definition: expect.objectContaining({
          trigger: expect.objectContaining({ conditions: [firstCondition, secondCondition] }),
        }),
      }),
    );
  });

  it("edits handler_condition handler type and params object with validation", () => {
    const onDraftChange = vi.fn();
    const initialHandlerType = conditionHandlerOptions[0]?.value ?? "TODO_HANDLER";
    const nextHandlerType = conditionHandlerOptions[1]?.value ?? initialHandlerType;

    render(
      <TriggerStepHarness
        draft={createDraft({
          working_definition: {
            ...createDraft().working_definition,
            trigger: {
              type: "arrival",
              conditions: [{ type: "handler_condition", handler_type: initialHandlerType, params: {} }],
            },
          },
        })}
        onDraftChange={onDraftChange}
      />,
    );

    const handlerTypeSelect = screen.getByLabelText("Condition 1 handler type") as HTMLSelectElement;
    expect(Array.from(handlerTypeSelect.options).map((option) => option.value).filter(Boolean)).toEqual(
      conditionHandlerOptions.map((option) => option.value),
    );

    fireEvent.change(handlerTypeSelect, { target: { value: nextHandlerType } });
    expect(onDraftChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        working_definition: expect.objectContaining({
          trigger: expect.objectContaining({
            conditions: [{ type: "handler_condition", handler_type: nextHandlerType, params: {} }],
          }),
        }),
      }),
    );

    const callCountBeforeInvalidParams = onDraftChange.mock.calls.length;
    const paramsInput = screen.getByLabelText("Condition 1 params object");
    fireEvent.change(paramsInput, { target: { value: "{" } });

    expect(paramsInput).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Params object must be valid JSON.");
    expect(onDraftChange).toHaveBeenCalledTimes(callCountBeforeInvalidParams);

    fireEvent.change(paramsInput, { target: { value: "{\"min_signal\":2}" } });
    expect(onDraftChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        working_definition: expect.objectContaining({
          trigger: expect.objectContaining({
            conditions: [{ type: "handler_condition", handler_type: nextHandlerType, params: { min_signal: 2 } }],
          }),
        }),
      }),
    );
  });
});

function TriggerStepHarness({
  draft,
  onDraftChange,
}: {
  draft: EventDraftEnvelope;
  onDraftChange: (draft: EventDraftEnvelope) => void;
}) {
  const [currentDraft, setCurrentDraft] = useState(draft);
  const conditions = currentDraft.working_definition.trigger?.conditions ?? [];
  const [conditionInsertIndex, setConditionInsertIndex] = useState(conditions.length);

  return (
    <TriggerStep
      draft={currentDraft}
      conditionInsertIndex={Math.min(conditionInsertIndex, conditions.length)}
      onConditionInsertIndexChange={setConditionInsertIndex}
      onDraftChange={(nextDraft) => {
        setCurrentDraft(nextDraft);
        onDraftChange(nextDraft);
      }}
    />
  );
}

function TriggerAuthoringHarness({
  draft,
  onDraftChange,
}: {
  draft: EventDraftEnvelope;
  onDraftChange: (draft: EventDraftEnvelope) => void;
}) {
  const [currentDraft, setCurrentDraft] = useState(draft);
  const conditions = currentDraft.working_definition.trigger?.conditions ?? [];
  const [conditionInsertIndex, setConditionInsertIndex] = useState(conditions.length);
  const resolvedInsertIndex = Math.min(conditionInsertIndex, conditions.length);

  return (
    <>
      <TriggerStep
        draft={currentDraft}
        conditionInsertIndex={resolvedInsertIndex}
        onConditionInsertIndexChange={setConditionInsertIndex}
        onDraftChange={(nextDraft) => {
          setCurrentDraft(nextDraft);
          onDraftChange(nextDraft);
        }}
      />
      <CapabilityCatalogPanel
        onInsertConditionTemplate={(condition) => {
          const nextDraft = eventAuthoringReducer(currentDraft, {
            type: "add_trigger_condition",
            condition,
            index: resolvedInsertIndex,
          });

          setCurrentDraft(nextDraft);
          setConditionInsertIndex(resolvedInsertIndex + 1);
          onDraftChange(nextDraft);
        }}
      />
    </>
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

function getTriggerTemplate(triggerType: string) {
  const capability = triggerCapabilities.find((candidate) => candidate.type === triggerType);

  if (!capability) {
    throw new Error(`Expected trigger capability ${triggerType}.`);
  }

  return capability.template;
}
