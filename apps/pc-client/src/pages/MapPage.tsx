import { useEffect, useMemo, useRef, useState } from "react";
import { FieldList, GameConsoleLayout } from "../components/Layout";
import iafsTerrainBaseUrl from "../../../../content/maps/terrain/iafs-terrain-base.png";
import keyPointIconManifest from "../../../../content/maps/icons/key-points/manifest.json";
import { defaultMapConfig, type MapFeatureDefinition } from "../content/contentData";
import type { CrewId, CrewMember, GameMapState, MapReturnTarget, MapTile, SystemLog } from "../data/gameData";
import { deriveCrewActionViewModel, isTilePassable, type CrewActionViewModel } from "../crewSystem";
import type { CrewActionState, RuntimeCall } from "../events/types";
import { buildFeatureTileIndex, expandFeatureFootprint, getVisibleFeaturesAtTile } from "../mapFeatureSystem";
import { parseTileId } from "../mapSystem";

const RADAR = defaultMapConfig.radar;
const RADAR_WORLD = RADAR.world;
const MIN_ZOOM = RADAR_WORLD.width / 80;
const MAX_ZOOM = RADAR_WORLD.width / 40;
const MAP_DEBUG_SYMBOLS = {
  blocked: "X",
  investigatableRevealed: "I",
  investigatableUnrevealed: "?",
} as const;
const MAP_DEBUG_BACKGROUND_START = { r: 69, g: 174, b: 255 };
const MAP_DEBUG_BACKGROUND_END = { r: 255, g: 219, b: 82 };
const MAP_ICON_WORLD_SIZE = 10;
const MAP_MASK_INITIAL_RADIUS = 24;
const MAP_MASK_PATH_RADIUS = 8;
const MAP_MASK_CREW_RADIUS = 12;
const MAP_MASK_KEY_POINT_RADIUS = 22;
const CREW_ICON_WORLD_SIZE = 7;
const mapIconModules = import.meta.glob("../../../../content/maps/icons/key-points/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;
const crewIconModules = import.meta.glob("../../../../content/maps/icons/crew/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

export interface MapLayerVisibility {
  render: boolean;
  mask: boolean;
  functional: boolean;
  crew: boolean;
  debug: boolean;
}

export const DEFAULT_MAP_LAYER_VISIBILITY: MapLayerVisibility = {
  render: true,
  mask: true,
  functional: true,
  crew: false,
  debug: false,
};

type FocusCoord = { x: number; y: number };

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
  iconUrl: string;
  iconId: string;
}

interface MapIconMarker extends FocusCoord {
  featureId: string;
  label: string;
  iconUrl: string;
  iconId: string;
}

interface MapMaskReveal extends FocusCoord {
  radius: number;
  intensity: number;
}

interface KeyPointIconManifest {
  icons: Array<{
    id: string;
    zhName: string;
    featureId: string;
    icon: string;
    coord?: {
      x: number;
      y: number;
    };
  }>;
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
  const showMaskLayer = layerVisibility.mask;
  const showFunctionalLayer = layerVisibility.functional;
  const showCrewLayer = layerVisibility.crew;
  const showDebugLayer = layerVisibility.debug;
  const stageRef = useRef<HTMLDivElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const functionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const crewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const debugCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; centerX: number; centerY: number; viewportWidth: number; viewportHeight: number; moved: boolean } | null>(null);
  const suppressNextClickRef = useRef(false);
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
  const terrainImageStyle = useMemo(
    () => ({
      width: `${(RADAR_WORLD.width / viewport.width) * 100}%`,
      height: `${(RADAR_WORLD.height / viewport.height) * 100}%`,
      transform: `translate(${-(viewport.left / RADAR_WORLD.width) * 100}%, ${-(viewport.top / RADAR_WORLD.height) * 100}%)`,
    }),
    [viewport],
  );
  const mapDebugData = useMemo(() => getMapDebugData(tiles, map), [map, tiles]);
  const crewMarkers = useMemo(() => getMapCrewMarkers(crew), [crew]);
  const mapIconMarkers = useMemo(() => getMapIconMarkers(map), [map]);
  const mapMaskReveals = useMemo(() => getMapMaskReveals(map, crew, crewActions, mapIconMarkers), [crew, crewActions, map, mapIconMarkers]);
  const mapIconSizePercent = useMemo(() => `${(MAP_ICON_WORLD_SIZE / viewport.width) * 100}%`, [viewport.width]);
  const crewIconSizePercent = useMemo(() => `${(CREW_ICON_WORLD_SIZE / viewport.width) * 100}%`, [viewport.width]);
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
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    const coord = stagePointToWorld(event.clientX, event.clientY);
    if (!coord) {
      return;
    }
    setFocusCoord(coord);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      centerX: center.x,
      centerY: center.y,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      moved: false,
    };
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
        x: Math.round(drag.centerX - (dx / rect.width) * drag.viewportWidth),
        y: Math.round(drag.centerY - (dy / rect.height) * drag.viewportHeight),
      }),
    );
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.moved) {
      suppressNextClickRef.current = true;
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
    const rect = stageRef.current?.getBoundingClientRect();
    if (rect) {
      const nx = (event.clientX - rect.left) / rect.width;
      const ny = (event.clientY - rect.top) / rect.height;
      const worldX = viewport.left + nx * viewport.width;
      const worldY = viewport.top + ny * viewport.height;
      const nextViewport = getViewport(center, nextZoom);
      setCenter(
        clampCoord({
          x: Math.round(worldX - (nx - 0.5) * nextViewport.width),
          y: Math.round(worldY - (ny - 0.5) * nextViewport.height),
        }),
      );
    }
    setZoom(nextZoom);
    pushTrace(`[ZOOM] ${nextZoom.toFixed(2)}x / render + function`);
  }

  useEffect(() => {
    if (!showRenderLayer || !showMaskLayer) {
      return undefined;
    }

    if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent)) {
      return undefined;
    }

    if (!(maskCanvasRef.current instanceof HTMLCanvasElement)) {
      return undefined;
    }

    const canvasEl = maskCanvasRef.current;
    const ctx = canvasEl.getContext("2d");
    if (!ctx) {
      return undefined;
    }

    drawMapMask(ctx, canvasEl, mapMaskReveals);
    return undefined;
  }, [mapMaskReveals, showMaskLayer, showRenderLayer]);

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
    let animationFrameId = 0;

    function resize() {
      const rect = canvasEl.getBoundingClientRect();
      canvasEl.width = Math.max(1, Math.floor(rect.width * dpr));
      canvasEl.height = Math.max(1, Math.floor(rect.height * dpr));
    }

    function drawCrewLayer(now: number) {
      const width = canvasEl.width / dpr;
      const height = canvasEl.height / dpr;
      const cellW = width / viewport.width;
      const cellH = height / viewport.height;
      const iconRadius = clamp(Math.min(cellW, cellH) * 2.2, 8, 20);
      const pulseMaxRadius = clamp(Math.min(cellW, cellH) * 8.5, 26, 68);
      const fontSize = clamp(iconRadius * 0.82, 8, 13);

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
        const labelX = sx + iconRadius + 6;
        const labelWidth = context.measureText(marker.label).width;
        const labelHeight = fontSize * 1.55;
        const labelTop = sy - labelHeight / 2;
        const signalOffset = stableSignalOffset(`${marker.tileId}:${marker.label}`);

        for (let pulseIndex = 0; pulseIndex < 2; pulseIndex += 1) {
          const phase = ((now / 2100 + signalOffset + pulseIndex * 0.46) % 1 + 1) % 1;
          const radius = iconRadius * 0.84 + phase * pulseMaxRadius;
          const alpha = (1 - phase) * (pulseIndex === 0 ? 0.34 : 0.18);
          context.strokeStyle = `rgba(185, 217, 87, ${alpha.toFixed(3)})`;
          context.lineWidth = Math.max(1, 2 - phase);
          context.setLineDash([Math.max(3, radius * 0.12), Math.max(3, radius * 0.07)]);
          context.lineDashOffset = -now / 90 - signalOffset * 20;
          context.beginPath();
          context.arc(sx, sy, radius, 0, Math.PI * 2);
          context.stroke();

          context.setLineDash([]);
          context.strokeStyle = `rgba(255, 205, 92, ${(alpha * 0.46).toFixed(3)})`;
          context.beginPath();
          context.arc(sx, sy, radius * 0.66, -0.25 * Math.PI, 0.18 * Math.PI);
          context.arc(sx, sy, radius * 0.66, 0.76 * Math.PI, 1.18 * Math.PI);
          context.stroke();
        }

        context.fillStyle = "rgba(5, 14, 8, 0.9)";
        context.fillRect(labelX - 5, labelTop, labelWidth + 10, labelHeight);
        context.strokeStyle = "rgba(112, 255, 137, 0.62)";
        context.lineWidth = 1;
        context.strokeRect(labelX - 5.5, labelTop - 0.5, labelWidth + 11, labelHeight + 1);
        context.fillStyle = "rgba(148, 255, 122, 0.08)";
        for (let lineY = labelTop + 2; lineY < labelTop + labelHeight; lineY += 3) {
          context.fillRect(labelX - 4, lineY, labelWidth + 8, 1);
        }
        context.fillStyle = "rgba(169, 255, 147, 0.96)";
        context.shadowColor = "rgba(92, 255, 119, 0.65)";
        context.shadowBlur = 5;
        context.fillText(marker.label, labelX, sy);
        context.shadowBlur = 0;
      }
    }

    function animate(now: number) {
      drawCrewLayer(now);
      animationFrameId = window.requestAnimationFrame(animate);
    }

    resize();
    animationFrameId = window.requestAnimationFrame(animate);
    window.addEventListener("resize", resize);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
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
                  <p>{actionView.timingText}</p>
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
                  className={`console-layer-toggle ${showMaskLayer ? "console-layer-toggle-active" : ""}`}
                  onClick={() => toggleLayer("mask", "mask")}
                >
                  显示遮罩层
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
              <p className="console-map-trace-line">
                [MASK] landing + route + key-point signal / {mapMaskReveals.length} sources
              </p>
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
          aria-label="地形地图"
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
            <div className="console-terrain-map-render-layer" aria-hidden="true">
              <img src={iafsTerrainBaseUrl} alt="" className="console-terrain-map-image" style={terrainImageStyle} draggable={false} />
            </div>
          ) : null}

          {showRenderLayer && showMaskLayer ? (
            <div className="console-terrain-map-mask-layer" aria-hidden="true">
              <canvas ref={maskCanvasRef} className="console-terrain-map-mask-canvas" style={terrainImageStyle} />
            </div>
          ) : null}

          {showFunctionalLayer ? (
            <div className="console-retro-map-function-layer" aria-hidden="true">
              <canvas ref={functionCanvasRef} className="console-retro-map-function-canvas" />
            </div>
          ) : null}

          {showRenderLayer ? (
            <div className="console-terrain-map-icon-layer" aria-hidden="true">
              {mapIconMarkers.map((marker) => {
                if (!isCoordInsideViewport(marker, viewport)) {
                  return null;
                }
                const isMasked = showMaskLayer && !isCoordRevealedByMask(marker, mapMaskReveals);

                return (
                  <span
                    key={marker.iconId}
                    className={`console-retro-map-icon-anchor ${isMasked ? "console-retro-map-icon-anchor-masked" : ""}`}
                    style={{
                      left: `${((marker.x - viewport.left) / viewport.width) * 100}%`,
                      top: `${((marker.y - viewport.top) / viewport.height) * 100}%`,
                      width: `clamp(18px, ${mapIconSizePercent}, 54px)`,
                    }}
                    data-feature-id={marker.featureId}
                    data-icon-id={marker.iconId}
                    data-label={marker.label}
                  >
                    <img src={marker.iconUrl} alt="" className="console-retro-map-icon" draggable={false} />
                  </span>
                );
              })}
            </div>
          ) : null}

          {showCrewLayer ? (
            <div className="console-retro-map-crew-layer" aria-hidden="true">
              <canvas ref={crewCanvasRef} className="console-retro-map-crew-canvas" />
              <div className="console-retro-map-crew-icon-layer">
                {crewMarkers.map((marker) => {
                  if (!isCoordInsideViewport(marker, viewport)) {
                    return null;
                  }

                  return (
                    <span
                      key={`${marker.tileId}-${marker.iconId}`}
                      className="console-retro-map-crew-icon-anchor"
                      style={{
                        left: `${((marker.x - viewport.left + 0.5) / viewport.width) * 100}%`,
                        top: `${((marker.y - viewport.top + 0.5) / viewport.height) * 100}%`,
                        width: `clamp(18px, ${crewIconSizePercent}, 42px)`,
                      }}
                      data-crew-icon-id={marker.iconId}
                    >
                      <img src={marker.iconUrl} alt="" className="console-retro-map-crew-icon" draggable={false} />
                    </span>
                  );
                })}
              </div>
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
            <span>mask {showMaskLayer ? "ON" : "OFF"}</span>
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
        iconUrl: getCrewMapIconUrl(),
        iconId: "crew-group",
      },
    ];
  });
}

