import { useState } from "react";
import type { QuestNavigationEntry } from "../content/contentData";
import type { QuestCategoryFilter, QuestDetailView, QuestEntryStatus, QuestSidebarView, QuestStatusFilter } from "../questSystem";
import { Panel, StatusTag } from "./Layout";

interface QuestSidebarProps {
  view: QuestSidebarView;
  quests?: QuestDetailView[];
  onNavigate: (entry: QuestNavigationEntry) => void;
  initiallyCollapsed?: boolean;
}

const missingIntelText = "当前任务情报缺失。";

export function QuestSidebar({ view, quests, onNavigate, initiallyCollapsed = false }: QuestSidebarProps) {
  const [collapsed, setCollapsed] = useState(initiallyCollapsed);
  const [statusFilter, setStatusFilter] = useState<QuestStatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<QuestCategoryFilter>("all");
  const [selectedQuestId, setSelectedQuestId] = useState<string | undefined>(view.selectedQuest?.id ?? quests?.[0]?.id);

  const sourceQuests = quests ?? (view.selectedQuest ? [view.selectedQuest] : []);
  const filteredQuests = sourceQuests.filter(
    (quest) => (statusFilter === "all" || quest.status === statusFilter) && (categoryFilter === "all" || quest.category === categoryFilter),
  );
  const selectedQuest = filteredQuests.find((quest) => quest.id === selectedQuestId) ?? filteredQuests[0];

  if (collapsed) {
    return (
      <aside className="quest-sidebar quest-sidebar-collapsed" aria-label="任务侧边栏">
        <button type="button" className="small-button quest-sidebar-toggle" onClick={() => setCollapsed(false)}>
          展开任务
        </button>
        <div className="quest-collapsed-metrics" aria-label="任务摘要">
          <span>未完成 {view.collapsedSummary.incompleteCount}</span>
          <span>主要 {view.collapsedSummary.mainIncompleteCount}</span>
        </div>
        <div className="quest-collapsed-updates">
          <strong>最近更新</strong>
          {view.collapsedSummary.recentlyUpdatedTitles.length > 0 ? (
            <ul>
              {view.collapsedSummary.recentlyUpdatedTitles.map((title) => (
                <li key={title}>{title}</li>
              ))}
            </ul>
          ) : (
            <p className="muted-text">暂无更新。</p>
          )}
        </div>
      </aside>
    );
  }

  return (
    <aside className="quest-sidebar" aria-label="任务侧边栏">
      <header className="quest-sidebar-header">
        <div>
          <p className="quest-sidebar-kicker">任务频道</p>
          <h2>任务追踪</h2>
        </div>
        <button type="button" className="small-button" onClick={() => setCollapsed(true)}>
          折叠
        </button>
      </header>

      <QuestFilterGroup
        label="完成状态"
        options={[
          ["all", "全部"],
          ["incomplete", "未完成"],
          ["completed", "已完成"],
        ]}
        value={statusFilter}
        onChange={(value) => setStatusFilter(value as QuestStatusFilter)}
      />
      <QuestFilterGroup
        label="任务类型"
        options={[
          ["all", "全部"],
          ["main", "主要"],
          ["side", "次要"],
        ]}
        value={categoryFilter}
        onChange={(value) => setCategoryFilter(value as QuestCategoryFilter)}
      />

      {sourceQuests.length === 0 ? (
        <Panel className="quest-empty-state">暂无已登记任务。</Panel>
      ) : filteredQuests.length === 0 ? (
        <Panel className="quest-empty-state">当前筛选下没有任务。</Panel>
      ) : (
        <div className="quest-sidebar-body">
          <section className="quest-list-panel" aria-label="任务列表">
            {filteredQuests.map((quest) => (
              <button
                type="button"
                key={quest.id}
                className={`quest-list-item ${quest.id === selectedQuest?.id ? "quest-list-item-active" : ""}`}
                onClick={() => setSelectedQuestId(quest.id)}
              >
                <span className="quest-list-title-row">
                  <span>{quest.title}</span>
                  {quest.updated ? <span className="quest-updated-dot">updated</span> : null}
                </span>
                <span className="quest-list-tags">
                  <QuestCategoryTag category={quest.category} />
                  <QuestStatusTag status={quest.status} />
                </span>
                <span className="quest-list-description">{formatCurrentDescription(quest.currentDescription)}</span>
              </button>
            ))}
          </section>

          {selectedQuest ? <QuestDetail quest={selectedQuest} onNavigate={onNavigate} /> : null}
        </div>
      )}
    </aside>
  );
}

function QuestFilterGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<[string, string]>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="quest-filter-group">
      <legend>{label}</legend>
      <div>
        {options.map(([optionValue, optionLabel]) => (
          <button
            type="button"
            key={optionValue}
            className={optionValue === value ? "primary-button" : "secondary-button"}
            aria-pressed={optionValue === value}
            onClick={() => onChange(optionValue)}
          >
            {optionLabel}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function QuestDetail({ quest, onNavigate }: { quest: QuestDetailView; onNavigate: (entry: QuestNavigationEntry) => void }) {
  return (
    <Panel className="quest-detail-panel">
      <header className="quest-detail-header">
        <div>
          <h3>{quest.title}</h3>
          <p>{quest.description}</p>
        </div>
        <div className="quest-list-tags">
          <QuestCategoryTag category={quest.category} />
          <QuestStatusTag status={quest.status} />
        </div>
      </header>
      <p className="quest-current-intel">{formatCurrentDescription(quest.currentDescription)}</p>
      <NavigationButtons entries={quest.navigation} onNavigate={onNavigate} />

      <div className="quest-subquest-stack">
        {quest.subquests.map((subquest) => (
          <section key={subquest.id} className={`quest-subquest quest-subquest-${subquest.status}`}>
            <header>
              <div>
                <h4>{subquest.title}</h4>
                <p>{subquest.summary}</p>
              </div>
              <QuestStatusTag status={subquest.status} />
            </header>
            <p className="quest-current-intel">{formatCurrentDescription(subquest.currentDescription)}</p>
            <NavigationButtons entries={subquest.navigation} onNavigate={onNavigate} />
            <ul className="quest-todo-list">
              {subquest.todos.map((todo) => (
                <li key={todo.id} className={`quest-todo quest-todo-${todo.status}`}>
                  <div>
                    <span className="quest-todo-title">{todo.title}</span>
                    {todo.description ? <p>{todo.description}</p> : null}
                  </div>
                  <QuestStatusTag status={todo.status} />
                  <NavigationButtons entries={todo.navigation} onNavigate={onNavigate} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Panel>
  );
}

function NavigationButtons({ entries, onNavigate }: { entries: QuestNavigationEntry[]; onNavigate: (entry: QuestNavigationEntry) => void }) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="quest-navigation-row" aria-label="任务导航">
      {entries.map((entry) => (
        <button type="button" className="small-button" key={navigationKey(entry)} onClick={() => onNavigate(entry)} disabled={!entry.label}>
          {entry.label || "目标不可用"}
        </button>
      ))}
    </div>
  );
}

function QuestCategoryTag({ category }: { category: "main" | "side" }) {
  return <StatusTag tone={category === "main" ? "accent" : "muted"}>{category === "main" ? "主要" : "次要"}</StatusTag>;
}

function QuestStatusTag({ status }: { status: QuestEntryStatus }) {
  return <StatusTag tone={status === "completed" ? "success" : "neutral"}>{status === "completed" ? "已完成" : "未完成"}</StatusTag>;
}

function formatCurrentDescription(description: string) {
  return description && description !== "Current quest intel is missing." ? description : missingIntelText;
}

function navigationKey(entry: QuestNavigationEntry) {
  if (entry.type === "page") {
    return `${entry.type}:${entry.page}:${entry.label}`;
  }
  if (entry.type === "tile") {
    return `${entry.type}:${entry.tile_id}:${entry.label}`;
  }
  return `${entry.type}:${entry.crew_id}:${entry.label}`;
}
