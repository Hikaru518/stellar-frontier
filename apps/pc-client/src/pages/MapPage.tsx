import { useMemo, useState } from "react";
import { ConsoleShell, FieldList, Panel, StatusTag } from "../components/Layout";
import { defaultMapConfig, type MapSpecialStateDefinition } from "../content/contentData";
import { mapObjectDefinitionById, type MapObjectDefinition } from "../content/mapObjects";
import { createMovePreview, deriveCrewActionViewModel, formatMoveRoute, type CrewActionViewModel } from "../crewSystem";
import type { CrewId, CrewMember, GameMapState, MapReturnTarget, MapTile } from "../data/gameData";
import type { CrewActionState, EventLog, RuntimeCall } from "../events/types";
import { getDisplayCoord, getTileLocationLabel, getVisibleTileWindow, parseTileId, type VisibleTileCell } from "../mapSystem";
import { formatDuration } from "../timeSystem";
import { PhaserMapCanvas, PHASER_MAP_TILE_GAP, PHASER_MAP_TILE_SIZE } from "./PhaserMapCanvas";
import { PhaserMapPerformanceDemo } from "./PhaserMapPerformanceDemo";
import {
  getCrewMarkerLabel,
  getCrewMarkerPosition,
  getTerrainFillColor,
  getTileTooltipText,
  type PhaserCrewMarkerView,
  type PhaserMapTileView,
  type TileCenter,
} from "./phaserMapView";

interface MapPageProps {
  tiles: MapTile[];
  map: GameMapState;
  crew: CrewMember[];
  crewActions: Record<string, CrewActionState>;
  activeCalls: Record<string, RuntimeCall>;
  eventLogs: EventLog[];
  elapsedGameSeconds: number;
  gameTimeLabel: string;
  returnTarget: MapReturnTarget;
  moveSelectionCrewId?: CrewId | null;
  selectedMoveTargetId?: string;
  onSelectMoveTarget?: (tileId: string) => void;
  onReturn: () => void;
}

