import { FieldList, Panel, StatusTag } from "../components/Layout";
import { getDiaryAvailabilityLabel, getVisibleDiaryEntries } from "../diarySystem";
import type { CrewMember, Tone } from "../data/gameData";
import { formatGameTime } from "../timeSystem";

const attributeLabels: Array<[keyof CrewMember["attributes"], string]> = [
  ["physical", "体能"],
  ["agility", "敏捷"],
  ["intellect", "智力"],
  ["perception", "感知"],
  ["luck", "运气"],
];

export function CrewDetail({ member }: { member: CrewMember }) {
  const diaryEntries = getVisibleDiaryEntries(member).sort((a, b) => a.gameSecond - b.gameSecond);

  return (
    <div className="crew-detail">
      <Panel title="背景档案">
        <FieldList
          rows={[
            ["原世界", member.profile.originWorld],
            ["原职业", member.profile.originProfession],
            ["经历", member.profile.experience],
            ["一句话", member.profile.selfIntro],
          ]}
        />
      </Panel>

      <Panel title="通讯语气">
        <p>{member.voiceTone}</p>
        <p className="muted-text">{member.summary}</p>
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
        <div className="tag-list">
          {member.personalityTags.map((tag) => (
            <span key={tag} className="text-chip">
              {tag}
            </span>
          ))}
        </div>
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
        <p>{member.bag.length ? member.bag.join(" / ") : "未记录携带物。"}</p>
        <p className="muted-text">背包容量与负重规则不属于本轮人物系统。</p>
      </Panel>
    </div>
  );
}

function formatRuleEffect(effect: NonNullable<CrewMember["expertise"][number]["ruleEffect"]>) {
  const percent = Math.round(effect.chance * 100);
  return `调查触发：${percent}% 概率获得 ${effect.resourceId} x${effect.amount}`;
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
