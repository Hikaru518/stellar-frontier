import type { QuestCategory, QuestDefinition, QuestNavigationEntry, SubquestDefinition } from "./content/contentData";

export type QuestEntryStatus = "incomplete" | "completed";

export interface QuestRuntimeState {
  quests: Record<string, QuestProgress>;
  updated_quest_ids: string[];
}

export interface QuestProgress {
  id: string;
  status: QuestEntryStatus;
  current_node_id: string;
  updated_at: number;
  completed_at?: number | null;
  subquests: Record<string, SubquestProgress>;
}

export interface SubquestProgress {
  id: string;
  status: QuestEntryStatus;
  current_node_id: string;
  updated_at: number;
  completed_at?: number | null;
  todos: Record<string, TodoProgress>;
}

export interface TodoProgress {
  id: string;
  status: QuestEntryStatus;
  updated_at: number;
  completed_at?: number | null;
}

export type QuestProgressOperation =
  | "complete_quest"
  | "complete_subquest"
  | "complete_todo"
  | "set_quest_node"
  | "set_subquest_node"
  | "mark_updated";

export interface ApplyQuestProgressInput {
  state: QuestRuntimeState;
  definitions: QuestDefinition[];
  operation: QuestProgressOperation;
  quest_id: string;
  subquest_id?: string;
  todo_id?: string;
  node_id?: string;
  occurred_at: number;
}

export interface ApplyQuestProgressResult {
  state: QuestRuntimeState;
  warnings: string[];
}

export type QuestStatusFilter = "all" | QuestEntryStatus;
export type QuestCategoryFilter = "all" | QuestCategory;

export interface BuildQuestSidebarViewInput {
  state: QuestRuntimeState;
  definitions: QuestDefinition[];
  statusFilter?: QuestStatusFilter;
  categoryFilter?: QuestCategoryFilter;
  selectedQuestId?: string;
}

export interface QuestSidebarView {
  collapsedSummary: QuestCollapsedSummary;
  list: QuestListItemView[];
  selectedQuest?: QuestDetailView;
  emptyText: string;
}

export interface QuestCollapsedSummary {
  incompleteCount: number;
  mainIncompleteCount: number;
  recentlyUpdatedTitles: string[];
}

export interface QuestListItemView {
  id: string;
  category: QuestCategory;
  title: string;
  summary: string;
  status: QuestEntryStatus;
  currentDescription: string;
  updated: boolean;
  completedAt?: number | null;
}

export interface QuestDetailView extends QuestListItemView {
  description: string;
  navigation: QuestNavigationEntry[];
  subquests: SubquestView[];
}

export interface SubquestView {
  id: string;
  title: string;
  summary: string;
  status: QuestEntryStatus;
  currentDescription: string;
  navigation: QuestNavigationEntry[];
  todos: TodoView[];
}

export interface TodoView {
  id: string;
  title: string;
  description?: string;
  status: QuestEntryStatus;
  navigation: QuestNavigationEntry[];
}

const missingCurrentDescription = "Current quest intel is missing.";

export function createInitialQuestState(definitions: QuestDefinition[], occurredAt: number): QuestRuntimeState {
  return {
    quests: Object.fromEntries(definitions.map((definition) => [definition.id, createQuestProgress(definition, occurredAt)])),
    updated_quest_ids: [],
  };
}

export function normalizeQuestState(savedState: unknown, definitions: QuestDefinition[], occurredAt: number): QuestRuntimeState {
  const saved = isQuestRuntimeState(savedState) ? savedState : undefined;
  const definitionById = new Map(definitions.map((definition) => [definition.id, definition]));

  return {
    quests: Object.fromEntries(
      definitions.map((definition) => [definition.id, normalizeQuestProgress(saved?.quests[definition.id], definition, occurredAt)]),
    ),
    updated_quest_ids: (saved?.updated_quest_ids ?? []).filter((questId, index, ids) => definitionById.has(questId) && ids.indexOf(questId) === index),
  };
}

