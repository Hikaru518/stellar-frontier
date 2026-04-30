import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PhaserMapCanvas } from "./PhaserMapCanvas";
import type { PhaserMapTileView } from "./phaserMapView";

const tileViews: PhaserMapTileView[] = [
  {
    id: "4-4",
    row: 4,
    col: 4,
    displayCoord: "(0,0)",
    status: "discovered",
    fillColor: "#2f80ed",
    tooltip: "坐标：(0,0)\n地形：水面",
    label: "坠毁区域",
    terrain: "水面",
    semanticLines: ["地形：水面"],
    crewLabels: ["M"],
    isDanger: false,
    isRoute: false,
    isSelected: true,
    isTarget: false,
  },
];

describe("PhaserMapCanvas", () => {
  it("keeps a semantic tile fallback that can select map tiles", () => {
    const onSelectTile = vi.fn();

    render(
      <PhaserMapCanvas
        ariaLabel="雷达可见矩形：玩家坐标 (0,0) 到 (0,0)"
        columns={1}
        tileViews={tileViews}
        crewMarkers={[]}
        onSelectTile={onSelectTile}
      />,
    );

    expect(screen.getByLabelText("Phaser 地图画布")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /地形：水面/ }));

    expect(onSelectTile).toHaveBeenCalledWith("4-4");
  });
});
