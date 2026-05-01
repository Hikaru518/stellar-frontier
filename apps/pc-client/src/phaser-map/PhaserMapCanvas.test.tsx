import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  PHASER_MAP_VIEW_HEIGHT,
  PHASER_MAP_VIEW_WIDTH,
  PhaserMapCanvas,
  createMapGameConfig,
  createSceneState,
  destroyPhaserGame,
  notifyMapSceneState,
  resizePhaserGame,
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

  it("registers a standard Phaser scene class with a fixed initial viewport", () => {
    const state = createSceneState(propsWithTiles([tileView("1-1")]));
    const stateRef = { current: state };

    class FakeScene {
      constructor(readonly config: { key: string }) {}
    }
    const config = createMapGameConfig({ AUTO: "AUTO", Scene: FakeScene }, document.createElement("div"), stateRef);

    expect(config).toMatchObject({
      type: "AUTO",
      parent: expect.any(HTMLDivElement),
      width: PHASER_MAP_VIEW_WIDTH,
      height: PHASER_MAP_VIEW_HEIGHT,
    });
    expect(config.scene).toEqual(expect.any(Function));
    expect(config.scene).not.toBeInstanceOf(MapScene);
  });

  it("resizes the Phaser game only for non-zero changed viewport sizes", () => {
    const resize = vi.fn();
    const game: PhaserGameLike = { destroy: vi.fn(), scale: { resize } };
    const previousSize = { current: null };

    expect(resizePhaserGame(game, { width: 0, height: 430 }, previousSize)).toBe(false);
    expect(resizePhaserGame(game, { width: 640.4, height: 430.6 }, previousSize)).toBe(true);
    expect(resizePhaserGame(game, { width: 640.4, height: 430.6 }, previousSize)).toBe(false);

    expect(resize).toHaveBeenCalledOnce();
    expect(resize).toHaveBeenCalledWith(640, 431);
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