function getCrewMapIconUrl() {
  return crewIconModules["../../../../content/maps/icons/crew/group.png"] ?? "";
}

function getMapIconMarkers(map: Pick<GameMapState, "discoveredTileIds" | "tilesById" | "featuresById">): MapIconMarker[] {
  const featureById = new Map(defaultMapConfig.features.map((feature) => [feature.id, feature]));
  const manifest = keyPointIconManifest as KeyPointIconManifest;

  return manifest.icons.flatMap((icon) => {
    const feature = featureById.get(icon.featureId);
    const iconUrl = mapIconModules[`../../../../content/maps/icons/key-points/${icon.icon}`];
    if (!feature || !iconUrl || !isMapIconFeatureVisible(feature, map)) {
      return [];
    }

    const coord = icon.coord ? radarCoordFromDisplayCoord(icon.coord) : getFeatureCenterCoord(feature);
    if (!coord) {
      return [];
    }

    return [
      {
        ...coord,
        featureId: feature.id,
        label: icon.zhName,
        iconUrl,
        iconId: icon.id,
      },
    ];
  });
}

function getMapMaskReveals(
  map: Pick<GameMapState, "discoveredTileIds" | "tilesById">,
  crew: CrewMember[],
  crewActions: Record<string, CrewActionState>,
  iconMarkers: MapIconMarker[],
): MapMaskReveal[] {
  const crashSite = iconMarkers.find((marker) => marker.iconId === "crash-site");
  const reveals: MapMaskReveal[] = [
    {
      ...(crashSite ?? radarCoordFromTileId(defaultMapConfig.originTileId)),
      radius: MAP_MASK_INITIAL_RADIUS,
      intensity: 1,
    },
  ];
  const discoveredCoords = new Map<string, FocusCoord>();

  function addTileReveal(tileId: string, radius: number, intensity: number) {
    const coord = radarCoordFromTileId(tileId);
    discoveredCoords.set(tileId, coord);
    reveals.push({ ...coord, radius, intensity });
  }

  for (const tileId of map.discoveredTileIds) {
    addTileReveal(tileId, MAP_MASK_PATH_RADIUS, 0.78);
  }

  for (const [tileId, runtimeTile] of Object.entries(map.tilesById)) {
    if (runtimeTile?.discovered || runtimeTile?.investigated) {
      addTileReveal(tileId, runtimeTile.investigated ? MAP_MASK_PATH_RADIUS + 3 : MAP_MASK_PATH_RADIUS, runtimeTile.investigated ? 0.9 : 0.78);
    }
  }

  for (const member of crew) {
    addTileReveal(member.currentTile, MAP_MASK_CREW_RADIUS, 0.9);
  }

  for (const action of Object.values(crewActions)) {
    for (const tileId of getRevealedMovePathTileIds(action, crew)) {
      addTileReveal(tileId, MAP_MASK_PATH_RADIUS, 0.72);
    }
  }

  for (const marker of iconMarkers) {
    if (isNearDiscoveredCoord(marker, discoveredCoords)) {
      reveals.push({ x: marker.x, y: marker.y, radius: MAP_MASK_KEY_POINT_RADIUS, intensity: 0.95 });
    }
  }

  return reveals;
}

