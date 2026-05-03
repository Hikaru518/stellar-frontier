import { useMemo, useState } from "react";
import { ConsoleShell, FieldList, Panel, StatusTag } from "../components/Layout";
import { defaultMapConfig, type MapSpecialStateDefinition } from "../content/contentData";
import { mapObjectDefinitionById, type MapObjectDefinition } from "../content/mapObjects";
import { createMovePreview, deriveCrewActionViewModel, formatMoveRoute, type CrewActionViewModel } from "../crewSystem";
import type { CrewId, CrewMember, GameMapState, MapReturnTarget, MapTile } from "../data/gameData";
import type { CrewActionState, EventLog, RuntimeCall } from "../events/types";
import { getDisplayCoord, getTileLocationLabel, getVisibleTileWindow, parseTileId, type VisibleTileCell } from "../mapSystem";
import { PhaserMapCanvas } from "../phaser-map/PhaserMapCanvas";
import { buildPhaserCrewMarkers, buildPhaserTileViews, buildTileCenters } from "../phaser-map/mapView";
import { formatDuration } from "../timeSystem";

const ZOOM_LEVEL_LABELS = ["全局", "区域", "地块", "精细"] as const;

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
  const [selectedId, setSelectedId] = useState<string | null>(selectedMoveTargetId ?? null);
  const [mapZoomLevel, setMapZoomLevel] = useState(1);
  const selectedCell = selectedId ? visibleWindow.cells.find((cell) => cell.id === selectedId) : undefined;
  const selectedTile = selectedCell ? tiles.find((tile) => tile.id === selectedCell.id) : undefined;
  const selectedIsDiscovered = selectedCell?.status === "discovered";
  const moveSelectionMember = crew.find((member) => member.id === moveSelectionCrewId);
  const movePreview = moveSelectionMember && selectedCell ? createMovePreview(moveSelectionMember, selectedCell.id, tiles) : null;
  const visibleColumns = Math.max(1, visibleWindow.maxCol - visibleWindow.minCol + 1);
  const selectedTileLogs = selectedTile ? getTileEventLogs(eventLogs, selectedTile.id) : [];
  const crewPositions = useMemo(
    () =>
      Object.fromEntries(
        visibleWindow.cells.map((cell) => {
          const tile = tiles.find((item) => item.id === cell.id);
          return [cell.id, crewIdsForCell(map.tilesById[cell.id], tile)];
        }),
      ),
    [map.tilesById, tiles, visibleWindow.cells],
  );
  const tileViews = useMemo(
    () =>
      buildPhaserTileViews(visibleWindow, {
        selectedId,
        selectedMoveTargetId,
        movePreviewRoute: movePreview?.route,
        crewPositions,
        visual: defaultMapConfig.visual,
      }),
    [crewPositions, movePreview?.route, selectedId, selectedMoveTargetId, visibleWindow],
  );
  const tileCenters = useMemo(() => buildTileCenters(tileViews), [tileViews]);
  const crewMarkers = useMemo(
    () => buildPhaserCrewMarkers(crew, crewActions, tileCenters, elapsedGameSeconds),
    [crew, crewActions, elapsedGameSeconds, tileCenters],
  );

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
        <button type="button" className="primary-button" onClick={onReturn}>
          {returnTarget === "call" ? "返回当前通话" : "返回控制中心"}
        </button>
      }
    >
      <div className="map-layout">
        <div className="map-canvas-shell">
          <ul className="zoom-level-bar" aria-label="地图缩放级别">
            {ZOOM_LEVEL_LABELS.map((label, index) => (
              <li key={label} className={index === mapZoomLevel ? "zoom-level-pip zoom-level-active" : "zoom-level-pip"}>
                {label}
              </li>
            ))}
          </ul>
          <PhaserMapCanvas
            columns={visibleColumns}
            tileViews={tileViews}
            crewMarkers={crewMarkers}
            onSelectTile={setSelectedId}
            setZoomLevelInReact={setMapZoomLevel}
          />
        </div>

        <Panel className="map-legend">
          <p>
            选中：橙色描边 · 队员回传：浅色底 · 高风险状态：橙色文字 · 未探索区域：灰色低对比 · 候选路线：虚线标记 · 地图页面不直接下达移动指令
          </p>
        </Panel>

        <Panel title={`坐标详情：${selectedCell ? formatCellCoord(selectedCell) : "未选择"}`} className="map-detail">
          {!selectedCell ? (
            <FieldList
              rows={[
                ["选择状态", "尚未选择地块"],
                ["行动提示", "点按地图地块后显示选框，并在此处显示该地块信息"],
                ["候选移动", moveSelectionMember ? "选择一个可达地块后可标记候选目的地" : "未处于通话选点模式"],
              ]}
            />
          ) : selectedTile && selectedIsDiscovered ? (
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
          ) : selectedTile && selectedCell.tile && crewIdsForCell(map.tilesById[selectedCell.id], selectedTile).length > 0 ? (
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