export function applyQuestProgress(input: ApplyQuestProgressInput): ApplyQuestProgressResult {
  const definition = input.definitions.find((quest) => quest.id === input.quest_id);
  const quest = input.state.quests[input.quest_id];
  if (!definition || !quest) {
    return warn(input.state, `Quest ${input.quest_id} does not exist.`);
  }

  if (input.operation === "mark_updated") {
    return { state: updateQuest(input.state, quest, { updated_at: input.occurred_at }), warnings: [] };
  }

  if (input.operation === "complete_quest") {
    if (quest.status === "completed") {
      return { state: input.state, warnings: [] };
    }
    return {
      state: updateQuest(input.state, quest, {
        status: "completed",
        updated_at: input.occurred_at,
        completed_at: input.occurred_at,
      }),
      warnings: [],
    };
  }

  if (input.operation === "set_quest_node") {
    if (!input.node_id || !definition.nodes.some((node) => node.id === input.node_id)) {
      return warn(input.state, `Quest node ${input.node_id ?? ""} does not exist in quest ${definition.id}.`);
    }
    if (quest.current_node_id === input.node_id) {
      return { state: input.state, warnings: [] };
    }
    return { state: updateQuest(input.state, quest, { current_node_id: input.node_id, updated_at: input.occurred_at }), warnings: [] };
  }

  const subquestDefinition = definition.subquests.find((subquest) => subquest.id === input.subquest_id);
  const subquest = input.subquest_id ? quest.subquests[input.subquest_id] : undefined;
  if (!input.subquest_id || !subquestDefinition || !subquest) {
    return warn(input.state, `Subquest ${input.subquest_id ?? ""} does not exist in quest ${definition.id}.`);
  }

  if (input.operation === "complete_subquest") {
    if (subquest.status === "completed") {
      return { state: input.state, warnings: [] };
    }
    return {
      state: updateSubquest(input.state, quest, subquest, {
        status: "completed",
        updated_at: input.occurred_at,
        completed_at: input.occurred_at,
      }),
      warnings: [],
    };
  }

  if (input.operation === "set_subquest_node") {
    if (!input.node_id || !subquestDefinition.nodes.some((node) => node.id === input.node_id)) {
      return warn(input.state, `Subquest node ${input.node_id ?? ""} does not exist in subquest ${subquestDefinition.id}.`);
    }
    if (subquest.current_node_id === input.node_id) {
      return { state: input.state, warnings: [] };
    }
    return {
      state: updateSubquest(input.state, quest, subquest, { current_node_id: input.node_id, updated_at: input.occurred_at }),
      warnings: [],
    };
  }

  const todoDefinition = subquestDefinition.todos.find((todo) => todo.id === input.todo_id);
  const todo = input.todo_id ? subquest.todos[input.todo_id] : undefined;
  if (!input.todo_id || !todoDefinition || !todo) {
    return warn(input.state, `Todo ${input.todo_id ?? ""} does not exist in subquest ${subquestDefinition.id}.`);
  }

  if (todo.status === "completed") {
    return { state: input.state, warnings: [] };
  }

  return {
    state: updateTodo(input.state, quest, subquest, todo, {
      status: "completed",
      updated_at: input.occurred_at,
      completed_at: input.occurred_at,
    }),
    warnings: [],
  };
}

export function buildQuestSidebarView(input: BuildQuestSidebarViewInput): QuestSidebarView {
  const statusFilter = input.statusFilter ?? "all";
  const categoryFilter = input.categoryFilter ?? "all";
  const normalizedState = normalizeQuestState(input.state, input.definitions, 0);
  const updatedQuestIds = new Set(normalizedState.updated_quest_ids);
  const allItems = input.definitions.map((definition, index) => toQuestDetailView(definition, normalizedState.quests[definition.id], updatedQuestIds, index));
  const filteredItems = sortQuestItems(
    allItems.filter((item) => statusFilter === "all" || item.status === statusFilter).filter((item) => categoryFilter === "all" || item.category === categoryFilter),
  );
  const selectedQuest = input.selectedQuestId
    ? filteredItems.find((item) => item.id === input.selectedQuestId)
    : filteredItems.find((item) => item.status === "incomplete") ?? filteredItems[0];

  return {
    collapsedSummary: {
      incompleteCount: allItems.filter((item) => item.status === "incomplete").length,
      mainIncompleteCount: allItems.filter((item) => item.category === "main" && item.status === "incomplete").length,
      recentlyUpdatedTitles: normalizedState.updated_quest_ids
        .map((questId) => allItems.find((item) => item.id === questId)?.title)
        .filter((title): title is string => Boolean(title))
        .slice(0, 2),
    },
    list: filteredItems.map(toQuestListItemView),
    selectedQuest,
    emptyText: input.definitions.length === 0 ? "No registered quests." : "No quests match the current filters.",
  };
}

