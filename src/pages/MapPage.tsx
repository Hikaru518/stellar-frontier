import { useMemo, useState } from "react";
import { ConsoleShell, FieldList, Panel, StatusTag } from "../components/Layout";
import type { CrewMember, MapReturnTarget, MapTile } from "../data/gameData";
import { formatDuration, getRemainingSeconds } from "../timeSystem";

interface MapPageProps {
  tiles: MapTile[];
  crew: CrewMember[];
  elapsedGameSeconds: number;
  gameTimeLabel: string;
  returnTarget: MapReturnTarget;
  onReturn: () => void;
}

export function MapPage({ tiles, crew, elapsedGameSeconds, gameTimeLabel, returnTarget, onReturn }: MapPageProps) {
  const [selectedId, setSelectedId] = useState("3-3");
  const selectedTile = tiles.find((tile) => tile.id === selectedId) ?? tiles[0];

  const crewById = useMemo(
    () => new Map(crew.map((member) => [member.id, member])),
    [crew],
  );

  return (
    <ConsoleShell
      title="卫星雷达地图"
      subtitle="4x4 地块网格 / 地图只读 / 指令需返回通话或通讯台发起"
      gameTimeLabel={gameTimeLabel}
      actions={
        <button type="button" className="primary-button" onClick={onReturn}>
          {returnTarget === "call" ? "返回当前通话" : "返回控制中心"}
        </button>
      }
    >
      <div className="map-layout">
        <section className="map-grid" aria-label="4x4 星球地块">
          {tiles.map((tile) => {
            const hasDanger = tile.danger !== "未发现即时危险" && tile.danger !== "未知详情";
            return (
              <button
                type="button"
                key={tile.id}
                className={`map-cell ${selectedTile.id === tile.id ? "map-cell-selected" : ""} ${
                  tile.investigated ? "" : "map-cell-unknown"
                } ${hasDanger ? "map-cell-danger" : ""}`}
                onClick={() => setSelectedId(tile.id)}
              >
                <strong>{tile.coord}</strong>
                <span>{tile.terrain}</span>
                {tile.resources.slice(0, 1).map((resource) => (
                  <small key={resource}>{resource}</small>
                ))}
                {tile.buildings.slice(0, 1).map((building) => (
                  <small key={building}>{building}</small>
                ))}
                {tile.crew.map((crewId) => {
                  const member = crewById.get(crewId);
                  return member ? (
                    <small key={crewId} className={member.statusTone === "danger" ? "danger-text" : ""}>
                      {member.name}：{shortStatus(member.status)}
                    </small>
                  ) : null;
                })}
              </button>
            );
          })}
        </section>

        <Panel className="map-legend">
          <p>选中：橙色描边 · 危险：橙色文字 · 未调查：灰色低对比 · 地图页面不提供联系/移动/建设按钮</p>
        </Panel>

        <Panel title={`坐标详情：${selectedTile.coord}`} className="map-detail">
          <FieldList
            rows={[
              ["地形", selectedTile.terrain],
              ["自然资源", selectedTile.resources.length ? selectedTile.resources.join(" / ") : "未知资源"],
              ["玩家建筑", selectedTile.buildings.length ? selectedTile.buildings.join(" / ") : "无"],
              ["仪器", selectedTile.instruments.length ? selectedTile.instruments.join(" / ") : "无"],
              ["手下状态", crewStatus(selectedTile, crewById)],
              ["计时状态", crewTiming(selectedTile, crewById, elapsedGameSeconds)],
              ["危险", selectedTile.danger],
              ["状态", selectedTile.status],
            ]}
          />
          <p className="muted-text">地图只展示信息。若要移动、建设或调查，请返回通话页面确认指令。</p>
        </Panel>

        <Panel title="手下状态" className="crew-map-panel">
          {crew.map((member) => (
            <p key={member.id}>
              <StatusTag tone={member.statusTone}>{member.name}</StatusTag> {member.coord} {member.location}，{member.status}
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
    return `行动剩余 ${formatDuration(getRemainingSeconds(member.activeAction.finishTime, elapsedGameSeconds))}`;
  }

  return "无进行中的计时行动";
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
