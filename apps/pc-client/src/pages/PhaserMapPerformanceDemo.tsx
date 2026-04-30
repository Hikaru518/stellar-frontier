import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildGlobalSubTileGrid,
  findGlobalPath,
  getDemoSubTileTerrainLabel,
  getDemoTileActions,
  getDemoTileDetails,
  getDemoTerrainLabel,
  isPerformanceDemoSubTileWalkable,
  PERFORMANCE_DEMO_SUBMAP_SIZE,
  type DemoDetail,
  type DemoSubTileTerrain,
  type DemoTerrain,
  type GlobalSubTile,
  type PerformanceDemoSubTile,
  type PerformanceDemoTile,
  type RoadConnections,
} from "./phaserMapDemoData";

interface PhaserMapPerformanceDemoProps {
  onClose: () => void;
}

type PhaserModule = typeof import("phaser");
type PhaserGame = InstanceType<PhaserModule["Game"]>;

// ── Layout ─────────────────────────────────────────────────────────────────
const DEMO_WORLD_SIZE = 3;
const DEMO_SUB_TILE_SIZE = 30; // world-space pixels per sub-tile (the base resolution)
const DEMO_VIEW_WIDTH = 980;
const DEMO_VIEW_HEIGHT = 620;

// Total world canvas = 60 sub-tiles × 30 px = 1800 × 1800
const PERFORMANCE_DEMO_GLOBAL_SIZE = DEMO_WORLD_SIZE * PERFORMANCE_DEMO_SUBMAP_SIZE; // 60
const WORLD_CANVAS_SIZE = PERFORMANCE_DEMO_GLOBAL_SIZE * DEMO_SUB_TILE_SIZE; // 1800

// ── Zoom levels (Google-Maps style, 4 discrete levels) ─────────────────────
// Level 0: see the full 3 × 3 world at a glance
// Level 1: see ~2 big tiles — initial view
// Level 2: see ~1 big tile clearly — sub-tile detail visible
// Level 3: very close, individual sub-tiles dominate the screen
const ZOOM_LEVELS = [0.35, 0.7, 1.5, 3.0] as const;
const ZOOM_LABELS = ["全局", "大格", "地块", "精细"] as const;
const INITIAL_ZOOM_LEVEL = 1;

const STEP_DURATION_MS = 250; // ms per global sub-tile step

const START_GLOBAL_ROW = 1 * PERFORMANCE_DEMO_SUBMAP_SIZE + 10; // big tile (1,1) → 30
const START_GLOBAL_COL = 1 * PERFORMANCE_DEMO_SUBMAP_SIZE + 10;
const WORLD_START_TILE_ID = "1-1";

