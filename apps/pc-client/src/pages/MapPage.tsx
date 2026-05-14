import { useEffect, useMemo, useRef, useState } from "react";
import { FieldList, GameConsoleLayout } from "../components/Layout";
import { defaultMapConfig, type MapFeatureDefinition } from "../content/contentData";
import type { CrewId, CrewMember, GameMapState, MapReturnTarget, MapTile, SystemLog } from "../data/gameData";
import { deriveCrewActionViewModel, isTilePassable, type CrewActionViewModel } from "../crewSystem";
import type { CrewActionState, RuntimeCall } from "../events/types";
import { buildFeatureTileIndex, expandFeatureFootprint, getVisibleFeaturesAtTile } from "../mapFeatureSystem";
import { parseTileId } from "../mapSystem";

const CELL_W = 8;
const CELL_H = 10;
const MIN_ZOOM = 1;
const MAX_ZOOM = 6;
const RADAR = defaultMapConfig.radar;
const RADAR_WORLD = RADAR.world;
const MAP_DEBUG_SYMBOLS = {
  blocked: "X",
  investigatableRevealed: "I",
  investigatableUnrevealed: "?",
} as const;
const MAP_DEBUG_BACKGROUND_START = { r: 69, g: 174, b: 255 };
const MAP_DEBUG_BACKGROUND_END = { r: 255, g: 219, b: 82 };

export interface MapLayerVisibility {
  render: boolean;
  functional: boolean;
  crew: boolean;
  debug: boolean;
}

export const DEFAULT_MAP_LAYER_VISIBILITY: MapLayerVisibility = {
  render: true,
  functional: true,
  crew: false,
  debug: false,
};

type FocusCoord = { x: number; y: number };
type RenderTone = string;

export interface MapViewportState {
  zoom: number;
  center: { x: number; y: number };
}

interface MapDebugBackgroundCell extends FocusCoord {
  tileId: string;
  featureOrder: number;
  featureCount: number;
}

interface MapDebugInvestigatableCell extends FocusCoord {
  tileId: string;
  hasUnrevealed: boolean;
  symbol: string;
}

interface MapDebugBlockedCell extends FocusCoord {
  tileId: string;
  symbol: string;
}

interface MapDebugLayerData {
  backgrounds: MapDebugBackgroundCell[];
  investigatables: MapDebugInvestigatableCell[];
  blocked: MapDebugBlockedCell[];
}

