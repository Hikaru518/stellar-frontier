import { FieldList, Panel, StatusTag } from "../components/Layout";
import { defaultMapConfig } from "../content/contentData";
import { getDiaryAvailabilityLabel, getVisibleDiaryEntries } from "../diarySystem";
import type { CrewMember, Tone } from "../data/gameData";
import type { EventLog } from "../events/types";
import { getInventoryView } from "../inventorySystem";
import { getTileLocationLabel } from "../mapSystem";
import { formatGameTime } from "../timeSystem";

const attributeLabels: Array<[keyof CrewMember["attributes"], string]> = [
  ["physical", "体能"],
  ["agility", "敏捷"],
  ["intellect", "智力"],
  ["perception", "感知"],
  ["luck", "运气"],
];

export function CrewDetail({ member, eventLogs = [] }: { member: CrewMember; eventLogs?: EventLog[] }) {
  const diaryEntries = getVisibleDiaryEntries(member).sort((a, b) => a.gameSecond - b.gameSecond);
  const inventorySummary = formatInventorySummary(member.inventory);
  const memberEventLogs = eventLogs
    .filter((log) => log.visibility === "player_visible" && log.crew_ids.includes(member.id))
    .slice()
    .sort((left, right) => right.occurred_at - left.occurred_at || right.id.localeCompare(left.id))
    .slice(0, 5);

  return (
    <div className="crew-detail">
      <Panel title="背景档案">
        <FieldList
          rows={[
            ["原世界", member.profile.originWorld],
            ["原职业", member.profile.originProfession],
            ["当前位置", getTileLocationLabel(defaultMapConfig, member.currentTile)],
            ["经历", member.profile.experience],
            ["一句话", member.profile.selfIntro],
          ]}
        />
      </Panel>

      <Panel title="通讯语气">
        <p>{member.voiceTone}</p>
      </Panel>

      <Panel title="5 维轻量属性">
        <div className="attribute-grid">
          {attributeLabels.map(([key, label]) => (
            <div key={key} className="attribute-row">
              <span>{label}</span>
              <strong>{member.attributes[key]}</strong>
              <span className="attribute-bar" aria-label={`${label} ${member.attributes[key]} / 6`}>
                {"▮".repeat(member.attributes[key])}
                {"▯".repeat(6 - member.attributes[key])}
              </span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="自由性格标签">
        {member.personalityTags.length ? (
          <div className="tag-list">
            {member.personalityTags.map((tag) => (
              <span key={tag} className="text-chip">
                {tag}
              </span>
            ))}
          </div>
        ) : (
          <p className="muted-text">暂无性格标签。</p>
        )}
      </Panel>

      <Panel title="状态 / 知识标签">
        {member.conditions.length ? (
          <div className="tag-list">
            {member.conditions.map((condition) => (
              <span key={condition} className="text-chip">
                {formatConditionLabel(condition)}
              </span>
            ))}
          </div>
        ) : (
          <p className="muted-text">暂无状态或知识标签。</p>
        )}
      </Panel>

      <Panel title="事件影响">
        {memberEventLogs.length ? (
          <ol className="diary-list">
            {memberEventLogs.map((log) => (
              <li key={log.id}>
                <div className="diary-meta">
                  <span>{formatGameTime(log.occurred_at)}</span>
                  <StatusTag tone={getEventLogTone(log.importance)}>{formatEventImportance(log.importance)}</StatusTag>
                </div>
                <p>{log.summary}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted-text">暂无事件摘要。</p>
        )}
      </Panel>

      <Panel title="专长">
        <div className="expertise-list">
          {member.expertise.map((expertise) => (
            <article key={expertise.expertiseId} className="expertise-item">
              <div className="expertise-heading">
                <strong>{expertise.name}</strong>
                {expertise.ruleEffect ? <StatusTag tone="accent">规则效果</StatusTag> : <StatusTag tone="muted">文本依据</StatusTag>}
              </div>
              <p>{expertise.description}</p>
              {expertise.ruleEffect ? <p className="muted-text">{formatRuleEffect(expertise.ruleEffect)}</p> : null}
            </article>
          ))}
        </div>
      </Panel>

      <Panel title="关键节点日记">
        <ol className="diary-list">
          {diaryEntries.map((entry) => (
            <li key={entry.entryId} className={entry.visible ? "" : "diary-locked"}>
              <div className="diary-meta">
                <span>{formatGameTime(entry.gameSecond)}</span>
                <span>{entry.triggerNode}</span>
                <StatusTag tone={getAvailabilityTone(entry.availability)}>{getDiaryAvailabilityLabel(entry.availability)}</StatusTag>
              </div>
              <p>{entry.visible ? entry.text : "失联期间记录，未传回。"}</p>
            </li>
          ))}
        </ol>
      </Panel>

      <Panel title="携带物">
        <p>{inventorySummary}</p>
        <p className="muted-text">背包容量与负重规则不属于本轮人物系统。</p>
      </Panel>
    </div>
  );
}

function getEventLogTone(importance: EventLog["importance"]): Tone {
  if (importance === "critical") {
    return "danger";
  }
  if (importance === "major") {
    return "accent";
  }
  return "muted";
}

function formatEventImportance(importance: EventLog["importance"]) {
  if (importance === "critical") {
    return "紧急";
  }
  if (importance === "major") {
    return "重要";
  }
  if (importance === "normal") {
    return "记录";
  }
  return "简报";
}

function formatInventorySummary(inventory: CrewMember["inventory"]) {
  const inventoryView = getInventoryView(inventory);

  if (!inventoryView.length) {
    return "未记录携带物。";
  }

  return inventoryView.map((item) => `${item.name} x${item.quantity}`).join(" / ");
}

function formatRuleEffect(effect: NonNullable<CrewMember["expertise"][number]["ruleEffect"]>) {
  const percent = Math.round(effect.chance * 100);
  return `调查触发：${percent}% 概率获得 ${effect.resourceId} x${effect.amount}`;
}

function formatConditionLabel(condition: string) {
  const labels: Record<string, string> = {
    knows_repair_tech: "维修技术",
    knows_field_first_aid: "野外急救",
    knows_alien_language: "外星语言",
    wounded: "受伤",
  };

  return labels[condition] ?? condition;
}

function getAvailabilityTone(availability: CrewMember["diaryEntries"][number]["availability"]): Tone {
  if (availability === "lostBlocked") {
    return "danger";
  }
  if (availability === "recovered") {
    return "success";
  }
  if (availability === "pending") {
    return "accent";
  }
  return "muted";
}
