import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("Editor App", () => {
  it("renders the event editor shell with future editors disabled", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Game Editor" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Event Editor" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Character Editor" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Map Editor" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Item Editor" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "NPC Editor" })).toBeDisabled();
    expect(screen.getByText("RJSF schema form layer ready")).toBeInTheDocument();
  });
});