interface MapCrewMarker extends FocusCoord {
  tileId: string;
  label: string;
}

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
  map: GameMapState;
  crew: CrewMember[];
  crewActions: Record<string, CrewActionState>;
  activeCalls: Record<string, RuntimeCall>;
  elapsedGameSeconds: number;
  gameTimeLabel: string;
  hasQuestUpdates?: boolean;
  returnTarget: MapReturnTarget;
  moveSelectionCrewId?: CrewId | null;
  initialSelectedTileId?: string;
  viewportState?: MapViewportState | null;
  onViewportStateChange?: (state: MapViewportState) => void;
  layerVisibility: MapLayerVisibility;
  onLayerVisibilityChange: (visibility: MapLayerVisibility) => void;
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
  map,
  crew,
  crewActions,
  activeCalls,
  elapsedGameSeconds,
  gameTimeLabel,
  hasQuestUpdates = false,
  returnTarget,
  moveSelectionCrewId,
  initialSelectedTileId,
  viewportState,
  onViewportStateChange,
  layerVisibility,
  onLayerVisibilityChange,
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
  const [zoom, setZoom] = useState(() => clamp(viewportState?.zoom ?? 1, MIN_ZOOM, MAX_ZOOM));
  const [center, setCenter] = useState<FocusCoord>(() => clampCoord(viewportState?.center ?? initialFocus));
  const [dragging, setDragging] = useState(false);
  const showRenderLayer = layerVisibility.render;
  const showFunctionalLayer = layerVisibility.functional;
  const showCrewLayer = layerVisibility.crew;
  const showDebugLayer = layerVisibility.debug;
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const functionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const crewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const debugCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; centerX: number; centerY: number; moved: boolean } | null>(null);
  const configTileById = useMemo(() => new Map(defaultMapConfig.tiles.map((tile) => [tile.id, tile])), []);
  const featureTileIndex = useMemo(() => buildFeatureTileIndex(defaultMapConfig), []);
  const focusTileId = useMemo(() => tileIdFromRadarCoord(focusCoord), [focusCoord]);
  const focusConfigTile = configTileById.get(focusTileId);
  const visibleFocusFeatures = useMemo(
    () => getVisibleFeaturesAtTile(defaultMapConfig, featureTileIndex, map, focusTileId),
    [featureTileIndex, focusTileId, map],
  );
  const backgroundFocusFeatures = useMemo(() => visibleFocusFeatures.filter((feature) => feature.investigatable !== true), [visibleFocusFeatures]);
  const investigatableFocusFeatures = useMemo(() => visibleFocusFeatures.filter((feature) => feature.investigatable === true), [visibleFocusFeatures]);
  const focusLabel = useMemo(() => getRadarFocusLabel(backgroundFocusFeatures), [backgroundFocusFeatures]);
  const focusDisplayCoord = useMemo(() => formatDisplayCoord(focusCoord), [focusCoord]);
  const viewport = useMemo(() => getViewport(center, zoom), [center, zoom]);
  const mapDebugData = useMemo(() => getMapDebugData(tiles, map), [map, tiles]);
  const crewMarkers = useMemo(() => getMapCrewMarkers(crew), [crew]);
  const mapCallReturnActions = returnTarget === "call" ? (
    <div className="console-map-return-actions" aria-label="通话地图操作">
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
  ) : null;

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

  useEffect(() => {
    onViewportStateChange?.({ zoom, center });
  }, [center, onViewportStateChange, zoom]);

  function pushTrace(line: string) {
    setTraceLines((current) => [line, ...current].slice(0, 10));
  }

  function toggleLayer(layer: keyof MapLayerVisibility, traceName: string) {
    const nextValue = !layerVisibility[layer];
    onLayerVisibilityChange({ ...layerVisibility, [layer]: nextValue });
    pushTrace(`[LAYER] ${traceName} ${nextValue ? "ON" : "OFF"}`);
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
          const { char, tone } = sampleRadarCell(worldX, worldY, focusCoord);
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
  }, [focusCoord, showRenderLayer, viewport]);

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

  useEffect(() => {
    if (!showCrewLayer) {
      return undefined;
    }

    if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent)) {
      return undefined;
    }

    if (!(crewCanvasRef.current instanceof HTMLCanvasElement)) {
      return undefined;
    }
    const canvasEl = crewCanvasRef.current;
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
      drawCrewLayer();
    }

    function drawCrewLayer() {
      const width = canvasEl.width / dpr;
      const height = canvasEl.height / dpr;
      const cellW = width / viewport.width;
      const cellH = height / viewport.height;
      const markerRadius = clamp(Math.min(cellW, cellH) * 1.8, 5, 14);
      const fontSize = clamp(markerRadius * 1.25, 8, 14);

      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvasEl.width, canvasEl.height);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.font = `${fontSize}px "Fusion Pixel 10px Monospaced zh_hans", "Fusion Pixel 10px Monospaced latin", "Press Start 2P", "Pixelify Sans", "IBM Plex Mono", "Courier New", monospace`;
      context.textAlign = "left";
      context.textBaseline = "middle";

      for (const marker of crewMarkers) {
        if (!isCoordInsideViewport(marker, viewport)) {
          continue;
        }

        const sx = (marker.x - viewport.left) * cellW + cellW / 2;
        const sy = (marker.y - viewport.top) * cellH + cellH / 2;
        const labelX = sx + markerRadius + 5;
        const labelWidth = context.measureText(marker.label).width;

        context.fillStyle = "rgba(64, 255, 202, 0.18)";
        context.beginPath();
        context.arc(sx, sy, markerRadius + 2, 0, Math.PI * 2);
        context.fill();

        context.strokeStyle = "rgba(64, 255, 202, 0.92)";
        context.lineWidth = 1;
        context.beginPath();
        context.arc(sx, sy, markerRadius, 0, Math.PI * 2);
        context.stroke();
        context.beginPath();
        context.moveTo(sx - markerRadius - 4, sy);
        context.lineTo(sx + markerRadius + 4, sy);
        context.moveTo(sx, sy - markerRadius - 4);
        context.lineTo(sx, sy + markerRadius + 4);
        context.stroke();

        context.fillStyle = "rgba(11, 20, 18, 0.76)";
        context.fillRect(labelX - 3, sy - fontSize * 0.74, labelWidth + 6, fontSize * 1.48);
        context.fillStyle = "rgba(208, 255, 236, 0.96)";
        context.fillText(marker.label, labelX, sy);
      }
    }

    resize();
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
    };
  }, [crewMarkers, showCrewLayer, viewport]);

  useEffect(() => {
    if (!showDebugLayer) {
      return undefined;
    }

    if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent)) {
      return undefined;
    }

    if (!(debugCanvasRef.current instanceof HTMLCanvasElement)) {
      return undefined;
    }
    const canvasEl = debugCanvasRef.current;
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
      drawDebugLayer();
    }

    function drawDebugLayer() {
      const width = canvasEl.width / dpr;
      const height = canvasEl.height / dpr;
      const cellW = width / viewport.width;
      const cellH = height / viewport.height;
      const fontSize = clamp(Math.min(cellW, cellH) * 0.92, 7, 14);

      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvasEl.width, canvasEl.height);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.font = `${fontSize}px "Fusion Pixel 10px Monospaced zh_hans", "Fusion Pixel 10px Monospaced latin", "Press Start 2P", "Pixelify Sans", "IBM Plex Mono", "Courier New", monospace`;
      context.textAlign = "center";
      context.textBaseline = "middle";

      for (const cell of mapDebugData.backgrounds) {
        if (!isCoordInsideViewport(cell, viewport)) {
          continue;
        }

        const sx = (cell.x - viewport.left) * cellW;
        const sy = (cell.y - viewport.top) * cellH;
        context.fillStyle = getBackgroundDebugFill(cell.featureOrder, cell.featureCount);
        context.fillRect(sx, sy, Math.max(1, cellW), Math.max(1, cellH));
      }

      for (const cell of mapDebugData.investigatables) {
        if (!isCoordInsideViewport(cell, viewport)) {
          continue;
        }

        const sx = (cell.x - viewport.left) * cellW;
        const sy = (cell.y - viewport.top) * cellH;
        const insetX = Math.max(0, cellW * 0.08);
        const insetY = Math.max(0, cellH * 0.08);
        context.fillStyle = getInvestigatableDebugFill(cell.hasUnrevealed);
        context.fillRect(sx + insetX, sy + insetY, Math.max(1, cellW - insetX * 2), Math.max(1, cellH - insetY * 2));
        context.strokeStyle = getInvestigatableDebugStroke(cell.hasUnrevealed);
        context.lineWidth = 1;
        context.strokeRect(sx + insetX, sy + insetY, Math.max(1, cellW - insetX * 2), Math.max(1, cellH - insetY * 2));
        context.fillStyle = getInvestigatableDebugTextColor(cell.hasUnrevealed);
        context.fillText(cell.symbol, sx + cellW / 2, sy + cellH / 2);
      }

      for (const cell of mapDebugData.blocked) {
        if (!isCoordInsideViewport(cell, viewport)) {
          continue;
        }

        const sx = (cell.x - viewport.left) * cellW;
        const sy = (cell.y - viewport.top) * cellH;
        context.fillStyle = getBlockedDebugFill();
        context.fillRect(sx, sy, Math.max(1, cellW), Math.max(1, cellH));
        context.fillStyle = getBlockedDebugTextColor();
        context.fillText(cell.symbol, sx + cellW / 2, sy + cellH / 2);
      }
    }

    resize();
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
    };
  }, [mapDebugData, showDebugLayer, viewport]);

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
        { id: "task", label: "任务", meta: "task", attention: hasQuestUpdates, onClick: onOpenTask },
        { id: "map", label: "地图", meta: "map", active: true },
      ]}
      crewPanel={
        <div className="console-crew-stack">
          {crew.map((member) => {
            const actionView = crewActionViews[member.id];
            const hasRuntimeCall = Object.values(activeCalls).some((call) => call.crew_id === member.id && isRuntimeCallActive(call, elapsedGameSeconds));
            const hasCallEntry = hasRuntimeCall || member.hasIncoming;
            const timingText = actionView.blockingReason ?? actionView.timingText;
            return (
              <article key={member.id} className={`console-crew-card ${hasCallEntry ? "console-crew-card-alert" : ""}`}>
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
                  {timingText ? <p>{timingText}</p> : null}
                </div>
                <div className="console-crew-actions">
                  <button type="button" className="console-crew-button console-crew-button-secondary" onClick={() => handleOpenCrewStatus(member)}>
                    查看状态
                  </button>
                  <button type="button" className="console-crew-button console-crew-button-secondary" onClick={() => handleOpenCrewInventory(member)}>
                    查看背包
                  </button>
                  <button type="button" className="console-crew-button" onClick={() => onStartCall(member.id)} disabled={!actionView.canStartCall}>
                    {hasCallEntry ? "接通" : "通话"}
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
            {mapCallReturnActions}
            <FieldList
              rows={[
                ["区块", focusTileId],
                ["坐标", focusDisplayCoord],
                ["区域", focusLabel],
                ["地形", focusConfigTile?.terrain ?? "未知地形"],
                ["天气", focusConfigTile?.weather ?? "未知天气"],
              ]}
            />
            {visibleFocusFeatures.length ? (
              <div className="console-map-feature-readout" aria-label="Feature 命中结果">
                {backgroundFocusFeatures.length ? <FeatureHitGroup label="背景" features={backgroundFocusFeatures} /> : null}
                {investigatableFocusFeatures.length ? <FeatureHitGroup label="可调查" features={investigatableFocusFeatures} map={map} /> : null}
              </div>
            ) : (
              <p className="console-map-trace-line">[FEATURE] 无可见 Feature</p>
            )}
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
                  onClick={() => toggleLayer("render", "render")}
                >
                  显示渲染层
                </button>
                <button
                  type="button"
                  className={`console-layer-toggle ${showFunctionalLayer ? "console-layer-toggle-active" : ""}`}
                  onClick={() => toggleLayer("functional", "function")}
                >
                  显示功能层
                </button>
                <button
                  type="button"
                  className={`console-layer-toggle ${showCrewLayer ? "console-layer-toggle-active" : ""}`}
                  onClick={() => toggleLayer("crew", "crew")}
                >
                  显示队员层
                </button>
                <button
                  type="button"
                  className={`console-layer-toggle ${showDebugLayer ? "console-layer-toggle-active" : ""}`}
                  onClick={() => toggleLayer("debug", "debug")}
                >
                  显示调试层
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
              <p className="console-map-trace-line">
                [DEBUG] {MAP_DEBUG_SYMBOLS.blocked}=blocked / {MAP_DEBUG_SYMBOLS.investigatableUnrevealed}=unrevealed / {MAP_DEBUG_SYMBOLS.investigatableRevealed}=revealed
              </p>
              <p className="console-map-trace-line">
                [DEBUG] bg blue-&gt;yellow / orange=unrevealed / white=revealed
              </p>
              <p className="console-map-trace-line">[CREW] cyan marker=当前队员位置 / label=姓名或同格人数</p>
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
          <span>render + function + crew + debug / {RADAR_WORLD.width} x {RADAR_WORLD.height}</span>
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

          {showCrewLayer ? (
            <div className="console-retro-map-crew-layer" aria-hidden="true">
              <canvas ref={crewCanvasRef} className="console-retro-map-crew-canvas" />
            </div>
          ) : null}

          {showDebugLayer ? (
            <div className="console-retro-map-debug-layer" aria-hidden="true">
              <canvas ref={debugCanvasRef} className="console-retro-map-debug-canvas" />
            </div>
          ) : null}

          <div className="console-ascii-map-readout">
            <span>focus {focusDisplayCoord}</span>
            <span>render {showRenderLayer ? "ON" : "OFF"}</span>
            <span>function {showFunctionalLayer ? "ON" : "OFF"}</span>
            <span>crew {showCrewLayer ? "ON" : "OFF"}</span>
            <span>debug {showDebugLayer ? "ON" : "OFF"}</span>
          </div>
        </div>
      </div>
    </GameConsoleLayout>
  );
}

function FeatureHitGroup({
  label,
  features,
  map,
}: {
  label: string;
  features: readonly MapFeatureDefinition[];
  map?: Pick<GameMapState, "featuresById">;
}) {
  return (
    <div className="console-map-feature-group">
      <span className="console-map-feature-kind">{label}</span>
      <ul className="console-map-feature-list">
        {features.map((feature) => {
          const status = getFeatureStatusForReadout(feature, map);
          return (
            <li key={feature.id} className="console-map-feature-item">
              <span className="console-map-feature-name">{feature.name}</span>
              {status ? <span className="console-map-feature-status">{status}</span> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function getFeatureStatusForReadout(feature: MapFeatureDefinition, map: Pick<GameMapState, "featuresById"> | undefined) {
  return map?.featuresById?.[feature.id]?.status ?? (feature.investigatable === true ? feature.initial_status : undefined);
}

function makeRenderBuffer<T>(rows: number, cols: number, fill: T) {
  return Array.from({ length: rows }, () => Array<T>(cols).fill(fill));
}

function getMapDebugData(tiles: MapTile[], map: Pick<GameMapState, "featuresById">): MapDebugLayerData {
  return {
    backgrounds: getMapDebugBackgroundCells(),
    investigatables: getMapDebugInvestigatableCells(map),
    blocked: getMapDebugBlockedCells(tiles),
  };
}

function getMapCrewMarkers(crew: CrewMember[]): MapCrewMarker[] {
  const membersByTileId = new Map<string, CrewMember[]>();
  for (const member of crew) {
    const members = membersByTileId.get(member.currentTile) ?? [];
    members.push(member);
    membersByTileId.set(member.currentTile, members);
  }

  return [...membersByTileId.entries()].flatMap(([tileId, members]) => {
    const firstMember = members[0];
    if (!firstMember || !parseTileId(tileId)) {
      return [];
    }

    return [
      {
        tileId,
        ...radarCoordFromTileId(tileId),
        label: members.length === 1 ? firstMember.name : `${members.length}人 ${members.map((member) => member.name).join("/")}`,
      },
    ];
  });
}

function getMapDebugBackgroundCells(): MapDebugBackgroundCell[] {
  const backgroundFeatures = defaultMapConfig.features.filter((feature) => feature.investigatable !== true);
  return backgroundFeatures.flatMap((feature, featureOrder) =>
    expandFeatureFootprint(feature, defaultMapConfig).flatMap((tileId) => {
      const coord = debugCoordFromTileId(tileId);
      if (!coord) {
        return [];
      }

      return [
        {
          tileId,
          featureOrder,
          featureCount: backgroundFeatures.length,
          ...coord,
        },
      ];
    }),
  );
}

function getMapDebugInvestigatableCells(map: Pick<GameMapState, "featuresById">): MapDebugInvestigatableCell[] {
  const cellsByTileId = new Map<string, MapDebugInvestigatableCell>();

  for (const feature of defaultMapConfig.features) {
    if (feature.investigatable !== true) {
      continue;
    }

    const hasUnrevealed = isDebugFeatureUnrevealed(feature, map);
    for (const tileId of expandFeatureFootprint(feature, defaultMapConfig)) {
      const coord = debugCoordFromTileId(tileId);
      if (!coord) {
        continue;
      }

      const previous = cellsByTileId.get(tileId);
      const nextHasUnrevealed = previous?.hasUnrevealed || hasUnrevealed;
      cellsByTileId.set(tileId, {
        tileId,
        ...coord,
        hasUnrevealed: nextHasUnrevealed,
        symbol: nextHasUnrevealed ? MAP_DEBUG_SYMBOLS.investigatableUnrevealed : MAP_DEBUG_SYMBOLS.investigatableRevealed,
      });
    }
  }

  return [...cellsByTileId.values()];
}

function getMapDebugBlockedCells(tiles: MapTile[]): MapDebugBlockedCell[] {
  return tiles.flatMap((tile) => {
    const coord = parseTileId(tile.id);
    if (!coord) {
      return [];
    }

    const blocked = !isTilePassable(tile);
    if (!blocked) {
      return [];
    }

    return [
      {
        tileId: tile.id,
        x: coord.col - 1,
        y: coord.row - 1,
        symbol: MAP_DEBUG_SYMBOLS.blocked,
      },
    ];
  });
}

function isDebugFeatureUnrevealed(feature: MapFeatureDefinition, map: Pick<GameMapState, "featuresById">) {
  return feature.visibility === "hidden" && map.featuresById?.[feature.id]?.revealed !== true;
}

function debugCoordFromTileId(tileId: string): FocusCoord | null {
  const coord = parseTileId(tileId);
  return coord ? { x: coord.col - 1, y: coord.row - 1 } : null;
}

function getBackgroundDebugFill(featureOrder: number, featureCount: number) {
  const ratio = featureCount <= 1 ? 0 : featureOrder / (featureCount - 1);
  const r = Math.round(lerp(MAP_DEBUG_BACKGROUND_START.r, MAP_DEBUG_BACKGROUND_END.r, ratio));
  const g = Math.round(lerp(MAP_DEBUG_BACKGROUND_START.g, MAP_DEBUG_BACKGROUND_END.g, ratio));
  const b = Math.round(lerp(MAP_DEBUG_BACKGROUND_START.b, MAP_DEBUG_BACKGROUND_END.b, ratio));
  const alpha = 0.2 + ratio * 0.18;
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
}

function getInvestigatableDebugFill(hasUnrevealed: boolean) {
  return hasUnrevealed ? "rgba(255, 148, 29, 0.72)" : "rgba(255, 255, 255, 0.68)";
}

function getInvestigatableDebugStroke(hasUnrevealed: boolean) {
  return hasUnrevealed ? "rgba(255, 205, 118, 0.96)" : "rgba(255, 255, 255, 0.96)";
}

function getInvestigatableDebugTextColor(hasUnrevealed: boolean) {
  return hasUnrevealed ? "rgba(46, 23, 0, 0.98)" : "rgba(22, 26, 28, 0.98)";
}

function getBlockedDebugFill() {
  return "rgba(255, 91, 86, 0.18)";
}

function getBlockedDebugTextColor() {
  return "rgba(255, 141, 133, 0.96)";
}

function lerp(start: number, end: number, ratio: number) {
  return start + (end - start) * clamp(ratio, 0, 1);
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

function sampleRadarCell(x: number, y: number, focusCoord: FocusCoord) {
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

function getRadarFocusLabel(backgroundFeatures: readonly MapFeatureDefinition[]) {
  return backgroundFeatures[0]?.name ?? "野外";
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

function isCoordInsideViewport(coord: FocusCoord, viewport: ReturnType<typeof getViewport>) {
  return coord.x >= viewport.left && coord.x <= viewport.left + viewport.width && coord.y >= viewport.top && coord.y <= viewport.top + viewport.height;
}

function isRuntimeCallActive(call: RuntimeCall, elapsedGameSeconds: number) {
  return (
    (call.status === "incoming" || call.status === "connected" || call.status === "awaiting_choice") &&
    (typeof call.expires_at !== "number" || call.expires_at > elapsedGameSeconds)
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isE2eAnimationDisabled() {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem("stellar-frontier-e2e-disable-animation") === "1";
  } catch {
    return false;
  }
}
