import { useState, type ComponentProps } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createInitialMapState, initialCrew, initialLogs, initialTiles } from "../data/gameData";
import { DEFAULT_MAP_LAYER_VISIBILITY, MapPage } from "./MapPage";

const RADAR_WORLD_SIZE = 256;
const MIN_VISIBLE_CELLS = 80;
const DEFAULT_VIEWPORT = {
  left: (RADAR_WORLD_SIZE - MIN_VISIBLE_CELLS) / 2,
  top: (RADAR_WORLD_SIZE - MIN_VISIBLE_CELLS) / 2,
  width: MIN_VISIBLE_CELLS,
  height: MIN_VISIBLE_CELLS,
};

describe("MapPage", () => {
  it("renders a single interactive terrain map surface after the header", () => {
    renderMapPage();

    expect(screen.getByRole("heading", { name: "卫星雷达地图" })).toBeInTheDocument();
    expect(screen.getByLabelText("地形地图")).toBeInTheDocument();
    expect(screen.getByText("render + function + crew + debug / 256 x 256")).toBeInTheDocument();
  });

  it("does not render the old quest sidebar UI", () => {
    renderMapPage();

    expect(screen.queryByRole("button", { name: "展开任务" })).not.toBeInTheDocument();
    expect(screen.queryByText("最近更新")).not.toBeInTheDocument();
  });

  it("keeps crew action buttons visible in the left rail", () => {
    renderMapPage();

    expect(screen.getAllByRole("button", { name: "查看状态" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "查看背包" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "通话" }).length).toBeGreaterThan(0);
  });

  it("routes crew status and inventory requests to the crew page handlers", () => {
    const onShowCrewStatus = vi.fn();
    const onShowCrewInventory = vi.fn();
    renderMapPage({ onShowCrewStatus, onShowCrewInventory });

    fireEvent.click(screen.getAllByRole("button", { name: "查看状态" })[0]!);
    fireEvent.click(screen.getAllByRole("button", { name: "查看背包" })[0]!);

    expect(onShowCrewStatus).toHaveBeenCalledWith(initialCrew[0].id);
    expect(onShowCrewInventory).toHaveBeenCalledWith(initialCrew[0].id);
  });

  it("records map interaction info in the right trace panel", () => {
    renderMapPage();

    const mapSurface = screen.getByLabelText("地形地图");
    Object.defineProperty(mapSurface, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 900, height: 700, right: 900, bottom: 700, x: 0, y: 0, toJSON: () => ({}) }),
    });
    fireEvent.click(mapSurface, { clientX: 220, clientY: 180 });
    expect(screen.getAllByText(/^\[FOCUS\]/).length).toBeGreaterThan(0);
  });

  it("caps the minimum zoom at an 80-cell radar viewport instead of sampling outside the radar", () => {
    renderMapPage();

    const mapSurface = screen.getByLabelText("地形地图");
    Object.defineProperty(mapSurface, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 900, height: 700, right: 900, bottom: 700, x: 0, y: 0, toJSON: () => ({}) }),
    });

    fireEvent.wheel(mapSurface, { deltaY: 480 });
    fireEvent.click(mapSurface, { clientX: 800, clientY: 560 });

    expect(mapSurface).toHaveAttribute("data-focus-tile-id", "153-160");
    expect(screen.queryByText(/\[ZOOM\] 0\./)).not.toBeInTheDocument();
  });

  it("keeps the terrain base image aligned with overlay layers while zoomed", () => {
    const { container } = renderMapPage({ viewportState: { zoom: 2, center: { x: 128, y: 128 } } });

    const terrainImage = container.querySelector(".console-terrain-map-image") as HTMLImageElement | null;
    expect(terrainImage).not.toBeNull();
    expect(terrainImage).toHaveStyle({
      width: "320%",
      height: "320%",
      transform: "translate(-34.375%, -34.375%)",
    });
  });

  it("uses center-origin display coordinates for the function layer", () => {
    renderMapPage();

    expect(screen.getAllByText("(0,0)").length).toBeGreaterThan(0);
  });

  it("keeps the map debug layer off by default and toggles it on demand", () => {
    renderMapPage();

    expect(screen.getByText("debug OFF")).toBeInTheDocument();
    expect(screen.getByText(/\[DEBUG\] X=blocked/)).toBeInTheDocument();
    expect(screen.getByText(/\?=unrevealed \/ I=revealed/)).toBeInTheDocument();
    expect(screen.getByText(/\[DEBUG\] bg blue->yellow \/ orange=unrevealed \/ white=revealed/)).toBeInTheDocument();
    expect(screen.queryByText(/O=object/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "显示调试层" }));

    expect(screen.getByText("debug ON")).toBeInTheDocument();
  });

  it("keeps the map crew layer off by default and toggles it on demand", () => {
    renderMapPage();

    expect(screen.getByText("crew OFF")).toBeInTheDocument();
    expect(screen.getByText(/\[CREW\] cyan marker=当前队员位置/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "显示队员层" }));

    expect(screen.getByText("crew ON")).toBeInTheDocument();
  });

  it("shows selected tile details in the right panel", () => {
    renderMapPage({ initialSelectedTileId: "116-112" });

    expect(screen.getByText("地图详情")).toBeInTheDocument();
    expect(screen.getAllByText("116-112").length).toBeGreaterThan(0);
    expect(screen.getAllByText("奥德赛号坠毁点").length).toBeGreaterThan(0);
    expect(screen.queryByText("(-17,13)")).not.toBeInTheDocument();
    expect(screen.queryByText("地图对象")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("当前可见地图对象")).not.toBeInTheDocument();
    expect(screen.queryByText("未知信号")).not.toBeInTheDocument();
  });

  it("does not render the legacy map object list even when runtime object state exists", () => {
    renderMapPage({ map: createMapWithRevealedOriginObjects(["iafs_generator"]) });

    expect(screen.queryByText("地图对象")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("当前可见地图对象")).not.toBeInTheDocument();
  });

  it("shows the latest system log in the bottom bar", () => {
    renderMapPage();

    expect(screen.getByText(initialLogs[initialLogs.length - 1].text)).toBeInTheDocument();
  });

  it("shows visible feature hits and the actual tile id after selecting a feature footprint", () => {
    const map = createInitialMapState();
    map.featuresById = {
      ...map.featuresById,
      iafs_generator: { id: "iafs_generator", status: "damaged", revealed: true },
    };
    renderMapPage({ map });

    focusMapTile("116-112");

    const readout = within(screen.getByLabelText("Feature 命中结果"));
    expect(screen.getByText(/\[TILE\] 116-112/)).toBeInTheDocument();
    expect(readout.getByText("发电机")).toBeInTheDocument();
    expect(readout.getByText("奥德赛号坠毁点")).toBeInTheDocument();
    expect(readout.getByText("可调查")).toBeInTheDocument();
    expect(readout.getByText("背景")).toBeInTheDocument();
  });

  it("shows the moved 2x2 scattered supplies footprint", () => {
    const map = createInitialMapState();
    map.featuresById = {
      ...map.featuresById,
      iafs_scattered_supplies: { id: "iafs_scattered_supplies", status: "unsearched", revealed: true },
    };
    renderMapPage({ map });

    focusMapTile("120-117");

    const readout = within(screen.getByLabelText("Feature 命中结果"));
    expect(readout.getByText("散落的物资")).toBeInTheDocument();
    expect(readout.getByText("可调查")).toBeInTheDocument();
    expect(readout.queryByText("背景")).not.toBeInTheDocument();

    focusMapTile("121-118");
    expect(within(screen.getByLabelText("Feature 命中结果")).getByText("散落的物资")).toBeInTheDocument();
  });

  it("keeps tile terrain and weather readout for blank tiles without visible features", () => {
    renderMapPage({ viewportState: { zoom: RADAR_WORLD_SIZE / MIN_VISIBLE_CELLS, center: { x: 39, y: 39 } } });

    focusMapTile("1-1", { left: 0, top: 0, width: MIN_VISIBLE_CELLS, height: MIN_VISIBLE_CELLS });

    expect(screen.getByText(/\[TILE\] 1-1 \/ 平原 \/ 晴朗/)).toBeInTheDocument();
    expect(screen.getByText(/\[FEATURE\] 无可见 Feature/)).toBeInTheDocument();
    expect(screen.getAllByText("野外").length).toBeGreaterThan(0);
  });

  it("shows call map actions in the upper details panel instead of the trace panel", () => {
    renderMapPage({
      returnTarget: "call",
      moveSelectionCrewId: initialCrew[0].id,
    });

    const detailPanel = screen.getByText("地图详情").closest("section");
    const tracePanel = screen.getByText("map trace").closest("section");

    expect(detailPanel).toBeTruthy();
    expect(tracePanel).toBeTruthy();
    expect(within(detailPanel as HTMLElement).getByRole("button", { name: "标记当前坐标" })).toBeInTheDocument();
    expect(within(detailPanel as HTMLElement).getByRole("button", { name: "返回当前通话" })).toBeInTheDocument();
    expect(within(tracePanel as HTMLElement).queryByRole("button", { name: "标记当前坐标" })).not.toBeInTheDocument();
    expect(within(tracePanel as HTMLElement).queryByRole("button", { name: "返回当前通话" })).not.toBeInTheDocument();
  });

  it("returns only the selected tile id when marking a coordinate from a call", () => {
    const onSelectMoveTarget = vi.fn();
    renderMapPage({
      returnTarget: "call",
      moveSelectionCrewId: initialCrew[0].id,
      onSelectMoveTarget,
    });

    focusMapTile("130-130");
    fireEvent.click(screen.getByRole("button", { name: "标记当前坐标" }));

    expect(onSelectMoveTarget).toHaveBeenCalledTimes(1);
    expect(onSelectMoveTarget).toHaveBeenCalledWith("130-130");
  });
});

