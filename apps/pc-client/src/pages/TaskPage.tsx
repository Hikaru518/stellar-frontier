import { useMemo, useState } from "react";
import type { QuestNavigationEntry } from "../content/contentData";
import { GameConsoleLayout } from "../components/Layout";
import { deriveCrewActionViewModel, type CrewActionViewModel } from "../crewSystem";
import type { CrewId, CrewMember, MapTile, SystemLog } from "../data/gameData";
import type { CrewActionState, RuntimeCall } from "../events/types";
import type { QuestCategoryFilter, QuestDetailView, QuestEntryStatus, QuestSidebarView, QuestStatusFilter, TodoView } from "../questSystem";

interface TaskPageProps {
  view: QuestSidebarView;
  statusFilter: QuestStatusFilter;
  categoryFilter: QuestCategoryFilter;
  navigationMessage?: string;
  crew: CrewMember[];
  crewActions: Record<string, CrewActionState>;
  activeCalls: Record<string, RuntimeCall>;
  elapsedGameSeconds: number;
  tiles: MapTile[];
  gameTimeLabel: string;
  hasQuestUpdates: boolean;
  logs: SystemLog[];
  onStatusFilterChange: (filter: QuestStatusFilter) => void;
  onCategoryFilterChange: (filter: QuestCategoryFilter) => void;
  onSelectedQuestIdChange: (questId: string) => void;
  onNavigate: (entry: QuestNavigationEntry) => void;
  onOpenControl: () => void;
  onOpenMap: () => void;
  onStartCall: (crewId: CrewId) => void;
  onShowCrewStatus: (crewId: CrewId) => void;
  onShowCrewInventory: (crewId: CrewId) => void;
}

const missingIntelText = "当前任务情报缺失。";

