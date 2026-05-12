import type { ComponentProps } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createInitialMapState, initialCrew, initialLogs, initialTiles } from "../data/gameData";
import { MapPage } from "./MapPage";

describe("MapPage", () => {
  it("renders a single interactive ascii map surface after the header", () => {
    renderMapPage();

    expect(screen.getByRole("heading", { name: "卫星雷达地图" })).toBeInTheDocument();
    expect(screen.getByLabelText("ASCII 地图")).toBeInTheDocument();
    expect(screen.getByText("render + function + debug / 256 x 256")).toBeInTheDocument();
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

    const mapSurface = screen.getByLabelText("ASCII 地图");
    Object.defineProperty(mapSurface, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 900, height: 700, right: 900, bottom: 700, x: 0, y: 0, toJSON: () => ({}) }),
    });
    fireEvent.click(mapSurface, { clientX: 220, clientY: 180 });
    expect(screen.getAllByText(/^\[FOCUS\]/).length).toBeGreaterThan(0);
  });

  it("keeps the minimum zoom at full-world coverage instead of sampling outside the radar", () => {
    renderMapPage();

    const mapSurface = screen.getByLabelText("ASCII 地图");
    Object.defineProperty(mapSurface, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 900, height: 700, right: 900, bottom: 700, x: 0, y: 0, toJSON: () => ({}) }),
    });

    fireEvent.wheel(mapSurface, { deltaY: 480 });
    fireEvent.click(mapSurface, { clientX: 800, clientY: 560 });

    expect(mapSurface).toHaveAttribute("data-focus-tile-id", "205-228");
    expect(screen.queryByText(/\[ZOOM\] 0\./)).not.toBeInTheDocument();
  });

  it("uses center-origin display coordinates for the function layer", () => {
    renderMapPage();

    expect(screen.getAllByText("(0,0)").length).toBeGreaterThan(0);
  });

  it("keeps the movement debug layer off by default and toggles it on demand", () => {
    renderMapPage();

    expect(screen.getByText("debug OFF")).toBeInTheDocument();
    expect(screen.getByText(/X=blocked \/ O=object/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "显示调试层" }));

    expect(screen.getByText("debug ON")).toBeInTheDocument();
  });

  it("shows selected tile details in the right panel", () => {
    renderMapPage();

    expect(screen.getByText("地图详情")).toBeInTheDocument();
    expect(screen.getByText("129-129")).toBeInTheDocument();
    expect(screen.getAllByText("(0,0)").length).toBeGreaterThan(0);
    expect(screen.getAllByText("IAFS坠毁点").length).toBeGreaterThan(0);
    expect(screen.getByText("无当前可见对象")).toBeInTheDocument();
    expect(screen.queryByText("未知信号")).not.toBeInTheDocument();
  });

  it("lists only runtime-visible map objects for the selected tile", () => {
    renderMapPage({ map: createMapWithRevealedOriginObjects(["iafs_generator"]) });

    const objectList = screen.getByLabelText("当前可见地图对象");
    expect(objectList).toHaveTextContent("发电机（已损坏）");
    expect(objectList).not.toHaveTextContent("damaged");
    expect(objectList).not.toHaveTextContent("facility");
    expect(objectList).not.toHaveTextContent("维生装置");
    expect(objectList).not.toHaveTextContent("未知信号");
  });

  it("does not show unknown signal after all tile objects are revealed", () => {
    renderMapPage({ map: createMapWithRevealedOriginObjects(["iafs_generator", "iafs_life_support", "iafs_shuttle_core"]) });

    const objectList = screen.getByLabelText("当前可见地图对象");
    expect(objectList).toHaveTextContent("发电机（已损坏）");
    expect(objectList).toHaveTextContent("维生装置（已损坏）");
    expect(objectList).toHaveTextContent("穿梭机核心（已损坏）");
    expect(objectList).not.toHaveTextContent("未知信号");
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

    focusMapTile("129-129");

    const readout = within(screen.getByLabelText("Feature 命中结果"));
    expect(screen.getByText(/\[TILE\] 129-129/)).toBeInTheDocument();
    expect(readout.getByText("发电机")).toBeInTheDocument();
    expect(readout.getByText("IAFS坠毁点")).toBeInTheDocument();
    expect(readout.getByText("可调查")).toBeInTheDocument();
    expect(readout.getByText("背景")).toBeInTheDocument();
  });

  it("lists every visible feature at a tile and separates background from investigatable hits", () => {
    const map = createInitialMapState();
    map.featuresById = {
      ...map.featuresById,
      iafs_scattered_supplies: { id: "iafs_scattered_supplies", status: "unsearched", revealed: true },
    };
    renderMapPage({ map });

    focusMapTile("130-130");

    const readout = within(screen.getByLabelText("Feature 命中结果"));
    expect(readout.getByText("IAFS坠毁点")).toBeInTheDocument();
    expect(readout.getByText("南侧通道")).toBeInTheDocument();
    expect(readout.getByText("散落的物资")).toBeInTheDocument();
    expect(readout.getByText("背景")).toBeInTheDocument();
    expect(readout.getByText("可调查")).toBeInTheDocument();
  });

  it("keeps tile terrain and weather readout for blank tiles without visible features", () => {
    renderMapPage();

    focusMapTile("1-1");

    expect(screen.getByText(/\[TILE\] 1-1 \/ 平原 \/ 晴朗/)).toBeInTheDocument();
    expect(screen.getByText(/\[FEATURE\] 无可见 Feature/)).toBeInTheDocument();
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

function focusMapTile(tileId: string) {
  const [rowText, colText] = tileId.split("-");
  const row = Number(rowText);
  const col = Number(colText);
  const mapSurface = screen.getByLabelText("ASCII 地图");
  Object.defineProperty(mapSurface, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ left: 0, top: 0, width: 900, height: 700, right: 900, bottom: 700, x: 0, y: 0, toJSON: () => ({}) }),
  });

  fireEvent.click(mapSurface, {
    clientX: ((col - 0.5) / 256) * 900,
    clientY: ((row - 0.5) / 256) * 700,
  });
}

function renderMapPage(overrides: Partial<ComponentProps<typeof MapPage>> = {}) {
  return render(
    <MapPage
      tiles={initialTiles}
      crew={initialCrew}
      crewActions={{}}
      activeCalls={{}}
      elapsedGameSeconds={0}
      gameTimeLabel="第 1 日 00 小时 00 分钟 00 秒"
      returnTarget="control"
      map={createInitialMapState()}
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