export function MapPage({
  tiles,
  map,
  crew,
  crewActions,
  activeCalls,
  eventLogs,
  elapsedGameSeconds,
  gameTimeLabel,
  returnTarget,
  moveSelectionCrewId,
  selectedMoveTargetId,
  onSelectMoveTarget,
  onReturn,
}: MapPageProps) {
  const visibleWindow = useMemo(() => getVisibleTileWindow(defaultMapConfig, map), [map]);
  const [selectedId, setSelectedId] = useState(map.originTileId);
  const [performanceDemoOpen, setPerformanceDemoOpen] = useState(false);
  const selectedCell = visibleWindow.cells.find((cell) => cell.id === selectedId) ?? visibleWindow.cells[0];
  const selectedTile = selectedCell ? tiles.find((tile) => tile.id === selectedCell.id) : undefined;
  const selectedIsDiscovered = selectedCell?.status === "discovered";
  const moveSelectionMember = crew.find((member) => member.id === moveSelectionCrewId);
  const movePreview = moveSelectionMember && selectedCell ? createMovePreview(moveSelectionMember, selectedCell.id, tiles) : null;
  const visibleColumns = Math.max(1, visibleWindow.maxCol - visibleWindow.minCol + 1);
  const selectedTileLogs = selectedTile ? getTileEventLogs(eventLogs, selectedTile.id) : [];

  const crewById = useMemo(
    () => new Map(crew.map((member) => [member.id, member])),
    [crew],
  );
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
  const phaserTileViews = useMemo(
    () =>
      visibleWindow.cells.map((cell) =>
        buildPhaserTileView({
          cell,
          gridRow: cell.row - visibleWindow.minRow,
          gridCol: cell.col - visibleWindow.minCol,
          tile: tiles.find((item) => item.id === cell.id),
          runtimeTile: map.tilesById[cell.id],
          selectedCellId: selectedCell?.id,
          selectedMoveTargetId,
          moveRoute: movePreview?.route ?? [],
          crewById,
          crewActionViews,
        }),
      ),
    [crewActionViews, crewById, map.tilesById, movePreview?.route, selectedCell?.id, selectedMoveTargetId, tiles, visibleWindow.cells, visibleWindow.minCol, visibleWindow.minRow],
  );
  const phaserCrewMarkers = useMemo(
    () =>
      buildPhaserCrewMarkers({
        tileViews: phaserTileViews,
        crew,
        crewActions,
        elapsedGameSeconds,
      }),
    [crew, crewActions, elapsedGameSeconds, phaserTileViews],
  );

  if (performanceDemoOpen) {
    return (
      <ConsoleShell
        title="卫星雷达地图 / 地块 Demo"
        subtitle="3x3 大地图 + 20x20 地块内地图 / 不影响正式 GameState"
        gameTimeLabel={gameTimeLabel}
        actions={
          <button type="button" className="primary-button" onClick={() => setPerformanceDemoOpen(false)}>
            返回正式地图
          </button>
        }
      >
        <PhaserMapPerformanceDemo onClose={() => setPerformanceDemoOpen(false)} />
      </ConsoleShell>
    );
  }

  return (
    <ConsoleShell
      title="卫星雷达地图"
      subtitle={
        moveSelectionMember
          ? `局部探索矩阵 / 正在为 ${moveSelectionMember.name} 标记候选目的地 / 指令仍需返回通话确认`
          : "雷达可见区域 / 地图只读 / 指令需返回通话或通讯台发起"
      }
      gameTimeLabel={gameTimeLabel}
      actions={
        <>
          <button type="button" className="secondary-button" onClick={() => setPerformanceDemoOpen(true)}>
            3x3 地块 Demo
          </button>
          <button type="button" className="primary-button" onClick={onReturn}>
            {returnTarget === "call" ? "返回当前通话" : "返回控制中心"}
          </button>
        </>
      }
    >
      <div className="map-layout">
        <PhaserMapCanvas
          ariaLabel={`雷达可见矩形：玩家坐标 ${formatWindowCoord(visibleWindow.minRow, visibleWindow.minCol)} 到 ${formatWindowCoord(
            visibleWindow.maxRow,
            visibleWindow.maxCol,
          )}`}
          columns={visibleColumns}
          tileViews={phaserTileViews}
          crewMarkers={phaserCrewMarkers}
          onSelectTile={setSelectedId}
        />

        <Panel className="map-legend">
          <p>
            选中：橙色描边 · 队员回传：浅色底 · 高风险状态：橙色文字 · 未探索区域：灰色低对比 · 候选路线：虚线标记 · 地图页面不直接下达移动指令
          </p>
        </Panel>

        <Panel title={`坐标详情：${selectedCell ? formatCellCoord(selectedCell) : "无信号"}`} className="map-detail">
          {selectedCell && selectedTile && selectedIsDiscovered ? (
            <FieldList
              rows={[
                ["区域", selectedCell.tile?.areaName ?? "未知区域"],
                ["地形", selectedCell.tile?.terrain ?? selectedTile.terrain],
                ["天气", selectedCell.tile?.weather ?? "未知天气"],
                ["已揭示对象", objectSummary(revealedObjects(selectedCell, map.tilesById[selectedCell.id]))],
                ["特殊状态", specialStateSummary(revealedSpecialStates(selectedCell, map.tilesById[selectedCell.id]))],
                ["手下状态", crewStatus(selectedTile, crewById, crewActionViews)],
                ["计时状态", crewTiming(selectedTile, crewById, crewActionViews, elapsedGameSeconds)],
                ["事件标记", formatEventMarks(selectedTile)],
                ["事件摘要", formatEventSummaries(selectedTileLogs)],
                ["状态", selectedTile.status],
                ["候选移动", moveSelectionMember ? moveSelectionText(movePreview) : "未处于通话选点模式"],
              ]}
            />
          ) : selectedCell && selectedTile && selectedCell.tile && crewIdsForCell(map.tilesById[selectedCell.id], selectedTile).length > 0 ? (
            <FieldList
              rows={[
                ["信号状态", "队员回传"],
                ["地形", selectedCell.tile.terrain],
                ["天气", selectedCell.tile.weather],
                ["手下状态", crewStatus({ ...selectedTile, crew: crewIdsForCell(map.tilesById[selectedCell.id], selectedTile) }, crewById, crewActionViews)],
                ["计时状态", crewTiming({ ...selectedTile, crew: crewIdsForCell(map.tilesById[selectedCell.id], selectedTile) }, crewById, crewActionViews, elapsedGameSeconds)],
                ["行动提示", "队员可回传粗略环境；需要调查后确认对象与特殊状态详情"],
                ["候选移动", moveSelectionMember ? moveSelectionText(movePreview) : "未处于通话选点模式"],
              ]}
            />
          ) : (
            <FieldList
              rows={[
                ["探索状态", "暂无已确认信息"],
                ["行动提示", "需通过通讯台联系队员前往或调查后确认详情"],
                ["候选移动", moveSelectionMember ? moveSelectionText(movePreview) : "未处于通话选点模式"],
              ]}
            />
          )}
          {moveSelectionMember ? (
            <div className="map-select-box">
              <p className={movePreview?.canMove ? "muted-text" : "danger-text"}>
                {movePreview?.canMove
                  ? `将 ${selectedCell ? formatCellCoord(selectedCell) : "当前信号"} 标记为候选目的地，返回通话后确认。预计 ${formatDuration(
                      movePreview.totalDurationSeconds,
                    )}。`
                  : movePreview?.reason ?? "当前目标不可达。"}
              </p>
              <button
                type="button"
                className="primary-button full-width"
                disabled={!movePreview?.canMove}
                onClick={() => selectedCell && onSelectMoveTarget?.(selectedCell.id)}
              >
                标记为目的地，返回通话确认
              </button>
            </div>
          ) : (
            <p className="muted-text">地图只展示信息。若要移动、建设或调查，请返回通话页面确认指令。</p>
          )}
        </Panel>

        <Panel title="手下状态" className="crew-map-panel">
          {crew.map((member) => {
            const actionView = crewActionViews[member.id];
            return (
              <p key={member.id}>
                <StatusTag tone={actionView.statusTone}>{member.name}</StatusTag> {crewMapLocation(member, map)}，{actionView.statusText}
                <br />
                <span className="muted-text">{memberTiming(member, actionView, elapsedGameSeconds)}</span>
              </p>
            );
          })}
        </Panel>

        <Panel title="返回目标" className="return-panel">
          <p>{returnTarget === "call" ? "本次从通话进入：查看后返回当前通话确认行动。" : "本次从卫星雷达进入：返回控制中心。"}</p>
        </Panel>
      </div>
    </ConsoleShell>
  );
}