export function PhaserMapPerformanceDemo({ onClose }: PhaserMapPerformanceDemoProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<PhaserGame | null>(null);

  const tiles = useMemo(() => createDemoWorldTiles(), []);
  const tileById = useMemo(() => new Map(tiles.map((t) => [t.id, t])), [tiles]);
  const initialSelectedTile = useMemo(() => tileById.get(WORLD_START_TILE_ID) ?? tiles[0], [tileById, tiles]);

  const [selectedTileId, setSelectedTileId] = useState(initialSelectedTile.id);
  const [currentWorldTileId, setCurrentWorldTileId] = useState(WORLD_START_TILE_ID);
  const [zoomLevel, setZoomLevel] = useState(INITIAL_ZOOM_LEVEL);
  const [actionResult, setActionResult] = useState("尚未执行地块操作。");

  // ── Unified global character state ────────────────────────────────────────
  const globalPosRef = useRef({ globalRow: START_GLOBAL_ROW, globalCol: START_GLOBAL_COL });
  const globalPendingPathRef = useRef<GlobalSubTile[]>([]);
  const globalTrailRef = useRef<Array<{ globalRow: number; globalCol: number }>>([
    { globalRow: START_GLOBAL_ROW, globalCol: START_GLOBAL_COL },
  ]);

  const globalGrid = useMemo(() => buildGlobalSubTileGrid(tiles), [tiles]);
  const globalGridById = useMemo(() => new Map(globalGrid.map((t) => [t.globalId, t])), [globalGrid]);

  const selectedTile = tileById.get(selectedTileId) ?? initialSelectedTile;
  const selectedDetails = getDemoTileDetails(selectedTile);
  const selectedActions = getDemoTileActions(selectedTile);

  // ── Phaser scene (created once, never recreated) ──────────────────────────
  useEffect(() => {
    let cancelled = false;
    if (import.meta.env.MODE === "test" || !containerRef.current || gameRef.current) {
      return undefined;
    }

    void import("phaser").then((Phaser) => {
      if (cancelled || !containerRef.current || gameRef.current) return;

      const SceneBase = Phaser.Scene;

      class DemoScene extends SceneBase {
        // Input
        private keys?: {
          W: Phaser.Input.Keyboard.Key;
          A: Phaser.Input.Keyboard.Key;
          S: Phaser.Input.Keyboard.Key;
          D: Phaser.Input.Keyboard.Key;
        };

        // UI groups
        private hoverTimer?: Phaser.Time.TimerEvent;
        private hoverTileId?: string;
        private infoGroup?: Phaser.GameObjects.Group;
        private menuGroup?: Phaser.GameObjects.Group;

        // Character
        private person?: Phaser.GameObjects.Container;
        private walking = false;

        // Graphics layers (for LOD visibility toggling)
        private subGridLayer?: Phaser.GameObjects.Graphics;
        private detailLayer?: Phaser.GameObjects.Graphics;
        private trailGraphics?: Phaser.GameObjects.Graphics;
        private pendingPathGraphics?: Phaser.GameObjects.Graphics;

        // Zoom
        private zoomLevelIndex = INITIAL_ZOOM_LEVEL;
        private zooming = false;

        create() {
          this.input.mouse?.disableContextMenu();
          const camera = this.cameras.main;
          camera.setBounds(0, 0, WORLD_CANVAS_SIZE, WORLD_CANVAS_SIZE);
          camera.setZoom(ZOOM_LEVELS[INITIAL_ZOOM_LEVEL]);
          const startPos = globalToCanvas(START_GLOBAL_ROW, START_GLOBAL_COL);
          camera.centerOn(startPos.x, startPos.y);

          this.drawMap(Phaser);
          this.createPerson();
          this.refreshTrail();

          this.setupInput(camera);
          this.time.delayedCall(60, () => this.continuePending());
        }

        // ── Main update loop (WASD + LOD) ──────────────────────────────────

        update(_time: number, delta: number) {
          const camera = this.cameras.main;

          // WASD pan — constant on-screen speed regardless of zoom level
          const worldSpeed = (400 * delta) / (1000 * camera.zoom);
          if (this.keys?.A.isDown) camera.scrollX -= worldSpeed;
          if (this.keys?.D.isDown) camera.scrollX += worldSpeed;
          if (this.keys?.W.isDown) camera.scrollY -= worldSpeed;
          if (this.keys?.S.isDown) camera.scrollY += worldSpeed;

          // LOD: reveal sub-tile grid and details only when zoomed in enough
          const zoom = camera.zoom;
          const showSubGrid = zoom >= 1.2;
          const showDetail = zoom >= 0.9;
          if (this.subGridLayer && this.subGridLayer.visible !== showSubGrid) {
            this.subGridLayer.setVisible(showSubGrid);
          }
          if (this.detailLayer && this.detailLayer.visible !== showDetail) {
            this.detailLayer.setVisible(showDetail);
          }
        }

        // ── Map drawing ────────────────────────────────────────────────────

        private drawMap(Phaser: PhaserModule) {
          // Layer 1 — sub-tile terrain colours (always visible)
          const terrainLayer = this.add.graphics().setDepth(1);
          for (const gTile of globalGrid) {
            const x = gTile.globalCol * DEMO_SUB_TILE_SIZE;
            const y = gTile.globalRow * DEMO_SUB_TILE_SIZE;
            terrainLayer.fillStyle(subTerrainColor(gTile.subTile.terrain), 1);
            terrainLayer.fillRect(x, y, DEMO_SUB_TILE_SIZE, DEMO_SUB_TILE_SIZE);
          }

          // Layer 2 — sub-tile detail drawings (trees, rocks, buildings…)
          this.detailLayer = this.add.graphics().setDepth(3);
          for (const gTile of globalGrid) {
            const x = gTile.globalCol * DEMO_SUB_TILE_SIZE;
            const y = gTile.globalRow * DEMO_SUB_TILE_SIZE;
            drawSubDetail(this.detailLayer, gTile.subTile, x, y);
          }
          this.detailLayer.setVisible(ZOOM_LEVELS[INITIAL_ZOOM_LEVEL] >= 0.9);

          // Layer 3 — sub-tile grid (thin, only at higher zoom)
          this.subGridLayer = this.add.graphics().setDepth(4);
          this.subGridLayer.lineStyle(1, 0x1a2630, 0.18);
          for (let i = 0; i <= PERFORMANCE_DEMO_GLOBAL_SIZE; i++) {
            const offset = i * DEMO_SUB_TILE_SIZE;
            this.subGridLayer.lineBetween(offset, 0, offset, WORLD_CANVAS_SIZE);
            this.subGridLayer.lineBetween(0, offset, WORLD_CANVAS_SIZE, offset);
          }
          this.subGridLayer.setVisible(ZOOM_LEVELS[INITIAL_ZOOM_LEVEL] >= 1.2);

          // Layer 4 — big-tile borders (bold, always visible)
          const bigGrid = this.add.graphics().setDepth(5);
          bigGrid.lineStyle(3, 0x1a2630, 0.85);
          for (let i = 0; i <= DEMO_WORLD_SIZE; i++) {
            const offset = i * PERFORMANCE_DEMO_SUBMAP_SIZE * DEMO_SUB_TILE_SIZE;
            bigGrid.lineBetween(offset, 0, offset, WORLD_CANVAS_SIZE);
            bigGrid.lineBetween(0, offset, WORLD_CANVAS_SIZE, offset);
          }

          // Layer 5 — big-tile coordinate labels
          for (const tile of tiles) {
            const wx = tile.col * PERFORMANCE_DEMO_SUBMAP_SIZE * DEMO_SUB_TILE_SIZE + 8;
            const wy = tile.row * PERFORMANCE_DEMO_SUBMAP_SIZE * DEMO_SUB_TILE_SIZE + 8;
            const label = this.add.text(wx, wy, `${getDemoTerrainLabel(tile.terrain)}\n${formatWorldCoord(tile)}`, {
              backgroundColor: "#00000060",
              color: "#f4eadf",
              fontFamily: "monospace",
              fontSize: "18px",
              fontStyle: "bold",
              padding: { x: 4, y: 3 },
              lineSpacing: 2,
            });
            label.setDepth(8);
          }

          // HUD (scroll-fixed)
          const hud = this.add.text(
            18,
            18,
            "WASD 平移 · ↑↓ 切换缩放 · 左键点击导航 · 右键拖拽",
            {
              backgroundColor: "#f4eadf",
              color: "#24384f",
              fontFamily: "monospace",
              fontSize: "14px",
              padding: { x: 8, y: 5 },
            },
          );
          hud.setScrollFactor(0).setDepth(15);

          void Phaser.VERSION;
        }

        // ── Character ──────────────────────────────────────────────────────

        private createPerson() {
          const { globalRow, globalCol } = globalPosRef.current;
          const { x, y } = globalToCanvas(globalRow, globalCol);
          this.person = createPersonMarker(this, x, y);
        }

        // ── Input setup ────────────────────────────────────────────────────

        private setupInput(camera: Phaser.Cameras.Scene2D.Camera) {
          // WASD (via keyboard addKey)
          this.keys = {
            W: this.input.keyboard!.addKey(87),
            A: this.input.keyboard!.addKey(65),
            S: this.input.keyboard!.addKey(83),
            D: this.input.keyboard!.addKey(68),
          };

          // Arrow Up / Down → zoom level change
          this.input.keyboard!.on("keydown-UP", () => this.changeZoomLevel(1));
          this.input.keyboard!.on("keydown-DOWN", () => this.changeZoomLevel(-1));

          // Right-drag → pan
          let dragStart: { x: number; y: number; scrollX: number; scrollY: number } | undefined;
          this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
            if (pointer.button !== 2) {
              const target = this.canvasClickToGlobalTile(pointer);
              if (target) {
                setSelectedTileId(`${target.worldRow}-${target.worldCol}`);
                this.showActionMenu(target, pointer);
              }
              return;
            }
            this.hideActionMenu();
            dragStart = { x: pointer.x, y: pointer.y, scrollX: camera.scrollX, scrollY: camera.scrollY };
          });
          this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
            if (!dragStart || !pointer.rightButtonDown()) {
              this.scheduleHoverInfo(pointer);
              return;
            }
            this.hideHoverInfo();
            camera.scrollX = dragStart.scrollX - (pointer.x - dragStart.x) / camera.zoom;
            camera.scrollY = dragStart.scrollY - (pointer.y - dragStart.y) / camera.zoom;
          });
          this.input.on("pointerup", () => {
            dragStart = undefined;
          });

          // Scroll wheel → smooth zoom (maps to nearest level)
          this.input.on("wheel", (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, deltaY: number) => {
            this.hideHoverInfo();
            this.hideActionMenu();
            this.changeZoomLevel(deltaY < 0 ? 1 : -1);
          });
        }

        // ── Zoom ───────────────────────────────────────────────────────────

        private changeZoomLevel(delta: number) {
          if (this.zooming) return;
          const newIndex = clamp(this.zoomLevelIndex + delta, 0, ZOOM_LEVELS.length - 1);
          if (newIndex === this.zoomLevelIndex) return;
          this.zoomLevelIndex = newIndex;
          this.zooming = true;
          setZoomLevel(newIndex);
          this.tweens.add({
            targets: this.cameras.main,
            zoom: ZOOM_LEVELS[newIndex],
            duration: 350,
            ease: "Cubic.easeInOut",
            onComplete: () => {
              this.zooming = false;
            },
          });
        }

        // ── Navigation ─────────────────────────────────────────────────────

        private canvasClickToGlobalTile(pointer: Phaser.Input.Pointer): GlobalSubTile | undefined {
          const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
          const col = clamp(Math.floor(world.x / DEMO_SUB_TILE_SIZE), 0, PERFORMANCE_DEMO_GLOBAL_SIZE - 1);
          const row = clamp(Math.floor(world.y / DEMO_SUB_TILE_SIZE), 0, PERFORMANCE_DEMO_GLOBAL_SIZE - 1);
          return globalGridById.get(`${row}-${col}`);
        }

        private navigateTo(target: GlobalSubTile) {
          // Cancel any current movement and snap person to last confirmed position
          this.tweens.killTweensOf(this.person);
          const { globalRow, globalCol } = globalPosRef.current;
          if (this.person) {
            const snap = globalToCanvas(globalRow, globalCol);
            this.person.setPosition(snap.x, snap.y);
          }
          const path = findGlobalPath(globalGrid, PERFORMANCE_DEMO_GLOBAL_SIZE, `${globalRow}-${globalCol}`, target.globalId);
          if (path.length === 0) return;
          this.hideActionMenu();
          globalPendingPathRef.current = path.slice(1);
          this.walking = true;
          this.walkUnified(path.slice(1));
          this.refreshPendingPath(path);
        }

        private walkUnified(remaining: GlobalSubTile[]) {
          const [next, ...rest] = remaining;
          if (!next || !this.person) {
            this.walking = false;
            this.pendingPathGraphics?.clear();
            return;
          }
          globalPendingPathRef.current = rest;
          const { x, y } = globalToCanvas(next.globalRow, next.globalCol);
          this.tweens.add({
            targets: this.person,
            x,
            y,
            duration: STEP_DURATION_MS,
            onComplete: () => {
              globalPosRef.current = { globalRow: next.globalRow, globalCol: next.globalCol };
              globalTrailRef.current.push({ globalRow: next.globalRow, globalCol: next.globalCol });
              setCurrentWorldTileId(`${next.worldRow}-${next.worldCol}`);
              this.refreshTrail();
              this.walkUnified(rest);
            },
          });
        }

        private continuePending() {
          const pending = globalPendingPathRef.current;
          if (pending.length === 0 || !this.person) return;
          this.walking = true;
          this.walkUnified(pending);
        }

        // ── Trail ──────────────────────────────────────────────────────────

        private refreshTrail() {
          if (!this.trailGraphics) {
            this.trailGraphics = this.add.graphics().setDepth(12);
          }
          this.trailGraphics.clear();
          const trail = globalTrailRef.current;
          if (trail.length < 2) return;
          this.trailGraphics.lineStyle(4, 0xb45b13, 0.9);
          drawPointPath(this.trailGraphics, trail.map(({ globalRow, globalCol }) => globalToCanvas(globalRow, globalCol)));
        }

        private refreshPendingPath(path: GlobalSubTile[]) {
          if (!this.pendingPathGraphics) {
            this.pendingPathGraphics = this.add.graphics().setDepth(11);
          }
          this.pendingPathGraphics.clear();
          if (path.length < 2) return;
          this.pendingPathGraphics.lineStyle(2, 0x90b0c8, 0.55);
          drawPointPath(
            this.pendingPathGraphics,
            path.map((t) => globalToCanvas(t.globalRow, t.globalCol)),
          );
        }

        // ── Hover info ─────────────────────────────────────────────────────

        private scheduleHoverInfo(pointer: Phaser.Input.Pointer) {
          const tile = this.canvasClickToGlobalTile(pointer);
          if (!tile) {
            this.hoverTileId = undefined;
            this.hoverTimer?.remove(false);
            this.hideHoverInfo();
            return;
          }
          if (tile.globalId === this.hoverTileId) return;
          this.hoverTileId = tile.globalId;
          this.hoverTimer?.remove(false);
          this.hideHoverInfo();
          this.hoverTimer = this.time.delayedCall(500, () => this.showHoverInfo(tile));
        }

        private showHoverInfo(tile: GlobalSubTile) {
          this.hideHoverInfo();
          const { x: cx, y: cy } = globalToCanvas(tile.globalRow, tile.globalCol);
          const terrain = getDemoSubTileTerrainLabel(tile.subTile.terrain);
          const bigTile = tiles.find((t) => t.row === tile.worldRow && t.col === tile.worldCol);
          const bigLabel = bigTile ? ` · ${formatWorldCoord(bigTile)}` : "";
          const text = `${terrain}${bigLabel}\n子格 (${tile.globalCol},${tile.globalRow})`;
          const box = this.add.rectangle(cx + 14, cy - 50, 176, 56, 0xf4eadf, 0.96).setOrigin(0, 0.5).setStrokeStyle(1, 0x24384f);
          const label = this.add.text(cx + 24, cy - 74, text, {
            color: "#171a1c",
            fontFamily: "monospace",
            fontSize: "12px",
            lineSpacing: 3,
          });
          box.setDepth(30);
          label.setDepth(31);
          this.infoGroup = this.add.group([box, label]);
        }

        private hideHoverInfo() {
          this.infoGroup?.clear(true, true);
          this.infoGroup = undefined;
        }

        // ── Action menu ────────────────────────────────────────────────────

        private showActionMenu(target: GlobalSubTile, pointer: Phaser.Input.Pointer) {
          this.hideActionMenu();
          this.hideHoverInfo();
          const walkable = isPerformanceDemoSubTileWalkable(target.subTile);
          const { x: cx, y: cy } = globalToCanvas(target.globalRow, target.globalCol);

          // Offset upward so the menu doesn't obscure the clicked spot
          const mx = cx + 14;
          const my = cy - 80;
          const terrain = getDemoSubTileTerrainLabel(target.subTile.terrain);
          const bigTile = tiles.find((t) => t.row === target.worldRow && t.col === target.worldCol);
          const title = bigTile ? `${getDemoTerrainLabel(bigTile.terrain)} ${formatWorldCoord(bigTile)}` : terrain;
          const box = this.add.rectangle(mx, my, 134, 62, 0xf4eadf, 0.98).setOrigin(0, 0).setStrokeStyle(1, 0xb45b13);
          const titleText = this.add.text(mx + 8, my + 8, title, { color: "#171a1c", fontFamily: "monospace", fontSize: "11px" });
          const detailText = this.add.text(mx + 8, my + 22, terrain, { color: "#46505a", fontFamily: "monospace", fontSize: "11px" });
          const actionText = this.add
            .text(mx + 8, my + 38, walkable ? "前往此位置" : "不可前往", {
              color: walkable ? "#24384f" : "#7b8085",
              fontFamily: "monospace",
              fontSize: "13px",
              fontStyle: "bold",
            })
            .setInteractive({ useHandCursor: walkable });
          if (walkable) actionText.on("pointerdown", () => this.navigateTo(target));

          [box, titleText, detailText, actionText].forEach((o) => o.setDepth(32));
          this.menuGroup = this.add.group([box, titleText, detailText, actionText]);
          void pointer;
        }

        private hideActionMenu() {
          this.menuGroup?.clear(true, true);
          this.menuGroup = undefined;
        }
      }

      gameRef.current = new Phaser.Game({
        type: Phaser.AUTO,
        parent: containerRef.current,
        width: DEMO_VIEW_WIDTH,
        height: DEMO_VIEW_HEIGHT,
        backgroundColor: "#1f536b",
        scene: DemoScene,
      });
    });

    return () => {
      cancelled = true;
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, [globalGrid, globalGridById, tiles]);

  const selectedTileCoord = `${formatWorldCoord(selectedTile)} / ${currentWorldTileId === selectedTile.id ? "人物在此" : ""}`;

  return (
    <section className="phaser-demo-panel" aria-label="Phaser 3x3 / 20x20 地图 Demo">
      <div className="phaser-demo-header">
        <div>
          <h2>3x3 / 20x20 Phaser 地图 Demo</h2>
          <p>外层只有 3x3 大地块，大地图展示所有子格的地形色彩（downsampling）。</p>
          <p className="muted-text">
            人物全局寻路，慢速移动；
            <strong>WASD</strong> 平移相机 · <strong>↑↓</strong> 切换缩放级别 · 左键点击地块导航 · 右键拖拽平移 · 滚轮缩放
          </p>
        </div>
        <button type="button" className="secondary-button" onClick={onClose}>
          关闭 Demo
        </button>
      </div>
      <div className="phaser-demo-body">
        <div ref={containerRef} className="phaser-demo-stage" aria-label="Phaser 地图画布" />
        <aside className="phaser-demo-detail-panel" aria-label="地块详情面板">
          <h3>地块详情</h3>

          {/* Zoom level indicator */}
          <div className="zoom-level-bar" aria-label="缩放级别">
            {ZOOM_LABELS.map((label, i) => (
              <span key={i} className={i === zoomLevel ? "zoom-level-active" : "zoom-level-pip"} title={label}>
                {label}
              </span>
            ))}
          </div>

          <p className="muted-text">
            点击地图任意位置发出移动指令；人物会全局寻路前往精确子格。
          </p>

          <dl className="field-list">
            <div>
              <dt>区域</dt>
              <dd>{selectedDetails.areaName}</dd>
            </div>
            <div>
              <dt>坐标</dt>
              <dd>{selectedTileCoord}</dd>
            </div>
            <div>
              <dt>地形</dt>
              <dd>{selectedDetails.terrainLabel}</dd>
            </div>
            <div>
              <dt>物种</dt>
              <dd>{selectedDetails.speciesLabel}</dd>
            </div>
            <div>
              <dt>说明</dt>
              <dd>{selectedDetails.description}</dd>
            </div>
          </dl>

          <h4>可执行选项</h4>
          {selectedActions.length > 0 ? (
            <div className="phaser-demo-actions">
              {selectedActions.map((action) => (
                <button
                  type="button"
                  key={action.id}
                  className="small-button"
                  onClick={() => setActionResult(`${action.label}：${action.description}`)}
                >
                  {action.label}
                </button>
              ))}
            </div>
          ) : (
            <p className="muted-text">当前地块没有可执行选项。</p>
          )}
          <p className="muted-text">{actionResult}</p>
        </aside>
      </div>
    </section>
  );
}