function createQuestProgress(definition: QuestDefinition, occurredAt: number): QuestProgress {
  return {
    id: definition.id,
    status: "incomplete",
    current_node_id: definition.initial_node_id,
    updated_at: occurredAt,
    completed_at: null,
    subquests: Object.fromEntries(definition.subquests.map((subquest) => [subquest.id, createSubquestProgress(subquest, occurredAt)])),
  };
}

function createSubquestProgress(definition: SubquestDefinition, occurredAt: number): SubquestProgress {
  return {
    id: definition.id,
    status: "incomplete",
    current_node_id: definition.initial_node_id,
    updated_at: occurredAt,
    completed_at: null,
    todos: Object.fromEntries(
      definition.todos.map((todo) => [
        todo.id,
        {
          id: todo.id,
          status: "incomplete" as const,
          updated_at: occurredAt,
          completed_at: null,
        },
      ]),
    ),
  };
}

function normalizeQuestProgress(saved: QuestProgress | undefined, definition: QuestDefinition, occurredAt: number): QuestProgress {
  const initial = createQuestProgress(definition, occurredAt);
  const savedCurrentNodeId = saved?.current_node_id;
  return {
    ...initial,
    status: normalizeStatus(saved?.status),
    current_node_id: savedCurrentNodeId && definition.nodes.some((node) => node.id === savedCurrentNodeId) ? savedCurrentNodeId : definition.initial_node_id,
    updated_at: typeof saved?.updated_at === "number" ? saved.updated_at : occurredAt,
    completed_at: normalizeCompletedAt(saved, normalizeStatus(saved?.status)),
    subquests: Object.fromEntries(
      definition.subquests.map((subquest) => [subquest.id, normalizeSubquestProgress(saved?.subquests[subquest.id], subquest, occurredAt)]),
    ),
  };
}

function normalizeSubquestProgress(saved: SubquestProgress | undefined, definition: SubquestDefinition, occurredAt: number): SubquestProgress {
  const initial = createSubquestProgress(definition, occurredAt);
  const savedCurrentNodeId = saved?.current_node_id;
  return {
    ...initial,
    status: normalizeStatus(saved?.status),
    current_node_id: savedCurrentNodeId && definition.nodes.some((node) => node.id === savedCurrentNodeId) ? savedCurrentNodeId : definition.initial_node_id,
    updated_at: typeof saved?.updated_at === "number" ? saved.updated_at : occurredAt,
    completed_at: normalizeCompletedAt(saved, normalizeStatus(saved?.status)),
    todos: Object.fromEntries(definition.todos.map((todo) => [todo.id, normalizeTodoProgress(saved?.todos[todo.id], todo.id, occurredAt)])),
  };
}

function normalizeTodoProgress(saved: TodoProgress | undefined, id: string, occurredAt: number): TodoProgress {
  const status = normalizeStatus(saved?.status);
  return {
    id,
    status,
    updated_at: typeof saved?.updated_at === "number" ? saved.updated_at : occurredAt,
    completed_at: normalizeCompletedAt(saved, status),
  };
}

function normalizeStatus(status: unknown): QuestEntryStatus {
  return status === "completed" ? "completed" : "incomplete";
}

function normalizeCompletedAt(saved: { completed_at?: number | null } | undefined, status: QuestEntryStatus): number | null {
  return status === "completed" && typeof saved?.completed_at === "number" ? saved.completed_at : null;
}

function isQuestRuntimeState(value: unknown): value is QuestRuntimeState {
  return Boolean(value && typeof value === "object" && "quests" in value && "updated_quest_ids" in value);
}

