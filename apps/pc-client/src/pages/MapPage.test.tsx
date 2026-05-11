import type { ComponentProps } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createInitialMapState, initialCrew, initialLogs, initialTiles } from "../data/gameData";
import { MapPage } from "./MapPage";

describe("MapPage", () => {
  it("renders a single interactive ascii map surface after the header", () => {
    renderMapPage();

    expect(screen.getByRole("heading", { name: "卫星雷达地图" })).toBeInTheDocument();
    expect(screen.getByLabelText("ASCII 地图")).toBeInTheDocument();
    expect(screen.getByText("render + function / 256 x 256")).toBeInTheDocument();
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

  it("shows selected tile details in the right panel", () => {
    renderMapPage();

    expect(screen.getByText("地图详情")).toBeInTheDocument();
    expect(screen.getByText("129-129")).toBeInTheDocument();
    expect(screen.getAllByText("(0,0)").length).toBeGreaterThan(0);
    expect(screen.getAllByText("IAFS坠毁点").length).toBeGreaterThan(0);
    expect(screen.getByText("无当前可见对象")).toBeInTheDocument();
  });

  it("lists only runtime-visible map objects for the selected tile", () => {
    renderMapPage({ map: createMapWithRevealedOriginObjects(["iafs_generator"]) });

    const objectList = screen.getByLabelText("当前可见地图对象");
    expect(objectList).toHaveTextContent("发电机（已损坏）");
    expect(objectList).not.toHaveTextContent("damaged");
    expect(objectList).not.toHaveTextContent("facility");
    expect(objectList).not.toHaveTextContent("维生装置");
  });

  it("shows the latest system log in the bottom bar", () => {
    renderMapPage();

    expect(screen.getByText(initialLogs[initialLogs.length - 1].text)).toBeInTheDocument();
  });
});

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
