import { useEffect, useMemo, useRef, useState } from "react";
import { GameConsoleLayout } from "../components/Layout";
import type { CrewId, CrewMember, MapReturnTarget, MapTile, SystemLog } from "../data/gameData";
import { deriveCrewActionViewModel, type CrewActionViewModel } from "../crewSystem";
import type { CrewActionState, RuntimeCall } from "../events/types";

const WORLD_SIZE = 256;
const ORIGIN = { x: 128, y: 128 };
const CELL_W = 8;
const CELL_H = 10;
const RETRO_RAMP = " .,:;irsXA253hMHGS#9B&@";

type FocusCoord = { x: number; y: number };
type RenderTone =
  | "g"
  | "d"
  | "c"
  | "a"
  | "w"
  | "s"
  | "r";

interface RenderGlitch {
  x: number;
  y: number;
  radius: number;
  start: number;
  duration: number;
  kick: number;
}

interface MapPageProps {
  tiles: MapTile[];
  crew: CrewMember[];
  crewActions: Record<string, CrewActionState>;
  activeCalls: Record<string, RuntimeCall>;
  elapsedGameSeconds: number;
  gameTimeLabel: string;
  returnTarget: MapReturnTarget;
  moveSelectionCrewId?: CrewId | null;
  initialSelectedTileId?: string;
  onOpenControl: () => void;
  onOpenTask: () => void;
  onStartCall: (crewId: CrewId) => void;
  onOpenCrewStatusInControl: (crewId: CrewId) => void;
  onOpenCrewInventoryInControl: (crewId: CrewId) => void;
  logs: SystemLog[];
}