function updateQuest(state: QuestRuntimeState, quest: QuestProgress, patch: Partial<QuestProgress>): QuestRuntimeState {
  const updatedQuest = { ...quest, ...patch };
  return {
    ...state,
    quests: {
      ...state.quests,
      [quest.id]: updatedQuest,
    },
    updated_quest_ids: markUpdatedQuest(state.updated_quest_ids, quest.id),
  };
}

function updateSubquest(state: QuestRuntimeState, quest: QuestProgress, subquest: SubquestProgress, patch: Partial<SubquestProgress>): QuestRuntimeState {
  const updatedSubquest = { ...subquest, ...patch };
  const updatedQuest = {
    ...quest,
    subquests: {
      ...quest.subquests,
      [subquest.id]: updatedSubquest,
    },
  };
  return updateQuestWithoutTimestamp(state, updatedQuest);
}

function updateTodo(state: QuestRuntimeState, quest: QuestProgress, subquest: SubquestProgress, todo: TodoProgress, patch: Partial<TodoProgress>): QuestRuntimeState {
  const updatedTodo = { ...todo, ...patch };
  const updatedSubquest = {
    ...subquest,
    updated_at: patch.updated_at ?? subquest.updated_at,
    todos: {
      ...subquest.todos,
      [todo.id]: updatedTodo,
    },
  };
  const updatedQuest = {
    ...quest,
    subquests: {
      ...quest.subquests,
      [subquest.id]: updatedSubquest,
    },
  };
  return updateQuestWithoutTimestamp(state, updatedQuest);
}

function updateQuestWithoutTimestamp(state: QuestRuntimeState, quest: QuestProgress): QuestRuntimeState {
  return {
    ...state,
    quests: {
      ...state.quests,
      [quest.id]: quest,
    },
    updated_quest_ids: markUpdatedQuest(state.updated_quest_ids, quest.id),
  };
}

function markUpdatedQuest(questIds: string[], questId: string): string[] {
  return [questId, ...questIds.filter((id) => id !== questId)];
}

function warn(state: QuestRuntimeState, message: string): ApplyQuestProgressResult {
  return { state, warnings: [message] };
}

function toQuestDetailView(definition: QuestDefinition, progress: QuestProgress, updatedQuestIds: Set<string>, contentIndex: number): QuestDetailView & { contentIndex: number } {
  return {
    id: definition.id,
    category: definition.category,
    title: definition.title,
    summary: definition.summary,
    status: progress.status,
    currentDescription: definition.nodes.find((node) => node.id === progress.current_node_id)?.description ?? missingCurrentDescription,
    updated: updatedQuestIds.has(definition.id),
    completedAt: progress.completed_at ?? null,
    description: definition.description,
    navigation: definition.navigation ?? [],
    subquests: definition.subquests.map((subquestDefinition) => toSubquestView(subquestDefinition, progress.subquests[subquestDefinition.id])),
    contentIndex,
  };
}

function toSubquestView(definition: SubquestDefinition, progress: SubquestProgress): SubquestView {
  return {
    id: definition.id,
    title: definition.title,
    summary: definition.summary,
    status: progress.status,
    currentDescription: definition.nodes.find((node) => node.id === progress.current_node_id)?.description ?? missingCurrentDescription,
    navigation: definition.navigation ?? [],
    todos: definition.todos.map((todoDefinition) => ({
      id: todoDefinition.id,
      title: todoDefinition.title,
      description: todoDefinition.description,
      status: progress.todos[todoDefinition.id]?.status ?? "incomplete",
      navigation: todoDefinition.navigation ?? [],
    })),
  };
}

function toQuestListItemView(item: QuestDetailView): QuestListItemView {
  return {
    id: item.id,
    category: item.category,
    title: item.title,
    summary: item.summary,
    status: item.status,
    currentDescription: item.currentDescription,
    updated: item.updated,
    completedAt: item.completedAt,
  };
}

function sortQuestItems<T extends QuestDetailView & { contentIndex: number }>(items: T[]): T[] {
  return [...items].sort((left, right) => {
    if (left.status !== right.status) {
      return left.status === "incomplete" ? -1 : 1;
    }
    if (left.category !== right.category) {
      return left.category === "main" ? -1 : 1;
    }
    if (left.updated !== right.updated) {
      return left.updated ? -1 : 1;
    }
    return left.contentIndex - right.contentIndex;
  });
}
