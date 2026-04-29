import { useMemo, useState } from "react";
import { ConsoleShell, FieldList, Panel, StatusTag } from "../components/Layout";
import { defaultMapConfig, type MapSpecialStateDefinition } from "../content/contentData";
import { mapObjectDefinitionById, type MapObjectDefinition } from "../content/mapObjects";
import { createMovePreview, formatMoveRoute, getCrewActionTiming } from "../crewSystem";
import type { CrewId, CrewMember, GameMapState, MapReturnTarget, MapTile } from "../data/gameData";
import type { EventLog } from "../events/types";
import { getDisplayCoord, getTileLocationLabel, getVisibleTileWindow, parseTileId, type VisibleTileCell } from "../mapSystem";
import { formatDuration, getRemainingSeconds } from "../timeSystem";

interface MapPageProps {
  tiles: MapTile[];
  map: GameMapState;
  crew: CrewMember[];
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
        <section
          className="map-grid"
          aria-label={`雷达可见矩形：玩家坐标 ${formatWindowCoord(visibleWindow.minRow, visibleWindow.minCol)} 到 ${formatWindowCoord(
            visibleWindow.maxRow,
            visibleWindow.maxCol,
          )}`}
          style={{ gridTemplateColumns: `repeat(${visibleColumns}, minmax(0, 1fr))` }}
        >
          {visibleWindow.cells.map((cell) => {
            const tile = tiles.find((item) => item.id === cell.id);
            const runtimeTile = map.tilesById[cell.id];
            const isDiscovered = cell.status === "discovered";
            const visibleCrewIds = crewIdsForCell(runtimeTile, tile);
            const hasCrewSignal = !isDiscovered && Boolean(cell.tile) && visibleCrewIds.length > 0;
            const dangerTags = isDiscovered && tile ? (tile.dangerTags ?? []) : [];
            const hasDanger = isDiscovered && tile ? dangerTags.length > 0 || (tile.danger !== "未发现即时危险" && tile.danger !== "未知详情") : false;
            const isRouteTile = movePreview?.route.includes(cell.id) ?? false;
            const isMoveTarget = selectedMoveTargetId === cell.id;
            const hasCurrentCrew = visibleCrewIds.length > 0;
            const firstEventMark = tile?.eventMarks?.[0];
            return (
              <button
                type="button"
                key={cell.id}
                className={`map-cell ${selectedCell?.id === cell.id ? "map-cell-selected" : ""} ${
                  isDiscovered ? "" : "map-cell-unknown"
                } ${hasDanger ? "map-cell-danger" : ""} ${isRouteTile ? "map-cell-route" : ""} ${isMoveTarget ? "map-cell-target" : ""} ${
                  hasCurrentCrew ? "map-cell-crew-current" : ""
                }`}
                onClick={() => setSelectedId(cell.id)}
              >
                <strong>{formatCellCoord(cell)}</strong>
                {isDiscovered && cell.tile && tile ? (
                  <>
                    <span>{cell.tile.areaName}</span>
                    <small>地形：{cell.tile.terrain}</small>
                    <small>天气：{cell.tile.weather}</small>
                    <small>对象：{objectSummary(revealedObjects(cell, runtimeTile))}</small>
                    <small>状态：{specialStateSummary(revealedSpecialStates(cell, runtimeTile))}</small>
                    {tile.crew.map((crewId) => {
                      const member = crewById.get(crewId);
                      return member ? (
                        <small key={crewId} className={member.statusTone === "danger" ? "danger-text" : ""}>
                          {member.name}：{shortStatus(member.status)}
                        </small>
                      ) : null;
                    })}
                    {firstEventMark ? <small className="route-text">{firstEventMark.label}</small> : null}
                    {dangerTags.slice(0, 1).map((tag) => (
                      <small key={tag} className="danger-text">
                        {tag}
                      </small>
                    ))}
                  </>
                ) : hasCrewSignal && cell.tile ? (
                  <>
                    <span>未探索信号</span>
                    <small>地形：{cell.tile.terrain}</small>
                    <small>天气：{cell.tile.weather}</small>
                    {visibleCrewIds.map((crewId) => {
                      const member = crewById.get(crewId);
                      return member ? (
                        <small key={crewId} className={member.statusTone === "danger" ? "danger-text" : ""}>
                          {member.name}：{shortStatus(member.status)}
                        </small>
                      ) : null;
                    })}
                  </>
                ) : (
                  <>
                    <span>未探索信号</span>
                    <small>信号未确认</small>
                  </>
                )}
                {isRouteTile ? <small className="route-text">候选路线</small> : null}
                {isMoveTarget ? <small className="route-text">已标记目标</small> : null}
              </button>
            );
          })}
        </section>