export function MapPage({
  tiles,
  crew,
  crewActions,
  activeCalls,
  elapsedGameSeconds,
  gameTimeLabel,
  returnTarget,
  moveSelectionCrewId,
  initialSelectedTileId,
  onOpenControl,
  onOpenTask,
  onStartCall,
  onOpenCrewStatusInControl,
  onOpenCrewInventoryInControl,
  logs,
}: MapPageProps) {
  const latestLog = logs[logs.length - 1];
  const moveSelectionMember = crew.find((member) => member.id === moveSelectionCrewId);
  const initialFocus = useMemo(() => focusFromTileId(initialSelectedTileId), [initialSelectedTileId]);
  const [focusCoord, setFocusCoord] = useState<FocusCoord>(initialFocus);
  const [traceLines, setTraceLines] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState<FocusCoord>(initialFocus);
  const [dragging, setDragging] = useState(false);
  const [showRenderLayer, setShowRenderLayer] = useState(true);
  const [showFunctionalLayer, setShowFunctionalLayer] = useState(true);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const functionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; centerX: number; centerY: number; moved: boolean } | null>(null);
  const crewWorldCoords = useMemo(() => new Map(crew.map((member) => [member.id, worldFromCrewTile(member.currentTile)])), [crew]);
  const focusLabel = useMemo(() => sampleWorldLabel(focusCoord.x, focusCoord.y), [focusCoord]);
  const focusDisplayCoord = useMemo(() => formatDisplayCoord(focusCoord), [focusCoord]);
  const viewport = useMemo(() => getViewport(center, zoom), [center, zoom]);

  const crewActionViews = useMemo(
    () =>
      Object.fromEntries(
        crew.map((member) => [
          member.id,
          deriveCrewActionViewModel({
            member,
            crewActions,
            activeCalls,
            elapsedGameSeconds,
            tiles,
          }),
        ]),
      ) as Record<CrewId, CrewActionViewModel>,
    [activeCalls, crew, crewActions, elapsedGameSeconds, tiles],
  );

  useEffect(() => {
    const line = `[FOCUS] ${focusDisplayCoord} / ${focusLabel}`;
    setTraceLines((current) => (current[0] === line ? current : [line, ...current].slice(0, 10)));
  }, [focusDisplayCoord, focusLabel]);

  function pushTrace(line: string) {
    setTraceLines((current) => [line, ...current].slice(0, 10));
  }

  function handleOpenCrewStatus(member: CrewMember) {
    pushTrace(`[CREW] ${member.name} / 状态回传已切回控制台`);
    onOpenCrewStatusInControl(member.id);
  }

  function handleOpenCrewInventory(member: CrewMember) {
    pushTrace(`[PACK] ${member.name} / 背包回传已切回控制台`);
    onOpenCrewInventoryInControl(member.id);
  }

  function stagePointToWorld(clientX: number, clientY: number) {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) {
      return null;
    }
    const nx = (clientX - rect.left) / rect.width;
    const ny = (clientY - rect.top) / rect.height;
    return clampCoord({
      x: Math.floor(viewport.left + nx * viewport.width),
      y: Math.floor(viewport.top + (1 - ny) * viewport.height),
    });
  }

  function handleStageClick(event: React.MouseEvent<HTMLDivElement>) {
    if (dragRef.current?.moved) {
      return;
    }
    const coord = stagePointToWorld(event.clientX, event.clientY);
    if (!coord) {
      return;
    }
    setFocusCoord(coord);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    dragRef.current = { x: event.clientX, y: event.clientY, centerX: center.x, centerY: center.y, moved: false };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const rect = stageRef.current?.getBoundingClientRect();
    if (!drag || !rect) {
      return;
    }
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      drag.moved = true;
    }
    setCenter(
      clampCoord({
        x: Math.round(drag.centerX - (dx / rect.width) * viewport.width),
        y: Math.round(drag.centerY + (dy / rect.height) * viewport.height),
      }),
    );
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.moved) {
      pushTrace(`[PAN] center ${center.x},${center.y}`);
    }
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const nextZoom = clamp(zoom * (event.deltaY < 0 ? 1.14 : 1 / 1.14), 0.7, 6);
    if (nextZoom === zoom) {
      return;
    }
    setZoom(nextZoom);
    pushTrace(`[ZOOM] ${nextZoom.toFixed(2)}x / render + function`);
  }

  useEffect(() => {
    if (!showRenderLayer) {
      return undefined;
    }

    if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent)) {
      return undefined;
    }

    if (!(canvasRef.current instanceof HTMLCanvasElement)) {
      return undefined;
    }
    const canvasEl = canvasRef.current;

    const ctx = canvasEl.getContext("2d");
    if (!ctx) {
      return undefined;
    }
    const context: CanvasRenderingContext2D = ctx;

    const palette: Record<RenderTone, string> = {
      g: "#9bbf74",
      d: "#8f7a5d",
      c: "#74a6a6",
      a: "#f0a64d",
      w: "#e7d0a4",
      s: "#7dffb1",
      r: "#ff6b5f",
    };

    let animationId = 0;
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    const glitches: RenderGlitch[] = [];
    let nextGlitch = 0;

    function resize() {
      const rect = canvasEl.getBoundingClientRect();
      canvasEl.width = Math.max(1, Math.floor(rect.width * dpr));
      canvasEl.height = Math.max(1, Math.floor(rect.height * dpr));
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.imageSmoothingEnabled = false;
      context.font = `${window.innerWidth < 980 ? 10 : 12}px "Fusion Pixel 10px Monospaced zh_hans", "Fusion Pixel 10px Monospaced latin", "Press Start 2P", "Pixelify Sans", "IBM Plex Mono", "Courier New", monospace`;
      context.textBaseline = "top";
    }

    function render(time: number) {
      const width = canvasEl.width / dpr;
      const height = canvasEl.height / dpr;
      const cols = Math.max(24, Math.floor(width / CELL_W));
      const rows = Math.max(18, Math.floor(height / CELL_H));
      const chars = makeRenderBuffer<string>(rows, cols, " ");
      const tones = makeRenderBuffer<RenderTone>(rows, cols, "g");

      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvasEl.width, canvasEl.height);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.fillStyle = "#10110d";
      context.fillRect(0, 0, width, height);

      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const worldX = Math.floor(viewport.left + (col / cols) * viewport.width);
          const worldY = Math.floor(viewport.top + ((rows - row) / rows) * viewport.height);
          const { char, tone } = sampleRenderCell(worldX, worldY, focusCoord, crewWorldCoords);
          chars[row][col] = char;
          tones[row][col] = tone;
        }
      }

      applyRenderGlitch(chars, tones, glitches, time, nextGlitch, (value) => {
        nextGlitch = value;
      });

      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const char = chars[row][col];
          if (char === " ") {
            continue;
          }
          context.fillStyle = palette[tones[row][col]] ?? palette.g;
          context.fillText(char, col * CELL_W + 2, row * CELL_H + 1);
        }
      }

      context.fillStyle = "rgba(255,255,255,0.04)";
      context.fillRect(0, ((time / 14) % (height + 40)) - 20, width, 2);

      animationId = window.requestAnimationFrame(render);
    }

    resize();
    animationId = window.requestAnimationFrame(render);
    window.addEventListener("resize", resize);

    return () => {
      window.cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
    };
  }, [crewWorldCoords, focusCoord, showRenderLayer, viewport]);

  useEffect(() => {
    if (!showFunctionalLayer) {
      return undefined;
    }

    if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent)) {
      return undefined;
    }

    if (!(functionCanvasRef.current instanceof HTMLCanvasElement)) {
      return undefined;
    }
    const canvasEl = functionCanvasRef.current;
    const ctx = canvasEl.getContext("2d");
    if (!ctx) {
      return undefined;
    }
    const context: CanvasRenderingContext2D = ctx;
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));

    function resize() {
      const rect = canvasEl.getBoundingClientRect();
      canvasEl.width = Math.max(1, Math.floor(rect.width * dpr));
      canvasEl.height = Math.max(1, Math.floor(rect.height * dpr));
      drawFunctionLayer();
    }

    function drawFunctionLayer() {
      const width = canvasEl.width / dpr;
      const height = canvasEl.height / dpr;
      const cellW = width / viewport.width;
      const cellH = height / viewport.height;
      const visibleLeft = Math.max(0, Math.floor(viewport.left));
      const visibleRight = Math.min(WORLD_SIZE - 1, Math.ceil(viewport.left + viewport.width));
      const visibleBottom = Math.max(0, Math.floor(viewport.top));
      const visibleTop = Math.min(WORLD_SIZE - 1, Math.ceil(viewport.top + viewport.height));

      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvasEl.width, canvasEl.height);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      context.fillStyle = "rgba(120, 216, 255, 0.3)";
      for (let y = visibleBottom; y <= visibleTop; y += 1) {
        for (let x = visibleLeft; x <= visibleRight; x += 1) {
          const sx = (x - viewport.left) * cellW;
          const sy = (viewport.top + viewport.height - y - 1) * cellH;
          context.fillRect(sx, sy, Math.max(0.55, cellW * 0.34), Math.max(0.55, cellH * 0.34));
        }
      }

      if (
        focusCoord.x >= visibleLeft &&
        focusCoord.x <= visibleRight &&
        focusCoord.y >= visibleBottom &&
        focusCoord.y <= visibleTop
      ) {
        const sx = (focusCoord.x - viewport.left) * cellW;
        const sy = (viewport.top + viewport.height - focusCoord.y - 1) * cellH;
        context.fillStyle = "rgba(255, 215, 131, 0.92)";
        context.fillRect(sx, sy, Math.max(2, cellW), Math.max(2, cellH));
        context.strokeStyle = "rgba(255, 215, 131, 0.98)";
        context.lineWidth = 1;
        context.strokeRect(sx - 1, sy - 1, Math.max(3, cellW + 2), Math.max(3, cellH + 2));
      }
    }

    resize();
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
    };
  }, [focusCoord, showFunctionalLayer, viewport]);

  return (
    <GameConsoleLayout
      title="卫星雷达地图"
      subtitle=""
      gameTimeLabel={gameTimeLabel}
      statusItems={[
        { label: "signal", value: `${Object.keys(activeCalls).length} 路` },
        { label: "focus", value: focusDisplayCoord },
        { label: "target", value: moveSelectionMember ? moveSelectionMember.name : focusLabel },
        { label: "mode", value: "RADAR" },
      ]}
      navItems={[
        { id: "control", label: "控制台", meta: "main", onClick: onOpenControl },
        { id: "task", label: "任务", meta: "task", onClick: onOpenTask },
        { id: "map", label: "地图", meta: "map", active: true },
      ]}
      crewPanel={
        <div className="console-crew-stack">
          {crew.map((member) => {
            const actionView = crewActionViews[member.id];
            return (
              <article key={member.id} className="console-crew-card">
                <div className="console-crew-avatar">{member.name.slice(0, 1)}</div>
                <div className="console-crew-copy">
                  <div className="console-crew-heading">
                    <strong>{member.name}</strong>
                    <span>{member.role}</span>
                    <span className={`console-crew-state-inline ${member.canCommunicate ? "console-crew-state-success" : "console-crew-state-danger"}`}>
                      {member.canCommunicate ? "在线" : "失联"}
                    </span>
                  </div>
                  <p>{member.location}</p>
                  <p>{actionView.statusText}</p>
                  <p>{actionView.timingText}</p>
                </div>
                <div className="console-crew-actions">
                  <button type="button" className="console-crew-button console-crew-button-secondary" onClick={() => handleOpenCrewStatus(member)}>
                    查看状态
                  </button>
                  <button type="button" className="console-crew-button console-crew-button-secondary" onClick={() => handleOpenCrewInventory(member)}>
                    查看背包
                  </button>
                  <button type="button" className="console-crew-button" onClick={() => onStartCall(member.id)} disabled={!member.canCommunicate}>
                    通话
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      }
      rightPanel={
        <section className="console-side-panel">
          <div className="console-column-header">
            <span>map trace</span>
          </div>
          <div className="console-map-trace">
            <p className="console-map-trace-lead">
              [TEMP DEV] 这两个按钮只是临时调试开关，用来单独检查渲染层和 256x256 功能坐标层。
            </p>
            <div className="console-layer-toggle-list">
              <button
                type="button"
                className={`console-layer-toggle ${showRenderLayer ? "console-layer-toggle-active" : ""}`}
                onClick={() => {
                  setShowRenderLayer((value) => !value);
                  pushTrace(`[LAYER] render ${showRenderLayer ? "OFF" : "ON"}`);
                }}
              >
                显示渲染层
              </button>
              <button
                type="button"
                className={`console-layer-toggle ${showFunctionalLayer ? "console-layer-toggle-active" : ""}`}
                onClick={() => {
                  setShowFunctionalLayer((value) => !value);
                  pushTrace(`[LAYER] function ${showFunctionalLayer ? "OFF" : "ON"}`);
                }}
              >
                显示功能层
              </button>
            </div>
            <p className="console-map-trace-lead">
              {returnTarget === "call" ? "本次从通话进入：地图交互仍需回到通话确认。" : "临时开发模式：渲染层与功能层已拆分显示。"}
            </p>
            <p className="console-map-trace-line">[WORLD] 256 x 256 interactive coordinate grid</p>
            <p className="console-map-trace-line">[JSON] future hooks / links / triggers attach here</p>
            {traceLines.length ? (
              traceLines.map((line, index) => (
                <p key={`${index}-${line}`} className={index === 0 ? "console-map-trace-line console-map-trace-line-active" : "console-map-trace-line"}>
                  {line}
                </p>
              ))
            ) : (
              <p className="console-map-trace-line">[MAP] WAITING FOR 256x256 FIELD INPUT</p>
            )}
          </div>
        </section>
      }
      bottomBar={
        <div className="console-bottom-strip">
          <strong>] LOG:</strong>
          <span>{latestLog ? latestLog.text : "雷达界面在线。"}</span>
        </div>
      }
    >
      <div className="console-screen-content console-map-screen">
        <div className="console-screen-header">
          <span>crt situation map</span>
          <strong>卫星雷达地图 / retro lofi field</strong>
          <span>render + function / 256 x 256</span>
        </div>

        <div
          ref={stageRef}
          className={`console-ascii-map-stage ${dragging ? "console-ascii-map-stage-dragging" : ""}`}
          aria-label="ASCII 地图"
          role="application"
          onClick={handleStageClick}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
        >
          {showRenderLayer ? (
            <canvas ref={canvasRef} className="console-retro-map-render-layer console-retro-map-canvas" aria-hidden="true" />
          ) : null}

          {showFunctionalLayer ? (
            <div className="console-retro-map-function-layer" aria-hidden="true">
              <canvas ref={functionCanvasRef} className="console-retro-map-function-canvas" />
            </div>
          ) : null}

          <div className="console-ascii-map-readout">
            <span>focus {focusDisplayCoord}</span>
            <span>render {showRenderLayer ? "ON" : "OFF"}</span>
            <span>function {showFunctionalLayer ? "ON" : "OFF"}</span>
          </div>
        </div>
      </div>
    </GameConsoleLayout>
  );
}

function makeRenderBuffer<T>(rows: number, cols: number, fill: T) {
  return Array.from({ length: rows }, () => Array<T>(cols).fill(fill));
}

function applyRenderGlitch(
  chars: string[][],
  tones: RenderTone[][],
  glitches: RenderGlitch[],
  time: number,
  nextGlitch: number,
  setNextGlitch: (time: number) => void,
) {
  const rows = chars.length;
  const cols = chars[0]?.length ?? 0;
  if (!rows || !cols) {
    return;
  }

  if (time > nextGlitch) {
    spawnRenderGlitch(glitches, rows, cols, time);
    if (Math.random() > 0.66) {
      spawnRenderGlitch(glitches, rows, cols, time);
    }
    setNextGlitch(time + 350 + Math.random() * 420);
  }

  for (let index = glitches.length - 1; index >= 0; index -= 1) {
    const glitch = glitches[index];
    const age = time - glitch.start;
    if (age > glitch.duration) {
      glitches.splice(index, 1);
      continue;
    }

    const strength = 1 - age / glitch.duration;
    const rowStart = Math.floor(clamp(glitch.y - glitch.radius, 0, rows - 1));
    const rowEnd = Math.floor(clamp(glitch.y + glitch.radius, 0, rows - 1));

    for (let row = rowStart; row <= rowEnd; row += 1) {
      if (Math.random() > 0.44) {
        continue;
      }
      const sourceChars = chars[row].slice();
      const sourceTones = tones[row].slice();
      const shift = Math.floor(glitch.kick * strength + (Math.random() - 0.5) * glitch.radius * 0.45);
      for (let col = 0; col < cols; col += 1) {
        const sourceCol = col - shift;
        if (sourceCol >= 0 && sourceCol < cols) {
          chars[row][col] = sourceChars[sourceCol];
          tones[row][col] = sourceTones[sourceCol];
        }
      }
    }

    for (let block = 0; block < 5; block += 1) {
      const blockX = Math.floor(clamp(glitch.x + (Math.random() - 0.5) * glitch.radius, 0, Math.max(0, cols - 8)));
      const blockY = Math.floor(clamp(glitch.y + (Math.random() - 0.5) * glitch.radius, 0, Math.max(0, rows - 2)));
      const blockW = 3 + Math.floor(Math.random() * 9);
      for (let col = 0; col < blockW && blockX + col < cols; col += 1) {
        chars[blockY][blockX + col] = Math.random() > 0.38 ? "#" : "@";
        tones[blockY][blockX + col] = Math.random() > 0.55 ? "r" : "a";
      }
    }
  }
}

function spawnRenderGlitch(glitches: RenderGlitch[], rows: number, cols: number, time: number) {
  glitches.push({
    x: Math.floor(Math.random() * cols),
    y: Math.floor(Math.random() * rows),
    radius: 5 + Math.random() * 14,
    start: time,
    duration: 150 + Math.random() * 260,
    kick: (Math.random() < 0.5 ? -1 : 1) * (2 + Math.floor(Math.random() * 8)),
  });
  if (glitches.length > 18) {
    glitches.shift();
  }
}

function sampleRenderCell(x: number, y: number, focusCoord: FocusCoord, crewWorldCoords: Map<CrewId, FocusCoord>) {
  for (const coord of crewWorldCoords.values()) {
    if (distance(x, y, coord.x, coord.y) <= 1.2) {
      return { char: "@", tone: "c" as RenderTone };
    }
  }

  if (x === focusCoord.x && y === focusCoord.y) {
    return { char: "X", tone: "s" as RenderTone };
  }

  const wx = (x - ORIGIN.x) / 16;
  const wy = (y - ORIGIN.y) / 16;
  const e =
    Math.sin(wx * 1.2) * 0.44 +
    Math.sin(wy * 1.6 + wx * 0.35) * 0.28 +
    Math.cos((wx + wy) * 0.7) * 0.22 +
    Math.sin(wx * 2.7 - wy * 2.1) * 0.09;
  const level = clamp((e + 1.15) / 2.3, 0, 1);
  const char = RETRO_RAMP[Math.floor(level * (RETRO_RAMP.length - 1))] ?? ".";
  const tone: RenderTone = level < 0.28 ? "c" : level < 0.62 ? "g" : "a";
  return { char, tone };
}

function getViewport(center: FocusCoord, zoom: number) {
  const width = WORLD_SIZE / zoom;
  const height = WORLD_SIZE / zoom;
  return {
    width,
    height,
    left: center.x - width / 2,
    top: center.y - height / 2,
  };
}

function sampleWorldLabel(x: number, y: number) {
  if (distance(x, y, 128, 128) <= 6) return "坠毁初始落点";
  if (distance(x, y, 132, 120) <= 6) return "拾荒营地";
  if (distance(x, y, 128, 168) <= 8) return "霜湾聚落";
  if (distance(x, y, 128, 88) <= 8) return "烬炉城寨";
  if (inBox(x, y, 140, 136, 188, 184)) return "门域";
  if (inBox(x, y, 96, 96, 160, 160)) return "灰烬霜带";
  return "未命名区域";
}

function toDisplayCoord(coord: FocusCoord): FocusCoord {
  return {
    x: coord.x - ORIGIN.x,
    y: coord.y - ORIGIN.y,
  };
}

function formatDisplayCoord(coord: FocusCoord) {
  const display = toDisplayCoord(coord);
  return `(${display.x},${display.y})`;
}

function focusFromTileId(tileId?: string): FocusCoord {
  return worldFromCrewTile(tileId ?? "4-4");
}

function worldFromCrewTile(tileId?: string): FocusCoord {
  const match = /^(\d+)-(\d+)$/.exec(tileId ?? "");
  if (!match) {
    return { x: ORIGIN.x, y: ORIGIN.y };
  }
  const row = Number(match[1]);
  const col = Number(match[2]);
  return {
    x: clamp(ORIGIN.x + (col - 4) * 8, 0, WORLD_SIZE - 1),
    y: clamp(ORIGIN.y + (4 - row) * 8, 0, WORLD_SIZE - 1),
  };
}

function clampCoord(coord: FocusCoord): FocusCoord {
  return {
    x: clamp(coord.x, 0, WORLD_SIZE - 1),
    y: clamp(coord.y, 0, WORLD_SIZE - 1),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function distance(x: number, y: number, tx: number, ty: number) {
  return Math.hypot(x - tx, y - ty);
}

function inBox(x: number, y: number, x1: number, y1: number, x2: number, y2: number) {
  return x >= x1 && x <= x2 && y >= y1 && y <= y2;
}