function getRevealedMovePathTileIds(action: CrewActionState, crew: CrewMember[]) {
  if (action.type !== "move" || action.status !== "active") {
    return [];
  }

  const route = action.path_tile_ids ?? [];
  const crewMember = crew.find((member) => member.id === action.crew_id);
  const routeStepIndex = readNumberValue(action.action_params.route_step_index);
  const currentRouteIndex = crewMember ? route.indexOf(crewMember.currentTile) : -1;
  const visitedCount = Math.max(
    routeStepIndex ?? 0,
    currentRouteIndex >= 0 ? currentRouteIndex + 1 : 0,
  );
  const visited = route.slice(0, visitedCount);

  if (crewMember) {
    visited.push(crewMember.currentTile);
  }

  if (visited.length === 0 && action.from_tile_id) {
    visited.push(action.from_tile_id);
  }

  return Array.from(new Set(visited));
}

function readNumberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isNearDiscoveredCoord(coord: FocusCoord, discoveredCoords: Map<string, FocusCoord>) {
  for (const discovered of discoveredCoords.values()) {
    const dx = coord.x - discovered.x;
    const dy = coord.y - discovered.y;
    if (dx * dx + dy * dy <= MAP_MASK_KEY_POINT_RADIUS * MAP_MASK_KEY_POINT_RADIUS) {
      return true;
    }
  }
  return false;
}