function formatCellCoord(cell: Pick<VisibleTileCell, "displayX" | "displayY">) {
  return `(${cell.displayX},${cell.displayY})`;
}

function formatWindowCoord(row: number, col: number) {
  const origin = parseTileId(defaultMapConfig.originTileId);
  const coord = origin ? getDisplayCoord({ row, col }, origin) : { displayX: col, displayY: row };
  return `(${coord.displayX},${coord.displayY})`;
}

interface PhaserTileViewInput {
  cell: VisibleTileCell;
  gridRow: number;
  gridCol: number;
  tile?: MapTile;
  runtimeTile: GameMapState["tilesById"][string];
  selectedCellId?: string;
  selectedMoveTargetId?: string;
  moveRoute: string[];
  crewById: Map<string, CrewMember>;
  crewActionViews: Record<CrewId, CrewActionViewModel>;
}

function buildPhaserTileView({
  cell,
  gridRow,
  gridCol,
  tile,
  runtimeTile,
  selectedCellId,
  selectedMoveTargetId,
  moveRoute,
  crewById,
  crewActionViews,
}: PhaserTileViewInput): PhaserMapTileView {
  const isDiscovered = cell.status === "discovered";
  const visibleCrewIds = crewIdsForCell(runtimeTile, tile);
  const hasCrewSignal = !isDiscovered && Boolean(cell.tile) && visibleCrewIds.length > 0;
  const visibleSpecialStates = revealedSpecialStates(cell, runtimeTile);
  const isDanger = isDiscovered && visibleSpecialStates.some((state) => state.severity === "high");
  const displayCoord = formatCellCoord(cell);
  const terrain = cell.tile?.terrain;
  const semanticLines = buildPhaserSemanticLines({
    cell,
    tile,
    runtimeTile,
    isDiscovered,
    hasCrewSignal,
    visibleCrewIds,
    visibleSpecialStates,
    crewById,
    crewActionViews,
    isRouteTile: moveRoute.includes(cell.id),
    isMoveTarget: selectedMoveTargetId === cell.id,
  });

  return {
    id: cell.id,
    row: gridRow,
    col: gridCol,
    displayCoord,
    status: cell.status,
    fillColor: getTerrainFillColor({ status: cell.status, terrain, hasCrewSignal }),
    tooltip: getTileTooltipText({ displayCoord, status: cell.status, terrain, hasCrewSignal }),
    label: isDiscovered && cell.tile ? cell.tile.areaName : hasCrewSignal ? "队员回传" : "未探索区域",
    terrain,
    semanticLines,
    crewLabels: visibleCrewIds
      .map((crewId) => crewById.get(crewId))
      .filter((member): member is CrewMember => Boolean(member))
      .map((member) => getCrewMarkerLabel(member)),
    isDanger,
    isRoute: moveRoute.includes(cell.id),
    isSelected: selectedCellId === cell.id,
    isTarget: selectedMoveTargetId === cell.id,
  };
}