// ── World tile data ────────────────────────────────────────────────────────

// Road connections for each big tile.
// Every connected edge pair must match (e.g. (0,0).east ↔ (0,1).west = both true).
// Roads run along the center axis (sub-tile 10 ± 1) of the tile.
const WORLD_ROAD_CONNECTIONS: Record<string, RoadConnections> = {
  "0-0": { north: false, south: false, east: true,  west: false }, // forest — stub eastward
  "0-1": { north: false, south: true,  east: true,  west: true  }, // grass  — E–W + south
  "0-2": { north: false, south: true,  east: false, west: true  }, // mountain — pass
  "1-0": { north: false, south: false, east: false, west: false }, // water  — no roads
  "1-1": { north: true,  south: true,  east: true,  west: false }, // grass  — hub (start)
  "1-2": { north: true,  south: true,  east: false, west: true  }, // forest — N–S + west
  "2-0": { north: false, south: false, east: true,  west: false }, // beach  — stub eastward
  "2-1": { north: true,  south: false, east: true,  west: true  }, // road   — main junction
  "2-2": { north: true,  south: false, east: false, west: true  }, // village — dead end
};

function createDemoWorldTiles(): PerformanceDemoTile[] {
  const terrains: DemoTerrain[][] = [
    ["forest", "grass", "mountain"],
    ["water", "grass", "forest"],
    ["beach", "road", "village"],
  ];
  const details: DemoDetail[][] = [
    ["forest", null, "mountain"],
    [null, null, "forest"],
    ["dock", null, "building"],
  ];
  return terrains.flatMap((rowTerrains, row) =>
    rowTerrains.map((terrain, col) => ({
      id: `${row}-${col}`,
      row,
      col,
      terrain,
      detail: details[row][col],
      roads: WORLD_ROAD_CONNECTIONS[`${row}-${col}`],
    })),
  );
}