        <Panel className="map-legend">
          <p>
            选中：橙色描边 · 队员回传：浅色底 · 危险：橙色文字 · 未探索信号：灰色低对比 · 候选路线：虚线标记 · 地图页面不直接下达移动指令
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
                ["手下状态", crewStatus(selectedTile, crewById)],
                ["计时状态", crewTiming(selectedTile, crewById, elapsedGameSeconds)],
                ["危险", selectedTile.danger],
                ["危险标签", formatList(selectedTile.dangerTags)],
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
                ["手下状态", crewStatus({ ...selectedTile, crew: crewIdsForCell(map.tilesById[selectedCell.id], selectedTile) }, crewById)],
                ["计时状态", crewTiming({ ...selectedTile, crew: crewIdsForCell(map.tilesById[selectedCell.id], selectedTile) }, crewById, elapsedGameSeconds)],
                ["行动提示", "队员可回传粗略环境；需要调查后确认对象与特殊状态详情"],
                ["候选移动", moveSelectionMember ? moveSelectionText(movePreview) : "未处于通话选点模式"],
              ]}
            />
          ) : (
            <FieldList
              rows={[
                ["信号状态", "信号未确认"],
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
          {crew.map((member) => (
            <p key={member.id}>
              <StatusTag tone={member.statusTone}>{member.name}</StatusTag> {crewMapLocation(member, map)}，{member.status}
              <br />
              <span className="muted-text">{memberTiming(member, elapsedGameSeconds)}</span>
            </p>
          ))}
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
    return "未探索信号";
  }

  return `未探索信号 ${formatCellCoord(getDisplayCoord(coord, origin))}`;
}

function getTileEventLogs(eventLogs: EventLog[], tileId: string) {
  return eventLogs
    .filter((log) => log.visibility === "player_visible" && log.tile_ids.includes(tileId))
    .slice()
    .sort((left, right) => right.occurred_at - left.occurred_at || right.id.localeCompare(left.id));
}

function formatList(values: string[] | undefined) {
  return values?.length ? values.join(" / ") : "无";
}

function formatEventMarks(tile: MapTile) {
  return tile.eventMarks?.length ? tile.eventMarks.map((mark) => mark.label).join(" / ") : "无";
}

function formatEventSummaries(eventLogs: EventLog[]) {
  return eventLogs.length ? eventLogs.map((log) => log.summary).join(" / ") : "暂无事件摘要";
}

function crewStatus(tile: MapTile, crewById: Map<string, CrewMember>) {
  if (tile.crew.length === 0) {
    return "无手下驻留";
  }

  return tile.crew
    .map((crewId) => {
      const member = crewById.get(crewId);
      return member ? `${member.name}：${member.status}` : crewId;
    })
    .join(" / ");
}

function crewTiming(tile: MapTile, crewById: Map<string, CrewMember>, elapsedGameSeconds: number) {
  if (tile.crew.length === 0) {
    return "无手下计时状态";
  }

  return tile.crew
    .map((crewId) => {
      const member = crewById.get(crewId);
      return member ? `${member.name}：${memberTiming(member, elapsedGameSeconds)}` : crewId;
    })
    .join(" / ");
}

function memberTiming(member: CrewMember, elapsedGameSeconds: number) {
  if (member.emergencyEvent && !member.emergencyEvent.settled) {
    return `紧急剩余 ${formatDuration(getRemainingSeconds(member.emergencyEvent.deadlineTime, elapsedGameSeconds))}`;
  }

  if (member.activeAction?.status === "inProgress") {
    return getCrewActionTiming(member, elapsedGameSeconds);
  }

  return "无进行中的计时行动";
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