interface PhaserSemanticLinesInput {
  cell: VisibleTileCell;
  tile?: MapTile;
  runtimeTile: GameMapState["tilesById"][string];
  isDiscovered: boolean;
  hasCrewSignal: boolean;
  visibleCrewIds: CrewId[];
  visibleSpecialStates: MapSpecialStateDefinition[];
  crewById: Map<string, CrewMember>;
  crewActionViews: Record<CrewId, CrewActionViewModel>;
  isRouteTile: boolean;
  isMoveTarget: boolean;
}

function buildPhaserSemanticLines({
  cell,
  tile,
  runtimeTile,
  isDiscovered,
  hasCrewSignal,
  visibleCrewIds,
  visibleSpecialStates,
  crewById,
  crewActionViews,
  isRouteTile,
  isMoveTarget,
}: PhaserSemanticLinesInput) {
  const lines: string[] = [];
  if (isDiscovered && cell.tile && tile) {
    lines.push(`地形：${cell.tile.terrain}`);
    lines.push(`天气：${cell.tile.weather}`);
    lines.push(`对象：${objectSummary(revealedObjects(cell, runtimeTile))}`);
    lines.push(`状态：${specialStateSummary(visibleSpecialStates)}`);
    lines.push(...crewSummaryLines(tile.crew, crewById, crewActionViews));
    const firstEventMark = tile.eventMarks?.[0];
    if (firstEventMark) {
      lines.push(firstEventMark.label);
    }
  } else if (hasCrewSignal && cell.tile) {
    lines.push(`地形：${cell.tile.terrain}`);
    lines.push(`天气：${cell.tile.weather}`);
    lines.push(...crewSummaryLines(visibleCrewIds, crewById, crewActionViews));
  } else {
    lines.push("详情未确认");
  }

  if (isRouteTile) {
    lines.push("候选路线");
  }
  if (isMoveTarget) {
    lines.push("已标记目标");
  }
  return lines;
}

function crewSummaryLines(crewIds: CrewId[], crewById: Map<string, CrewMember>, crewActionViews: Record<CrewId, CrewActionViewModel>) {
  return crewIds.flatMap((crewId) => {
    const member = crewById.get(crewId);
    if (!member) {
      return [];
    }
    return [`${member.name}：${shortStatus(crewActionViews[member.id]?.statusText ?? member.status)}`];
  });
}

function buildPhaserCrewMarkers({
  tileViews,
  crew,
  crewActions,
  elapsedGameSeconds,
}: {
  tileViews: PhaserMapTileView[];
  crew: CrewMember[];
  crewActions: Record<string, CrewActionState>;
  elapsedGameSeconds: number;
}): PhaserCrewMarkerView[] {
  const tileCenters = buildTileCenters(tileViews);
  return crew.reduce<PhaserCrewMarkerView[]>((markers, member, index) => {
    const action = Object.values(crewActions).find((item) => item.crew_id === member.id && item.type === "move" && item.status === "active");
    const basePosition = getCrewMarkerPosition({
      currentTileId: member.currentTile,
      action,
      tileCenters,
      elapsedGameSeconds,
    });
    const currentCenter = tileCenters[member.currentTile];
    if (!currentCenter && !action?.path_tile_ids?.some((tileId) => tileCenters[tileId])) {
      return markers;
    }
    const offset = markerOffset(index);
    markers.push({
      crewId: member.id,
      label: getCrewMarkerLabel(member),
      x: basePosition.x + offset.x,
      y: basePosition.y + offset.y,
    });
    return markers;
  }, []);
}

function buildTileCenters(tileViews: PhaserMapTileView[]): Record<string, TileCenter> {
  return Object.fromEntries(
    tileViews.map((tile) => [
      tile.id,
      {
        x: tile.col * (PHASER_MAP_TILE_SIZE + PHASER_MAP_TILE_GAP) + PHASER_MAP_TILE_SIZE / 2,
        y: tile.row * (PHASER_MAP_TILE_SIZE + PHASER_MAP_TILE_GAP) + PHASER_MAP_TILE_SIZE / 2,
      },
    ]),
  );
}

function markerOffset(index: number) {
  const offsets = [
    { x: 0, y: 0 },
    { x: 18, y: 0 },
    { x: -18, y: 0 },
    { x: 0, y: 18 },
  ];
  return offsets[index % offsets.length];
}

