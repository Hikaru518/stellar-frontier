import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

describe("Editor App", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(createLibraryResponse()), { status: 200 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the event editor shell with future editors disabled", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Game Editor" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Event Editor" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Character Editor" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Map Editor" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Item Editor" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "NPC Editor" })).toBeDisabled();
    expect(screen.getByText("Loading event library...")).toBeInTheDocument();
  });
});

function createLibraryResponse() {
  return {
    manifest: { schema_version: "event-manifest.v1", domains: [] },
    domains: [],
    definitions: [],
    call_templates: [],
    handlers: [],
    presets: [],
    legacy_events: [],
    schemas: {},
    validation: { passed: true, issues: [] },
  };
}
