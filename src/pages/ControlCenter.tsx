import { useMemo, useState, type ReactNode } from "react";
import { ConsoleShell, FieldList, Modal, Panel, StatusTag, SystemLogPanel } from "../components/Layout";
import { facilities, type CrewMember, type ResourceSummary, type SystemLog } from "../data/gameData";

interface ControlCenterProps {
  crew: CrewMember[];
  logs: SystemLog[];
  resources: ResourceSummary;
  gameTimeLabel: string;
  onOpenStation: () => void;
  onOpenMap: () => void;
  onOpenDebug: () => void;
  onAppendLog: (text: string, tone?: "neutral" | "muted" | "accent" | "danger" | "success") => void;
}

export function ControlCenter({
  crew,
  logs,
  resources,
  gameTimeLabel,
  onOpenStation,
  onOpenMap,
  onOpenDebug,
  onAppendLog,
}: ControlCenterProps) {
  const [modal, setModal] = useState<string | null>(null);
  const incomingCount = crew.filter((member) => member.hasIncoming).length;
  const amy = crew.find((member) => member.id === "amy");

  const modalContent = useMemo(() => getFacilityModal(modal), [modal]);

  function handleFacility(id: string) {
    if (id === "station") {
      onOpenStation();
      return;
    }

    if (id === "radar") {
      onOpenMap();
      return;
    }

    setModal(id);
    const logText = facilityLog[id] ?? "控制中心记录了一次没有登记用途的点击。";
    onAppendLog(logText, id === "research" || id === "trade" ? "muted" : "neutral");
  }

  return (
    <ConsoleShell
      title="前沿基地控制中心"
      subtitle={`SOL ${String(resources.sol).padStart(3, "0")} / 本地供电 ${resources.power}% / 通讯窗口：${resources.commWindow}`}
      gameTimeLabel={gameTimeLabel}
      actions={
        <>
          <StatusTag tone={incomingCount > 0 ? "danger" : "muted"}>未读通讯 {incomingCount}</StatusTag>
          <button type="button" className="debug-button" onClick={onOpenDebug}>
            [DEBUG]
          </button>
        </>
      }
    >
      <div className="control-layout">
        <Panel title="中控台摘要" className="resource-summary">
          <FieldList
            rows={[
              ["能源", resources.energy],
              ["铁矿", resources.iron],
              ["基地完整度", `${resources.baseIntegrity}%`],
              ["通讯提示", incomingCount ? `${amy?.name ?? "未知"} 正在请求接入` : "没有新的请求，这通常不是好消息。"],
            ]}
          />
        </Panel>

        <div className="facility-grid">
          {facilities.map((facility) => (
            <button
              type="button"
              key={facility.id}
              className={`facility-card ${facility.variant ? `facility-${facility.variant}` : ""}`}
              onClick={() => handleFacility(facility.id)}
            >
              <span className="facility-label">{facility.label}</span>
              <span className={facility.id === "station" && incomingCount ? "facility-alert" : "facility-sub"}>
                {facility.id === "station" && incomingCount ? `${incomingCount} 条来电 · Amy` : facility.subLabel}
              </span>
            </button>
          ))}
        </div>

        <Panel title="当前建议" className="control-hint" tone={incomingCount ? "accent" : "neutral"}>
          <p>
            {incomingCount
              ? "先处理通讯台来电。中控台认为你继续忽视它也不会让问题变少。"
              : "暂无紧急请求。基地仍在运行，这一点暂时令人不安地可靠。"}
          </p>
        </Panel>

        <SystemLogPanel logs={logs} />
      </div>

      {modal && modalContent ? (
        <Modal title={modalContent.title} onClose={() => setModal(null)}>
          {modalContent.body}
        </Modal>
      ) : null}
    </ConsoleShell>
  );
}

const facilityLog: Record<string, string> = {
  window: "窗户返回一张低清晰度外部图像，沙尘像坏掉的电视雪花。",
  console: "中控台展开资源摘要，并提醒你库存不是信仰系统。",
  coffee: "咖啡机完成了一次毫无必要的自检。咖啡味道像旧电池。",
  record: "唱片机切换到低噪播放。噪声没有变少，只是更有节奏。",
  fridge: "冰箱提供了啤酒。它拒绝说明这些啤酒来自哪里。",
  research: "研究台仍未供电。它看起来对此没有意见。",
  trade: "星际贸易线路等待授权。价格已经先开始波动。",
  gate: "星际之门没有开启。总部的沉默非常总部。",
};

function getFacilityModal(id: string | null): { title: string; body: ReactNode } | null {
  switch (id) {
    case "window":
      return {
        title: "窗户 / 外部观察",
        body: (
          <>
            <div className="image-placeholder">外部观察图像 / 沙尘 / 远处异常光点</div>
            <p>能见度低。远处的光点没有移动，但雷达坚持说它正在靠近。</p>
          </>
        ),
      };
    case "console":
      return {
        title: "中控台 / 资源状态",
        body: <p>能源 620，铁矿 1240，基地完整度 71%。当前没有任何数字愿意承担责任。</p>,
      };
    case "coffee":
      return {
        title: "咖啡机",
        body: <p>你喝了一杯咖啡。系统没有记录任何数值变化，但你开始怀疑旧电池也是一种风味。</p>,
      };
    case "record":
      return {
        title: "唱片机",
        body: <p>低噪播放已开启。基地空气开始像一段被反复覆盖的磁带。</p>,
      };
    case "fridge":
      return {
        title: "冰箱",
        body: <p>冰箱里有啤酒，而且似乎无限量供应。中控台建议不要问补给链。</p>,
      };
    case "research":
      return {
        title: "研究台",
        body: <p>科技树入口已登记，但研究台未供电。它目前只研究如何保持沉默。</p>,
      };
    case "trade":
      return {
        title: "星际贸易",
        body: <p>资源交换窗口尚未接通。频道里只有报价单的静电声。</p>,
      };
    case "gate":
      return {
        title: "星际之门",
        body: <p>总部请求窗口等待授权。它看起来很重要，也很会拖延。</p>,
      };
    default:
      return null;
  }
}