function isCoordRevealedByMask(coord: FocusCoord, reveals: MapMaskReveal[]) {
  return reveals.some((reveal) => {
    const dx = coord.x - reveal.x;
    const dy = coord.y - reveal.y;
    return dx * dx + dy * dy <= reveal.radius * reveal.radius;
  });
}

function drawMapMask(context: CanvasRenderingContext2D, canvasEl: HTMLCanvasElement, reveals: MapMaskReveal[]) {
  canvasEl.width = RADAR_WORLD.width;
  canvasEl.height = RADAR_WORLD.height;

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvasEl.width, canvasEl.height);

  const noise = context.createImageData(canvasEl.width, canvasEl.height);
  for (let index = 0; index < noise.data.length; index += 4) {
    const pixel = index / 4;
    const x = pixel % canvasEl.width;
    const y = Math.floor(pixel / canvasEl.width);
    const staticNoise = ((x * 37 + y * 61 + ((x ^ y) * 17)) % 29) / 28;
    const scan = y % 3 === 0 ? 18 : 0;
    noise.data[index] = 1 + Math.floor(staticNoise * 9);
    noise.data[index + 1] = 14 + Math.floor(staticNoise * 18) + scan;
    noise.data[index + 2] = 7 + Math.floor(staticNoise * 10);
    noise.data[index + 3] = 214 + Math.floor(staticNoise * 26);
  }
  context.putImageData(noise, 0, 0);

  context.globalCompositeOperation = "destination-out";
  for (const reveal of reveals) {
    const gradient = context.createRadialGradient(reveal.x, reveal.y, Math.max(1, reveal.radius * 0.28), reveal.x, reveal.y, reveal.radius);
    const centerAlpha = Math.min(0.98, 0.72 * reveal.intensity);
    const edgeAlpha = Math.min(0.62, 0.42 * reveal.intensity);
    gradient.addColorStop(0, `rgba(0, 0, 0, ${centerAlpha})`);
    gradient.addColorStop(0.58, `rgba(0, 0, 0, ${edgeAlpha})`);
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(reveal.x, reveal.y, reveal.radius, 0, Math.PI * 2);
    context.fill();
  }
  context.globalCompositeOperation = "source-over";

  context.fillStyle = "rgba(6, 24, 10, 0.1)";
  for (let y = 0; y < canvasEl.height; y += 6) {
    context.fillRect(0, y, canvasEl.width, 1);
  }
}