// ── Coordinate helper (unified: globalRow/Col → canvas px) ─────────────────

function globalToCanvas(globalRow: number, globalCol: number) {
  return {
    x: globalCol * DEMO_SUB_TILE_SIZE + DEMO_SUB_TILE_SIZE / 2,
    y: globalRow * DEMO_SUB_TILE_SIZE + DEMO_SUB_TILE_SIZE / 2,
  };
}

// ── Terrain colours ───────────────────────────────────────────────────────

function subTerrainColor(terrain: DemoSubTileTerrain) {
  switch (terrain) {
    case "grass":
      return 0x7fc96c;
    case "flower":
      return 0xd777b9;
    case "forest":
      return 0x3e9f4d;
    case "water":
      return 0x2f9ee8;
    case "sand":
      return 0xe7d28a;
    case "road":
      return 0xdcc58a;
    case "rock":
      return 0x9a8c75;
    case "house":
      return 0x95d57a;
  }
}

// ── Sub-tile detail drawings ───────────────────────────────────────────────

function drawSubDetail(layer: Phaser.GameObjects.Graphics, tile: PerformanceDemoSubTile, x: number, y: number) {
  if (tile.terrain === "flower") {
    layer.fillStyle(0xfff1a8, 1);
    layer.fillCircle(x + 9, y + 10, 2);
    layer.fillStyle(0xd04f96, 1);
    layer.fillCircle(x + 15, y + 15, 3);
  } else if (tile.terrain === "forest") {
    layer.fillStyle(0x1f6f38, 0.95);
    layer.fillTriangle(x + 7, y + 24, x + 15, y + 6, x + 23, y + 24);
    layer.fillStyle(0x8a5a2d, 1);
    layer.fillRect(x + 13, y + 21, 4, 6);
  } else if (tile.terrain === "water") {
    layer.lineStyle(1, 0xd0f1ff, 0.28);
    layer.lineBetween(x + 4, y + 10, x + 18, y + 7);
    layer.lineBetween(x + 11, y + 22, x + 27, y + 18);
  } else if (tile.terrain === "road") {
    layer.lineStyle(3, 0xb08b4a, 0.5);
    layer.lineBetween(x, y + 15, x + DEMO_SUB_TILE_SIZE, y + 15);
  } else if (tile.terrain === "rock") {
    layer.fillStyle(0x6f6553, 1);
    layer.fillTriangle(x + 6, y + 25, x + 15, y + 7, x + 25, y + 25);
  } else if (tile.terrain === "house") {
    layer.fillStyle(0x8f4c2f, 1);
    layer.fillRect(x + 7, y + 13, 16, 12);
    layer.fillStyle(0xd46a3a, 1);
    layer.fillTriangle(x + 5, y + 14, x + 15, y + 5, x + 25, y + 14);
  }
}

// ── Phaser object helpers ──────────────────────────────────────────────────

function createPersonMarker(scene: Phaser.Scene, x: number, y: number) {
  const body = scene.add.circle(0, 3, 8, 0x24384f, 1);
  const head = scene.add.circle(0, -9, 6, 0xf4eadf, 1).setStrokeStyle(2, 0x24384f);
  const person = scene.add.container(x, y, [body, head]);
  person.setDepth(20);
  return person;
}

function drawPointPath(layer: Phaser.GameObjects.Graphics, points: Array<{ x: number; y: number }>) {
  if (points.length < 2) return;
  layer.beginPath();
  layer.moveTo(points[0].x, points[0].y);
  for (const pt of points.slice(1)) layer.lineTo(pt.x, pt.y);
  layer.strokePath();
  layer.fillStyle(0xffe08a, 1);
  for (const pt of points) layer.fillCircle(pt.x, pt.y, 3);
}

function formatWorldCoord(tile: PerformanceDemoTile) {
  return `(${tile.col - 1},${1 - tile.row})`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