function revealedObjects(cell: VisibleTileCell, runtimeTile: GameMapState["tilesById"][string]): MapObjectDefinition[] {
  if (!cell.tile || cell.status !== "discovered") {
    return [];
  }

  const revealedIds = new Set(runtimeTile?.revealedObjectIds ?? []);
  const definitions: MapObjectDefinition[] = [];
  for (const objectId of cell.tile.objectIds) {
    const def = mapObjectDefinitionById.get(objectId);
    if (!def) {
      continue;
    }
    if (def.visibility === "onDiscovered" || revealedIds.has(def.id)) {
      definitions.push(def);
    }
  }
  return definitions;
}

function revealedSpecialStates(cell: VisibleTileCell, runtimeTile: GameMapState["tilesById"][string]): MapSpecialStateDefinition[] {
  if (!cell.tile || cell.status !== "discovered") {
    return [];
  }

  const activeIds = new Set(runtimeTile?.activeSpecialStateIds ?? cell.tile.specialStates.filter((state) => state.startsActive).map((state) => state.id));
  const revealedIds = new Set(runtimeTile?.revealedSpecialStateIds ?? []);
  return cell.tile.specialStates.filter((state) => activeIds.has(state.id) && (state.visibility === "onDiscovered" || revealedIds.has(state.id)));
}

function crewIdsForCell(runtimeTile: GameMapState["tilesById"][string], tile?: Pick<MapTile, "crew">) {
  return runtimeTile?.crew?.length ? runtimeTile.crew : (tile?.crew ?? []);
}

function objectSummary(objects: MapObjectDefinition[]) {
  return objects.length ? objects.map((object) => object.name).join(" / ") : "未确认新的地块对象";
}

function specialStateSummary(states: MapSpecialStateDefinition[]) {
  return states.length ? states.map((state) => state.name).join(" / ") : "未发现特殊状态";
}

function crewMapLocation(member: CrewMember, map: GameMapState) {
  const tileState = map.tilesById[member.currentTile];
  if (tileState?.discovered || map.discoveredTileIds.includes(member.currentTile)) {
    return getTileLocationLabel(defaultMapConfig, member.currentTile);
  }

  const coord = parseTileId(member.currentTile);
  const origin = parseTileId(defaultMapConfig.originTileId);
  if (!coord || !origin) {
    return "未探索区域";
  }

  return `未探索区域 ${formatCellCoord(getDisplayCoord(coord, origin))}`;
}

function getTileEventLogs(eventLogs: EventLog[], tileId: string) {
  return eventLogs
    .filter((log) => log.visibility === "player_visible" && log.tile_ids.includes(tileId))
    .slice()
    .sort((left, right) => right.occurred_at - left.occurred_at || right.id.localeCompare(left.id));
}

function formatEventMarks(tile: MapTile) {
  return tile.eventMarks?.length ? tile.eventMarks.map((mark) => mark.label).join(" / ") : "无";
}

function formatEventSummaries(eventLogs: EventLog[]) {
  return eventLogs.length ? eventLogs.map((log) => log.summary).join(" / ") : "暂无事件摘要";
}

function crewStatus(tile: MapTile, crewById: Map<string, CrewMember>, crewActionViews: Record<CrewId, CrewActionViewModel>) {
  if (tile.crew.length === 0) {
    return "无手下驻留";
  }

  return tile.crew
    .map((crewId) => {
      const member = crewById.get(crewId);
      return member ? `${member.name}：${crewActionViews[member.id].statusText}` : crewId;
    })
    .join(" / ");
}

function crewTiming(
  tile: MapTile,
  crewById: Map<string, CrewMember>,
  crewActionViews: Record<CrewId, CrewActionViewModel>,
  elapsedGameSeconds: number,
) {
  if (tile.crew.length === 0) {
    return "无手下计时状态";
  }

  return tile.crew
    .map((crewId) => {
      const member = crewById.get(crewId);
      return member ? `${member.name}：${memberTiming(member, crewActionViews[member.id], elapsedGameSeconds)}` : crewId;
    })
    .join(" / ");
}

function memberTiming(_member: CrewMember, actionView: CrewActionViewModel, _elapsedGameSeconds: number) {
  return actionView.timingText;
}

function moveSelectionText(preview: ReturnType<typeof createMovePreview> | null) {
  if (!preview) {
    return "未选择地块";
  }

  if (!preview.canMove) {
    return preview.reason ?? "不可达";
  }

  return `${formatMoveRoute(preview)} / 预计 ${formatDuration(preview.totalDurationSeconds)}`;
}

function shortStatus(status: string) {
  if (status.includes("熊")) {
    return "危险";
  }

  if (status.includes("采矿")) {
    return "采矿中";
  }

  if (status.includes("行进")) {
    return "行进中";
  }

  return status.slice(0, 8);
}