function radarCoordFromDisplayCoord(coord: FocusCoord): FocusCoord {
  return clampCoord({
    x: RADAR_WORLD.origin.x + coord.x,
    y: RADAR_WORLD.origin.y - coord.y,
  });
}

function getFeatureCenterCoord(feature: MapFeatureDefinition): FocusCoord | null {
  if (feature.footprint.type !== "row_spans" || feature.footprint.spans.length === 0) {
    return null;
  }

  const minRow = Math.min(...feature.footprint.spans.map((span) => span.row));
  const maxRow = Math.max(...feature.footprint.spans.map((span) => span.row));
  const minCol = Math.min(...feature.footprint.spans.map((span) => span.colStart));
  const maxCol = Math.max(...feature.footprint.spans.map((span) => span.colEnd));
  return clampCoord({
    x: (minCol + maxCol) / 2 - 1,
    y: (minRow + maxRow) / 2 - 1,
  });
}

function isMapIconFeatureVisible(
  feature: MapFeatureDefinition,
  map: Pick<GameMapState, "discoveredTileIds" | "tilesById" | "featuresById">,
) {
  const center = getFeatureCenterCoord(feature);
  const tileId = center ? tileIdFromRadarCoord({ x: Math.round(center.x), y: Math.round(center.y) }) : null;

  switch (feature.visibility) {
    case "always":
      return true;
    case "onDiscovered":
      return tileId ? Boolean(map.discoveredTileIds.includes(tileId) || map.tilesById[tileId]?.discovered) : false;
    case "onInvestigated":
      return tileId ? Boolean(map.tilesById[tileId]?.investigated) : false;
    case "hidden":
      return Boolean(map.featuresById?.[feature.id]?.revealed);
    default:
      return false;
  }
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

function stableSignalOffset(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 997;
  }
  return hash / 997;
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