function focusMapTile(tileId: string, viewport = DEFAULT_VIEWPORT) {
  const [rowText, colText] = tileId.split("-");
  const row = Number(rowText);
  const col = Number(colText);
  const worldX = col - 1;
  const worldY = row - 1;
  const mapSurface = screen.getByLabelText("地形地图");
  Object.defineProperty(mapSurface, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ left: 0, top: 0, width: 900, height: 700, right: 900, bottom: 700, x: 0, y: 0, toJSON: () => ({}) }),
  });

  fireEvent.click(mapSurface, {
    clientX: ((worldX - viewport.left + 0.5) / viewport.width) * 900,
    clientY: ((worldY - viewport.top + 0.5) / viewport.height) * 700,
  });
}

function renderMapPage(overrides: Partial<ComponentProps<typeof MapPage>> = {}) {
  return render(
    <StatefulMapPage
      tiles={initialTiles}
      crew={initialCrew}
      crewActions={{}}
      activeCalls={{}}
      elapsedGameSeconds={0}
      gameTimeLabel="第 1 日 00 小时 00 分钟 00 秒"
      returnTarget="control"
      map={createInitialMapState()}
      layerVisibility={DEFAULT_MAP_LAYER_VISIBILITY}
      onLayerVisibilityChange={vi.fn()}
      onOpenControl={vi.fn()}
      onOpenTask={vi.fn()}
      onReturnFromMap={vi.fn()}
      onSelectMoveTarget={vi.fn()}
      onStartCall={vi.fn()}
      onShowCrewStatus={vi.fn()}
      onShowCrewInventory={vi.fn()}
      logs={initialLogs}
      {...overrides}
    />
  );
}

function StatefulMapPage(props: ComponentProps<typeof MapPage>) {
  const [layerVisibility, setLayerVisibility] = useState(props.layerVisibility);
  return <MapPage {...props} layerVisibility={layerVisibility} onLayerVisibilityChange={setLayerVisibility} />;
}

function createMapWithRevealedOriginObjects(revealedObjectIds: string[]) {
  const map = createInitialMapState();
  return {
    ...map,
    tilesById: {
      ...map.tilesById,
      "129-129": {
        ...(map.tilesById["129-129"] ?? {}),
        discovered: true,
        investigated: true,
        revealedObjectIds,
      },
    },
  };
}
