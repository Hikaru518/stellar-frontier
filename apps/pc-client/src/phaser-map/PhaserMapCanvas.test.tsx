import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  PhaserMapCanvas,
  createMapGameConfig,
  createSceneState,
  destroyPhaserGame,
  notifyMapSceneState,
  type PhaserGameLike,
  type PhaserMapCanvasProps,
} from "./PhaserMapCanvas";
import { MapScene } from "./MapScene";

describe("PhaserMapCanvas", () => {
  it("renders the Phaser stage and non-interactive semantic fallback layer", () => {
    const { container } = render(<PhaserMapCanvas {...propsWithTiles([tileView("1-1")])} />);

    expect(container.querySelector(".phaser-map-stage")).toBeInTheDocument();
    const fallback = container.querySelector(".phaser-map-fallback");
    expect(fallback).toBeInTheDocument();
    expect(getComputedStyle(fallback as Element).pointerEvents).toBe("none");
    expect(screen.getByRole("button", { name: /营地/ })).toBeInTheDocument();
  });

  it("does not create a Phaser game while Vitest runs in test mode", () => {
    const gameFactory = vi.fn();

    render(<PhaserMapCanvas {...propsWithTiles([tileView("1-1")])} gameFactory={gameFactory} />);

    expect(gameFactory).not.toHaveBeenCalled();
  });

  it("builds scene state with columns and tile selection without leaking test factory", () => {
    const onSelectTile = vi.fn();
    const gameFactory = vi.fn();

    const state = createSceneState({ ...propsWithTiles([tileView("1-1")]), onSelectTile, gameFactory });

    expect(state).toMatchObject({ columns: 3, tileViews: [expect.objectContaining({ id: "1-1" })], crewMarkers: [] });
    expect(state.onSelectTile).toBe(onSelectTile);
    expect(state.setZoomLevelInReact).toEqual(expect.any(Function));
    expect("gameFactory" in state).toBe(false);
  });

  it("registers MapScene in the Phaser game config with access to the state ref", () => {
    const state = createSceneState(propsWithTiles([tileView("1-1")]));
    const stateRef = { current: state };

    const config = createMapGameConfig({ AUTO: "AUTO" }, document.createElement("div"), stateRef);

    expect(config).toMatchObject({ type: "AUTO", parent: expect.any(HTMLDivElement) });
    expect(config.scene).toEqual([expect.any(MapScene)]);
    expect((config.scene as MapScene[])[0]?.getState()).toBe(state);
  });

  it("destroys an initialized Phaser game with child canvas cleanup", () => {
    const game: PhaserGameLike = { destroy: vi.fn() };

    destroyPhaserGame(game);

    expect(game.destroy).toHaveBeenCalledWith(true);
  });

  it("notifies MapScene of state changes and tolerates a missing scene", () => {
    const props = propsWithTiles([tileView("1-1")]);
    const previousState = createSceneState(props);
    const nextState = createSceneState(propsWithTiles([tileView("2-2")]));
    const updateState = vi.fn();
    const readyGame: PhaserGameLike = {
      destroy: vi.fn(),
      scene: { getScene: () => ({ updateState }) },
    };
    const missingSceneGame: PhaserGameLike = {
      destroy: vi.fn(),
      scene: { getScene: () => null },
    };

    expect(() => notifyMapSceneState(missingSceneGame, previousState)).not.toThrow();
    notifyMapSceneState(readyGame, nextState, previousState);

    expect(updateState).toHaveBeenCalledWith(expect.objectContaining({ columns: 3, tileViews: [expect.objectContaining({ id: "2-2" })] }));
  });
});

function propsWithTiles(tileViews: PhaserMapCanvasProps["tileViews"]): PhaserMapCanvasProps {
  return {
    columns: 3,
    tileViews,
    crewMarkers: [],
    onSelectTile: vi.fn(),
  };
}

function tileView(id: string): PhaserMapCanvasProps["tileViews"][number] {
  return {
    id,
    row: 0,
    col: 0,
    displayCoord: "(0,0)",
    status: "discovered",
    fillColor: "#2f8f46",
    tooltip: "营地 | 森林 | (0,0)",
    label: "营地",
    terrain: "森林",
    semanticLines: ["营地", "森林"],
    crewLabels: [],
    isDanger: false,
    isRoute: false,
    isSelected: false,
    isTarget: false,
  };
}
