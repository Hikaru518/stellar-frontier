import { useEffect, useRef } from "react";
import type { PhaserCrewMarkerView, PhaserMapTileView } from "./phaserMapView";

interface PhaserMapCanvasProps {
  ariaLabel: string;
  columns: number;
  tileViews: PhaserMapTileView[];
  crewMarkers: PhaserCrewMarkerView[];
  onSelectTile: (tileId: string) => void;
}

interface SceneState {
  columns: number;
  tileViews: PhaserMapTileView[];
  crewMarkers: PhaserCrewMarkerView[];
  onSelectTile: (tileId: string) => void;
}

type PhaserModule = typeof import("phaser");
type PhaserGame = InstanceType<PhaserModule["Game"]>;

const TILE_SIZE = 128;
const TILE_GAP = 2;

export function PhaserMapCanvas({ ariaLabel, columns, tileViews, crewMarkers, onSelectTile }: PhaserMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<PhaserGame | null>(null);
  const sceneRef = useRef<{ updateState: (state: SceneState) => void } | null>(null);
  const stateRef = useRef<SceneState>({ columns, tileViews, crewMarkers, onSelectTile });
  stateRef.current = { columns, tileViews, crewMarkers, onSelectTile };

  useEffect(() => {
    let cancelled = false;
    if (import.meta.env.MODE === "test" || !containerRef.current || gameRef.current) {
      return undefined;
    }

    void import("phaser").then((Phaser) => {
      if (cancelled || !containerRef.current || gameRef.current) {
        return;
      }

      const SceneBase = Phaser.Scene;
      class MapScene extends SceneBase {
        private state: SceneState = stateRef.current;
        private group?: Phaser.GameObjects.Group;

        create() {
          sceneRef.current = { updateState: (state) => this.updateState(state) };
          this.draw();
        }

        updateState(state: SceneState) {
          this.state = state;
          this.draw();
        }

        private draw() {
          this.group?.clear(true, true);
          this.group = this.add.group();
          for (const tile of this.state.tileViews) {
            const x = tile.col * (TILE_SIZE + TILE_GAP);
            const y = tile.row * (TILE_SIZE + TILE_GAP);
            const rect = this.add
              .rectangle(x, y, TILE_SIZE, TILE_SIZE, Number(tile.fillColor.replace("#", "0x")), tile.status === "unknownHole" ? 0.35 : 1)
              .setOrigin(0)
              .setStrokeStyle(tile.isSelected ? 4 : tile.isTarget ? 3 : tile.isRoute ? 2 : 1, tile.isSelected ? 0xb45b13 : tile.isTarget ? 0x24384f : 0x171a1c);
            rect.setInteractive({ useHandCursor: true });
            rect.on("pointerdown", () => this.state.onSelectTile(tile.id));
            this.group.add(rect);

            const label = this.add.text(x + 8, y + 8, tile.displayCoord, { color: "#171a1c", fontFamily: "monospace", fontSize: "14px" });
            this.group.add(label);
          }

          for (const marker of this.state.crewMarkers) {
            const text = this.add.text(marker.x - 10, marker.y - 12, marker.label, {
              backgroundColor: "#f4eadf",
              color: "#24384f",
              fontFamily: "monospace",
              fontSize: "20px",
              fontStyle: "bold",
              padding: { x: 5, y: 3 },
            });
            this.group.add(text);
          }
        }
      }

      const rows = Math.max(1, Math.ceil(tileViews.length / Math.max(columns, 1)));
      gameRef.current = new Phaser.Game({
        type: Phaser.AUTO,
        parent: containerRef.current,
        width: Math.max(1, columns) * (TILE_SIZE + TILE_GAP) - TILE_GAP,
        height: rows * (TILE_SIZE + TILE_GAP) - TILE_GAP,
        backgroundColor: "#77736b",
        scene: MapScene,
      });
    });

    return () => {
      cancelled = true;
      sceneRef.current = null;
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, [columns, tileViews.length]);

  useEffect(() => {
    sceneRef.current?.updateState(stateRef.current);
  }, [columns, crewMarkers, onSelectTile, tileViews]);

  return (
    <section className="phaser-map-canvas" aria-label={ariaLabel} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      <div ref={containerRef} className="phaser-map-stage" aria-label="Phaser 地图画布" />
      <div className="phaser-map-fallback">
        {tileViews.map((tile) => (
          <button type="button" key={tile.id} className="phaser-map-fallback-tile" title={tile.tooltip} onClick={() => onSelectTile(tile.id)}>
            <strong>{tile.displayCoord}</strong>
            <span>{tile.label}</span>
            {tile.semanticLines?.map((line) => (
              <small key={line}>{line}</small>
            ))}
            {tile.crewLabels.length > 0 ? <small>队员：{tile.crewLabels.join(" ")}</small> : null}
          </button>
        ))}
      </div>
    </section>
  );
}

export const PHASER_MAP_TILE_SIZE = TILE_SIZE;
export const PHASER_MAP_TILE_GAP = TILE_GAP;