export function TaskPage({
  view,
  statusFilter,
  categoryFilter,
  navigationMessage,
  crew,
  crewActions,
  activeCalls,
  elapsedGameSeconds,
  tiles,
  gameTimeLabel,
  hasQuestUpdates,
  logs,
  onStatusFilterChange,
  onCategoryFilterChange,
  onSelectedQuestIdChange,
  onNavigate,
  onOpenControl,
  onOpenMap,
  onStartCall,
  onShowCrewStatus,
  onShowCrewInventory,
}: TaskPageProps) {
  const latestLog = logs[logs.length - 1];
  const [traceLines, setTraceLines] = useState<string[]>([]);
  const selectedQuest = view.selectedQuest;
  const visibleQuests = view.list;
  const updatedText = view.collapsedSummary.recentlyUpdatedTitles.length ? view.collapsedSummary.recentlyUpdatedTitles.join(" / ") : "暂无更新";
  const activeRuntimeCalls = Object.values(activeCalls).filter((call) => call.status === "incoming" || call.status === "connected" || call.status === "awaiting_choice");

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

  function pushTrace(line: string) {
    setTraceLines((current) => [line, ...current].slice(0, 10));
  }

  function handleSelectQuest(questId: string, title: string) {
    onSelectedQuestIdChange(questId);
    pushTrace(`[SELECT] ${title}`);
  }

  function handleNavigate(entry: QuestNavigationEntry) {
    pushTrace(`[NAV] ${entry.label || "目标不可用"}`);
    onNavigate(entry);
  }

  function handleOpenCrewStatus(member: CrewMember) {
    pushTrace(`[CREW] ${member.name} / 打开角色状态页`);
    onShowCrewStatus(member.id);
  }

  function handleOpenCrewInventory(member: CrewMember) {
    pushTrace(`[PACK] ${member.name} / 打开角色背包页`);
    onShowCrewInventory(member.id);
  }

  return (
    <GameConsoleLayout
      title="任务追踪"
      subtitle=""
      gameTimeLabel={gameTimeLabel}
      statusItems={[
        { label: "unfinished", value: `${view.collapsedSummary.incompleteCount}` },
        { label: "main", value: `${view.collapsedSummary.mainIncompleteCount}` },
        { label: "updated", value: updatedText },
        { label: "calls", value: `${activeRuntimeCalls.length} 路` },
      ]}
      navItems={[
        { id: "control", label: "控制台", meta: "main", onClick: onOpenControl },
        { id: "task", label: "任务", meta: "task", attention: hasQuestUpdates, active: true },
        { id: "map", label: "地图", meta: "map", onClick: onOpenMap },
      ]}
      crewPanel={
        <div className="console-crew-stack">
          {crew.map((member) => {
            const actionView = crewActionViews[member.id];
            const hasRuntimeCall = activeRuntimeCalls.some((call) => call.crew_id === member.id);
            const timingText = actionView.blockingReason ?? actionView.timingText;
            return (
              <article key={member.id} className={`console-crew-card ${hasRuntimeCall || member.hasIncoming ? "console-crew-card-alert" : ""}`}>
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
                  <button type="button" className="console-crew-button" onClick={() => onStartCall(member.id)} disabled={!member.canCommunicate && !member.hasIncoming}>
                    {hasRuntimeCall || member.hasIncoming ? "接通" : "通话"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      }
      rightPanel={
        <section className="console-side-panel console-task-side-panel">
          <div className="console-column-header">
            <span>task controls</span>
          </div>
          <section className="console-task-control-panel" aria-label="任务操作">
            <TaskFilterGroup
              label="完成状态"
              options={[
                ["all", "全部"],
                ["incomplete", "未完成"],
                ["completed", "已完成"],
              ]}
              value={statusFilter}
              onChange={(value) => onStatusFilterChange(value as QuestStatusFilter)}
            />
            <TaskFilterGroup
              label="任务类型"
              options={[
                ["all", "全部"],
                ["main", "主要"],
                ["side", "次要"],
              ]}
              value={categoryFilter}
              onChange={(value) => onCategoryFilterChange(value as QuestCategoryFilter)}
            />
          </section>
          <section className="console-task-select-list" aria-label="任务选择">
            {renderTaskSelectList(view, visibleQuests, selectedQuest, handleSelectQuest)}
          </section>
          {selectedQuest ? <TaskDetailPanel quest={selectedQuest} onNavigate={handleNavigate} /> : <p className="console-map-trace-line">[TASK] NO SELECTED QUEST</p>}
          <div className="console-task-trace">
            <p className="console-map-trace-line">[RECENT] {updatedText}</p>
            {navigationMessage ? <p className="console-map-trace-line-active">[NAV] {navigationMessage}</p> : null}
            {traceLines.map((line, index) => (
              <p key={`${index}-${line}`} className={index === 0 ? "console-map-trace-line console-map-trace-line-active" : "console-map-trace-line"}>
                {line}
              </p>
            ))}
          </div>
        </section>
      }
      bottomBar={
        <div className="console-bottom-strip">
          <strong>] LOG:</strong>
          <span>{latestLog ? latestLog.text : "任务追踪在线。"}</span>
        </div>
      }
    >
      <div className="console-screen-content console-task-screen">
        <div className="console-screen-header">
          <span>crt mission board</span>
          <strong>任务追踪 / Mission Board</strong>
          <span>list / progress / recent updates</span>
        </div>

        <div className="console-task-overview">
          <section className="console-task-summary">
            <p className="console-screen-command">] LOAD QUEST-TRACKER.BAS</p>
            <p className="console-screen-line console-screen-line-cyan">UNFINISHED {view.collapsedSummary.incompleteCount} / MAIN {view.collapsedSummary.mainIncompleteCount}</p>
            <p className="console-screen-line console-screen-line-amber">RECENT UPDATE: {updatedText}</p>
          </section>
        </div>

        {view.emptyText === "No registered quests." ? (
          <div className="console-screen-block">
            <p className="console-screen-section">[ TASK LIST ]</p>
            <p>暂无已登记任务。</p>
          </div>
        ) : visibleQuests.length === 0 ? (
          <div className="console-screen-block">
            <p className="console-screen-section">[ TASK LIST ]</p>
            <p>当前筛选下没有任务。</p>
          </div>
        ) : selectedQuest ? (
          <TaskReadout quest={selectedQuest} />
        ) : (
          <div className="console-screen-block">
            <p className="console-screen-section">[ TASK FILE ]</p>
            <p>请在右侧任务列表选择一个任务。</p>
          </div>
        )}
      </div>
    </GameConsoleLayout>
  );
}

function renderTaskSelectList(
  view: QuestSidebarView,
  visibleQuests: QuestSidebarView["list"],
  selectedQuest: QuestDetailView | undefined,
  onSelect: (questId: string, title: string) => void,
) {
  if (view.emptyText === "No registered quests.") {
    return <p className="console-map-trace-line">[TASK] 暂无已登记任务。</p>;
  }

  if (visibleQuests.length === 0) {
    return <p className="console-map-trace-line">[TASK] 当前筛选下没有任务。</p>;
  }

  return visibleQuests.map((quest) => (
    <button
      type="button"
      key={quest.id}
      className={`console-task-row ${quest.id === selectedQuest?.id ? "console-task-row-active" : ""}`}
      onClick={() => onSelect(quest.id, quest.title)}
    >
      <span className="console-task-row-title">
        <strong>{quest.title}</strong>
        {quest.updated ? <em>UPDATED</em> : null}
      </span>
      <span>{quest.category === "main" ? "主要" : "次要"} / {formatQuestStatus(quest.status)}</span>
      <span>{quest.status === "incomplete" ? formatCurrentDescription(quest.currentDescription) : "任务已完成。"}</span>
    </button>
  ));
}

function TaskReadout({ quest }: { quest: QuestDetailView }) {
  return (
    <div className="console-task-readout">
      <section className="console-screen-block">
        <p className="console-screen-section">[ SELECTED TASK ]</p>
        <p className="console-screen-line console-screen-line-amber">{quest.title}</p>
        <p>{quest.description}</p>
        <p className="console-screen-line console-screen-line-cyan">
          TYPE {quest.category === "main" ? "MAIN" : "SIDE"} / STATUS {formatQuestStatus(quest.status)}
        </p>
        {quest.status === "incomplete" ? <p className="console-screen-line console-screen-line-amber">INTEL: {formatCurrentDescription(quest.currentDescription)}</p> : null}
      </section>
      <section className="console-screen-block">
        <p className="console-screen-section">[ PROGRESS ]</p>
        {quest.todos.length ? (
          quest.todos.map((todo, index) => (
            <p key={todo.id} className={todo.status === "completed" ? "console-screen-line console-screen-line-green" : "console-screen-line"}>
              {index + 1}) {todo.title} / {formatQuestStatus(todo.status)}
              {todo.description ? ` / ${todo.description}` : ""}
            </p>
          ))
        ) : (
          <p>当前任务没有独立待办项。</p>
        )}
      </section>
      {quest.subquests.length ? (
        <section className="console-screen-block">
          <p className="console-screen-section">[ SUB TASKS ]</p>
          {quest.subquests.map((subquest, index) => (
            <p key={subquest.id} className="console-screen-line">
              {index + 1}) {subquest.title} / {formatQuestStatus(subquest.status)} / {subquest.summary}
            </p>
          ))}
        </section>
      ) : null}
      {quest.completionResult ? (
        <section className="console-screen-block">
          <p className="console-screen-section">[ RESULT ]</p>
          <p className="console-screen-line console-screen-line-green">{quest.completionResult.title}</p>
          <p>{quest.completionResult.summary}</p>
        </section>
      ) : null}
    </div>
  );
}

function TaskFilterGroup({
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
    <div className="console-task-filter-group">
      <span>{label}</span>
      <div>
        {options.map(([optionValue, optionLabel]) => (
          <button
            type="button"
            key={optionValue}
            className={optionValue === value ? "console-layer-toggle console-layer-toggle-active" : "console-layer-toggle"}
            aria-pressed={optionValue === value}
            onClick={() => onChange(optionValue)}
          >
            {optionLabel}
          </button>
        ))}
      </div>
    </div>
  );
}

function TaskDetailPanel({ quest, onNavigate }: { quest: QuestDetailView; onNavigate: (entry: QuestNavigationEntry) => void }) {
  return (
    <div className="console-task-detail">
      <p className="console-screen-command">] OPEN TASK FILE</p>
      <h3>{quest.title}</h3>
      <p>{quest.description}</p>
      <p className="console-map-trace-line">[TYPE] {quest.category === "main" ? "主要" : "次要"} / [STATUS] {formatQuestStatus(quest.status)}</p>
      {quest.status === "incomplete" ? <p className="console-map-trace-line-active">[INTEL] {formatCurrentDescription(quest.currentDescription)}</p> : null}
      <NavigationButtons entries={quest.navigation} onNavigate={onNavigate} />
      {quest.completionResult ? (
        <section className="console-task-result">
          <strong>{quest.completionResult.title}</strong>
          <p>{quest.completionResult.summary}</p>
          {quest.completionResult.outcomes?.map((outcome) => <p key={outcome}>- {outcome}</p>)}
        </section>
      ) : null}
      <TodoList todos={quest.todos} onNavigate={onNavigate} />
      {quest.subquests.map((subquest) => (
        <section key={subquest.id} className="console-task-subquest">
          <header>
            <strong>{subquest.title}</strong>
            <span>{formatQuestStatus(subquest.status)}</span>
          </header>
          <p>{subquest.summary}</p>
          {subquest.status === "incomplete" ? <p className="console-map-trace-line-active">[INTEL] {formatCurrentDescription(subquest.currentDescription)}</p> : null}
          <NavigationButtons entries={subquest.navigation} onNavigate={onNavigate} />
          <TodoList todos={subquest.todos} onNavigate={onNavigate} />
        </section>
      ))}
    </div>
  );
}

