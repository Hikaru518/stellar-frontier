import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { conditionHandlerOptions, effectHandlerOptions } from "./capabilityCatalog";
import CapabilityCatalogPanel from "./CapabilityCatalogPanel";

describe("CapabilityCatalogPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows trigger metadata and sends the selected trigger template", () => {
    const onSelectTriggerTemplate = vi.fn();

    render(<CapabilityCatalogPanel onSelectTriggerTemplate={onSelectTriggerTemplate} onInsertConditionTemplate={vi.fn()} />);

    const triggerTemplateSelect = screen.getByLabelText("Trigger template");
    fireEvent.change(triggerTemplateSelect, { target: { value: "arrival" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply trigger template" }));

    const arrivalCard = screen.getByLabelText("Trigger capability arrival");
    expect(arrivalCard).toHaveTextContent("Arrival");
    expect(arrivalCard).toHaveTextContent("arrival");
    expect(arrivalCard).toHaveTextContent("Runs when a crew member arrives at a map tile.");
    expect(arrivalCard).toHaveTextContent("Required fields");
    expect(arrivalCard).toHaveTextContent("type");
    expect(arrivalCard).toHaveTextContent("Required context");
    expect(arrivalCard).toHaveTextContent("crew_id, tile_id");
    expect(arrivalCard).toHaveTextContent("Common use");
    expect(arrivalCard).toHaveTextContent("Start tile-local discoveries, hazards, or call-ins after movement completes.");

    expect(onSelectTriggerTemplate).toHaveBeenCalledWith({
      type: "arrival",
      required_context: ["crew_id", "tile_id"],
      conditions: [],
    });
  });

  it("shows condition metadata and sends the selected condition template", () => {
    const onInsertConditionTemplate = vi.fn();

    render(<CapabilityCatalogPanel onSelectTriggerTemplate={vi.fn()} onInsertConditionTemplate={onInsertConditionTemplate} />);

    const handlerCard = screen.getByLabelText("Condition capability handler_condition");
    expect(handlerCard).toHaveTextContent("Handler condition");
    expect(handlerCard).toHaveTextContent("handler_condition");
    expect(handlerCard).toHaveTextContent("Evaluates a registered condition handler with optional target and params.");
    expect(handlerCard).toHaveTextContent("Required fields");
    expect(handlerCard).toHaveTextContent("handler_type, params");
    expect(handlerCard).toHaveTextContent("Common use");
    expect(handlerCard).toHaveTextContent("Use bespoke runtime checks while keeping editor choices limited to condition handlers.");

    fireEvent.click(within(handlerCard).getByRole("button", { name: "Insert Handler condition template" }));

    expect(onInsertConditionTemplate).toHaveBeenCalledWith({
      type: "handler_condition",
      handler_type: conditionHandlerOptions[0]?.value ?? "TODO_HANDLER",
      params: {},
    });
  });

  it("shows effect metadata and sends the selected effect template", () => {
    const onInsertEffectTemplate = vi.fn();

    render(<CapabilityCatalogPanel activeKind="effects" onInsertEffectTemplate={onInsertEffectTemplate} />);

    const effectTemplateSelect = screen.getByLabelText("Effect template");
    fireEvent.change(effectTemplateSelect, { target: { value: "handler_effect" } });
    fireEvent.click(screen.getByRole("button", { name: "Insert effect template" }));

    const handlerCard = screen.getByLabelText("Effect capability handler_effect");
    expect(handlerCard).toHaveTextContent("Handler effect");
    expect(handlerCard).toHaveTextContent("handler_effect");
    expect(handlerCard).toHaveTextContent("Executes a registered effect handler with optional target and params.");
    expect(handlerCard).toHaveTextContent("Required fields");
    expect(handlerCard).toHaveTextContent("id, type, target, params, failure_policy, record_policy, handler_type");
    expect(handlerCard).toHaveTextContent("Common use");
    expect(handlerCard).toHaveTextContent("Use bespoke runtime effects while keeping editor choices limited to effect handlers.");

    expect(onInsertEffectTemplate).toHaveBeenCalledWith({
      id: "handler_effect",
      type: "handler_effect",
      target: { type: "world_flags" },
      params: {},
      failure_policy: "fail_event",
      record_policy: {
        write_event_log: false,
        write_world_history: false,
      },
      handler_type: effectHandlerOptions[0]?.value ?? "TODO_HANDLER",
    });
  });
});
