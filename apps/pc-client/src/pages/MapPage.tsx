import { useEffect, useMemo, useRef, useState } from "react";
import { FieldList, GameConsoleLayout } from "../components/Layout";
import { defaultMapConfig, type MapTileDefinition } from "../content/contentData";
import type { CrewId, CrewMember, GameMapState, MapReturnTarget, MapTile, SystemLog } from "../data/gameData";
import { deriveCrewActionViewModel, type CrewActionViewModel } from "../crewSystem";
import type { CrewActionState, RuntimeCall } from "../events/types";
import { formatMapObjectStatus, parseTileId, resolveVisibleTileObjects } from "../mapSystem";

const CELL_W = 8;
const CELL_H = 10;
const MIN_ZOOM = 1;
const MAX_ZOOM = 6;
const RADAR = defaultMapConfig.radar;
const RADAR_WORLD = RADAR.world;

type FocusCoord = { x: number; y: number };
type RenderTone = string;

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
  map: GameMapState;
  onOpenControl: () => void;
  onOpenTask: () => void;
  onReturnFromMap: () => void;
  onSelectMoveTarget: (tileId: string) => void;
  onStartCall: (crewId: CrewId) => void;
  onShowCrewStatus: (crewId: CrewId) => void;
  onShowCrewInventory: (crewId: CrewId) => void;
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
  map,
  onOpenControl,
  onOpenTask,
  onReturnFromMap,
  onSelectMoveTarget,
  onStartCall,
  onShowCrewStatus,
  onShowCrewInventory,
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
  const configTileById = useMemo(() => new Map(defaultMapConfig.tiles.map((tile) => [tile.id, tile])), []);
  const crewWorldCoords = useMemo(() => new Map(crew.map((member) => [member.id, radarCoordFromTileId(member.currentTile)])), [crew]);
  const focusTileId = useMemo(() => tileIdFromRadarCoord(focusCoord), [focusCoord]);
  const focusConfigTile = configTileById.get(focusTileId);
  const focusLabel = useMemo(() => getRadarFocusLabel(focusCoord, focusConfigTile), [focusCoord, focusConfigTile]);
  const focusDisplayCoord = useMemo(() => formatDisplayCoord(focusCoord), [focusCoord]);
  const visibleFocusObjects = useMemo(() => (focusConfigTile ? resolveVisibleTileObjects(focusConfigTile, map) : []), [focusConfigTile, map]);
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
    pushTrace(`[CREW] ${member.name} / 打开角色状态页`);
    onShowCrewStatus(member.id);
  }

  function handleOpenCrewInventory(member: CrewMember) {
    pushTrace(`[PACK] ${member.name} / 打开角色背包页`);
    onShowCrewInventory(member.id);
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
      y: Math.floor(viewport.top + ny * viewport.height),
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
    const nextZoom = clamp(zoom * (event.deltaY < 0 ? 1.14 : 1 / 1.14), MIN_ZOOM, MAX_ZOOM);
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

    if (isE2eAnimationDisabled()) {
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

    const palette: Record<RenderTone, string> = RADAR.palette;

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
          const worldY = Math.floor(viewport.top + (row / rows) * viewport.height);
          const { char, tone } = sampleRadarCell(worldX, worldY, focusCoord, crewWorldCoords);
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
      const visibleRight = Math.min(RADAR_WORLD.width - 1, Math.ceil(viewport.left + viewport.width));
      const visibleTop = Math.max(0, Math.floor(viewport.top));
      const visibleBottom = Math.min(RADAR_WORLD.height - 1, Math.ceil(viewport.top + viewport.height));

      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvasEl.width, canvasEl.height);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      context.fillStyle = "rgba(120, 216, 255, 0.3)";
      for (let y = visibleTop; y <= visibleBottom; y += 1) {
        for (let x = visibleLeft; x <= visibleRight; x += 1) {
          const sx = (x - viewport.left) * cellW;
          const sy = (y - viewport.top) * cellH;
          context.fillRect(sx, sy, Math.max(0.55, cellW * 0.34), Math.max(0.55, cellH * 0.34));
        }
      }

      if (
        focusCoord.x >= visibleLeft &&
        focusCoord.x <= visibleRight &&
        focusCoord.y >= visibleTop &&
        focusCoord.y <= visibleBottom
      ) {
        const sx = (focusCoord.x - viewport.left) * cellW;
        const sy = (focusCoord.y - viewport.top) * cellH;
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
        <div className="console-right-stack">
          <section className="console-side-panel">
            <div className="console-column-header">
              <span>地图详情</span>
            </div>
            <FieldList
              rows={[
                ["区块", focusTileId],
                ["坐标", focusDisplayCoord],
                ["区域", focusLabel],
                ["地形", focusConfigTile?.terrain ?? "未知地形"],
                ["天气", focusConfigTile?.weather ?? "未知天气"],
              ]}
            />
            <div className="console-map-trace" aria-label="当前可见地图对象">
              <p className="console-map-trace-lead">地图对象</p>
              {visibleFocusObjects.length ? (
                visibleFocusObjects.map(({ definition, runtime }) => (
                  <p key={definition.id} className="console-map-trace-line">
                    {formatMapObjectLabel(definition.name, formatMapObjectStatus(runtime?.status_enum ?? definition.initial_status))}
                  </p>
                ))
              ) : (
                <p className="console-map-trace-line">无当前可见对象</p>
              )}
            </div>
          </section>

          <section className="console-side-panel">
            <div className="console-column-header">
              <span>map trace</span>
            </div>
            <div className="console-map-trace">
              <p className="console-map-trace-lead">
                {RADAR.trace.layerNotice}
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
                {returnTarget === "call" ? RADAR.trace.callMode : RADAR.trace.controlMode}
              </p>
              <p className="console-map-trace-line">{RADAR.trace.worldLine}</p>
              <p className="console-map-trace-line">{RADAR.trace.jsonLine}</p>
              <p className="console-map-trace-line">
                [TILE] {focusTileId} / {focusConfigTile?.terrain ?? "未知地形"} / {focusConfigTile?.weather ?? "未知天气"}
              </p>
              {returnTarget === "call" ? (
                <div className="console-map-return-actions">
                  {moveSelectionMember ? (
                    <button
                      type="button"
                      className="console-crew-button"
                      onClick={() => {
                        pushTrace(`[SELECT] ${focusTileId} / ${focusLabel}`);
                        onSelectMoveTarget(focusTileId);
                      }}
                    >
                      标记当前坐标
                    </button>
                  ) : null}
                  <button type="button" className="console-crew-button console-crew-button-secondary" onClick={onReturnFromMap}>
                    返回当前通话
                  </button>
                </div>
              ) : null}
              {traceLines.length ? (
                traceLines.map((line, index) => (
                  <p key={`${index}-${line}`} className={index === 0 ? "console-map-trace-line console-map-trace-line-active" : "console-map-trace-line"}>
                    {line}
                  </p>
                ))
              ) : (
                <p className="console-map-trace-line">{RADAR.trace.emptyLine}</p>
              )}
            </div>
          </section>
        </div>
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
          <span>render + function / {RADAR_WORLD.width} x {RADAR_WORLD.height}</span>
        </div>

        <div
          ref={stageRef}
          className={`console-ascii-map-stage ${dragging ? "console-ascii-map-stage-dragging" : ""}`}
          aria-label="ASCII 地图"
          data-focus-tile-id={focusTileId}
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

function sampleRadarCell(x: number, y: number, focusCoord: FocusCoord, crewWorldCoords: Map<CrewId, FocusCoord>) {
  for (const coord of crewWorldCoords.values()) {
    if (distance(x, y, coord.x, coord.y) <= 1.2) {
      return { char: RADAR.symbols.crew.glyph, tone: RADAR.symbols.crew.tone as RenderTone };
    }
  }

  if (x === focusCoord.x && y === focusCoord.y) {
    return { char: RADAR.symbols.focus.glyph, tone: RADAR.symbols.focus.tone as RenderTone };
  }

  if (x < 0 || y < 0 || x >= RADAR_WORLD.width || y >= RADAR_WORLD.height) {
    return { char: " ", tone: "g" as RenderTone };
  }

  const row = RADAR.glyphRows[y] ?? "";
  const toneRow = RADAR.toneRows[y] ?? "";
  return {
    char: row[x] ?? " ",
    tone: (toneRow[x] ?? "g") as RenderTone,
  };
}

function getViewport(center: FocusCoord, zoom: number) {
  const width = Math.min(RADAR_WORLD.width, RADAR_WORLD.width / zoom);
  const height = Math.min(RADAR_WORLD.height, RADAR_WORLD.height / zoom);
  return {
    width,
    height,
    left: clamp(center.x - width / 2, 0, Math.max(0, RADAR_WORLD.width - width)),
    top: clamp(center.y - height / 2, 0, Math.max(0, RADAR_WORLD.height - height)),
  };
}

function getRadarFocusLabel(coord: FocusCoord, tile: MapTileDefinition | undefined) {
  if (tile && tile.areaName !== "未命名区域") {
    return tile.areaName;
  }

  const region = [...RADAR.regions]
    .sort((left, right) => right.priority - left.priority)
    .find((entry) => isInsideRegion(coord, entry.shape));
  return region?.label ?? tile?.areaName ?? "未命名区域";
}

function formatMapObjectLabel(name: string, statusLabel: string) {
  return statusLabel ? `${name}（${statusLabel}）` : name;
}

function isInsideRegion(coord: FocusCoord, shape: (typeof RADAR.regions)[number]["shape"]) {
  if (shape.type === "circle") {
    return distance(coord.x, coord.y, shape.x, shape.y) <= shape.radius;
  }

  return coord.x >= shape.x1 && coord.x <= shape.x2 && coord.y >= shape.y1 && coord.y <= shape.y2;
}

function formatDisplayCoord(coord: FocusCoord) {
  return `(${coord.x - RADAR_WORLD.origin.x},${RADAR_WORLD.origin.y - coord.y})`;
}

function focusFromTileId(tileId?: string): FocusCoord {
  return radarCoordFromTileId(tileId ?? defaultMapConfig.originTileId);
}

function tileIdFromRadarCoord(coord: FocusCoord) {
  return `${coord.y + 1}-${coord.x + 1}`;
}

function radarCoordFromTileId(tileId?: string): FocusCoord {
  const coord = tileId ? parseTileId(tileId) : null;
  if (!coord) {
    return clampCoord(RADAR_WORLD.origin);
  }

  return clampCoord({ x: coord.col - 1, y: coord.row - 1 });
}

function clampCoord(coord: FocusCoord): FocusCoord {
  return {
    x: clamp(coord.x, 0, RADAR_WORLD.width - 1),
    y: clamp(coord.y, 0, RADAR_WORLD.height - 1),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function distance(x: number, y: number, tx: number, ty: number) {
  return Math.hypot(x - tx, y - ty);
}

function isE2eAnimationDisabled() {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem("stellar-frontier-e2e-disable-animation") === "1";
  } catch {
    return false;
  }
}