function TodoList({ todos, onNavigate }: { todos: TodoView[]; onNavigate: (entry: QuestNavigationEntry) => void }) {
  if (todos.length === 0) {
    return null;
  }

  return (
    <ul className="console-task-todo-list">
      {todos.map((todo) => (
        <li key={todo.id} className={`console-task-todo console-task-todo-${todo.status}`}>
          <div>
            <strong>{todo.title}</strong>
            {todo.description ? <p>{todo.description}</p> : null}
          </div>
          <span>{formatQuestStatus(todo.status)}</span>
          <NavigationButtons entries={todo.navigation} onNavigate={onNavigate} />
        </li>
      ))}
    </ul>
  );
}

function NavigationButtons({ entries, onNavigate }: { entries: QuestNavigationEntry[]; onNavigate: (entry: QuestNavigationEntry) => void }) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="console-task-navigation-row" aria-label="任务导航">
      {entries.map((entry) => (
        <button type="button" className="console-crew-button console-crew-button-secondary" key={navigationKey(entry)} onClick={() => onNavigate(entry)} disabled={!entry.label}>
          {entry.label || "目标不可用"}
        </button>
      ))}
    </div>
  );
}

function formatQuestStatus(status: QuestEntryStatus) {
  return status === "completed" ? "已完成" : "未完成";
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
