import { describe, expect, it } from "vitest";
import type { QuestDefinition } from "./content/contentData";
import {
  applyQuestProgress,
  buildQuestSidebarView,
  createInitialQuestState,
  normalizeQuestState,
  type QuestRuntimeState,
} from "./questSystem";

const questDefinitions: QuestDefinition[] = [
  {
    id: "main_quest",
    category: "main",
    title: "Main Quest",
    summary: "Main summary",
    description: "Main description",
    initial_node_id: "start",
    completed_node_id: "main_complete",
    nodes: [
      { id: "start", description: "Start description" },
      { id: "changed", description: "Changed description" },
      {
        id: "main_complete",
        type: "completed",
        title: "Main quest complete",
        summary: "The main quest has been resolved.",
        outcomes: ["The crash site is stable."],
      },
    ],
    navigation: [{ type: "page", label: "Station", page: "station" }],
    todos: [
      { id: "quest_todo", title: "Quest Todo" },
      { id: "future_quest_todo", title: "Future Quest Todo", visible_after_node: "changed" },
    ],
    subquests: [
      {
        id: "main_subquest",
        title: "Main Subquest",
        summary: "Subquest summary",
        initial_node_id: "sub_start",
        nodes: [
          { id: "sub_start", description: "Sub start description" },
          { id: "sub_changed", description: "Sub changed description" },
        ],
        navigation: [{ type: "crew", label: "Mike", crew_id: "mike" }],
        todos: [
          {
            id: "main_todo",
            title: "Main Todo",
            description: "Todo description",
            navigation: [{ type: "tile", label: "Crash Site", tile_id: "129-129" }],
          },
          {
            id: "second_todo",
            title: "Second Todo",
            visible_after_node: "sub_changed",
          },
        ],
      },
    ],
  },
  {
    id: "side_quest",
    category: "side",
    title: "Side Quest",
    summary: "Side summary",
    description: "Side description",
    initial_node_id: "side_start",
    nodes: [{ id: "side_start", description: "Side start description" }],
    subquests: [
      {
        id: "side_subquest",
        title: "Side Subquest",
        summary: "Side subquest summary",
        initial_node_id: "side_sub_start",
        nodes: [{ id: "side_sub_start", description: "Side sub start description" }],
        todos: [{ id: "side_todo", title: "Side Todo" }],
      },
    ],
  },
];

describe("questSystem", () => {
  it("creates incomplete runtime state for every quest, subquest, and todo", () => {
    const state = createInitialQuestState(questDefinitions, 10);

    expect(state.updated_quest_ids).toEqual([]);
    expect(state.quests.main_quest).toMatchObject({
      id: "main_quest",
      status: "incomplete",
      current_node_id: "start",
      updated_at: 10,
      completed_at: null,
    });
    expect(state.quests.main_quest.subquests.main_subquest).toMatchObject({
      id: "main_subquest",
      status: "incomplete",
      current_node_id: "sub_start",
      updated_at: 10,
      completed_at: null,
    });
    expect(state.quests.main_quest.subquests.main_subquest.todos.main_todo).toEqual({
      id: "main_todo",
      status: "incomplete",
      updated_at: 10,
      completed_at: null,
    });
    expect(state.quests.main_quest.todos.quest_todo).toEqual({
      id: "quest_todo",
      status: "incomplete",
      updated_at: 10,
      completed_at: null,
    });
  });

  it("normalizes missing entries and invalid current nodes without changing existing completions", () => {
    const saved: QuestRuntimeState = {
      updated_quest_ids: ["main_quest", "deleted_quest"],
      quests: {
        main_quest: {
          id: "main_quest",
          status: "completed",
          current_node_id: "deleted_node",
          updated_at: 20,
          completed_at: 21,
          todos: {
            quest_todo: { id: "quest_todo", status: "completed", updated_at: 18, completed_at: 19 },
          },
          subquests: {
            main_subquest: {
              id: "main_subquest",
              status: "completed",
              current_node_id: "deleted_sub_node",
              updated_at: 22,
              completed_at: 23,
              todos: {
                main_todo: { id: "main_todo", status: "completed", updated_at: 24, completed_at: 25 },
              },
            },
          },
        },
      },
    };

    const state = normalizeQuestState(saved, questDefinitions, 99);

    expect(Object.keys(state.quests)).toEqual(["main_quest", "side_quest"]);
    expect(state.updated_quest_ids).toEqual(["main_quest"]);
    expect(state.quests.main_quest).toMatchObject({
      status: "completed",
      current_node_id: "start",
      updated_at: 20,
      completed_at: 21,
    });
    expect(state.quests.main_quest.subquests.main_subquest).toMatchObject({
      status: "completed",
      current_node_id: "sub_start",
      updated_at: 22,
      completed_at: 23,
    });
    expect(state.quests.main_quest.subquests.main_subquest.todos.second_todo).toEqual({
      id: "second_todo",
      status: "incomplete",
      updated_at: 99,
      completed_at: null,
    });
    expect(state.quests.main_quest.todos.future_quest_todo).toEqual({
      id: "future_quest_todo",
      status: "incomplete",
      updated_at: 99,
      completed_at: null,
    });
    expect(state.quests.side_quest.status).toBe("incomplete");
  });

  it("supports quest-level todos without requiring subquests", () => {
    const flatDefinitions: QuestDefinition[] = [
      {
        id: "flat_quest",
        category: "main",
        title: "Flat Quest",
        summary: "Flat summary",
        description: "Flat description",
        initial_node_id: "survey",
        nodes: [
          { id: "survey", description: "Survey first" },
          { id: "repair", description: "Repair now" },
        ],
        todos: [
          { id: "survey_crash_site", title: "Survey crash site" },
          { id: "repair_generator", title: "Repair generator", visible_after_node: "repair" },
        ],
      },
    ];
    const initial = createInitialQuestState(flatDefinitions, 0);

    const surveyDone = applyQuestProgress({
      state: initial,
      definitions: flatDefinitions,
      operation: "complete_todo",
      quest_id: "flat_quest",
      todo_id: "survey_crash_site",
      occurred_at: 10,
    }).state;
    const repairShown = applyQuestProgress({
      state: surveyDone,
      definitions: flatDefinitions,
      operation: "set_quest_node",
      quest_id: "flat_quest",
      node_id: "repair",
      occurred_at: 11,
    }).state;

    const initialView = buildQuestSidebarView({ state: initial, definitions: flatDefinitions });
    const repairView = buildQuestSidebarView({ state: repairShown, definitions: flatDefinitions });
    expect(initial.quests.flat_quest.subquests).toEqual({});
    expect(initialView.selectedQuest?.todos.map((todo) => todo.id)).toEqual(["survey_crash_site"]);
    expect(repairShown.quests.flat_quest.todos.survey_crash_site.status).toBe("completed");
    expect(repairView.selectedQuest?.todos.map((todo) => todo.id)).toEqual(["survey_crash_site", "repair_generator"]);
    expect(repairView.selectedQuest?.subquests).toEqual([]);
  });

  it("exposes completion result only after a quest is completed", () => {
    const initial = createInitialQuestState(questDefinitions, 0);

    const incompleteView = buildQuestSidebarView({ state: initial, definitions: questDefinitions });
    const completed = applyQuestProgress({
      state: initial,
      definitions: questDefinitions,
      operation: "complete_quest",
      quest_id: "main_quest",
      occurred_at: 50,
    }).state;
    const completedView = buildQuestSidebarView({ state: completed, definitions: questDefinitions, selectedQuestId: "main_quest" });

    expect(incompleteView.selectedQuest?.completionResult).toBeUndefined();
    expect(completedView.selectedQuest?.completionResult).toEqual({
      title: "Main quest complete",
      summary: "The main quest has been resolved.",
      outcomes: ["The crash site is stable."],
    });
    expect(completed.quests.main_quest).not.toHaveProperty("completion_result");
  });

  it("applies explicit completion without automatically completing parent entries", () => {
    const initial = createInitialQuestState(questDefinitions, 0);
    const todoResult = applyQuestProgress({
      state: initial,
      definitions: questDefinitions,
      operation: "complete_todo",
      quest_id: "main_quest",
      subquest_id: "main_subquest",
      todo_id: "main_todo",
      occurred_at: 30,
    });
    const subquestResult = applyQuestProgress({
      state: todoResult.state,
      definitions: questDefinitions,
      operation: "complete_subquest",
      quest_id: "main_quest",
      subquest_id: "main_subquest",
      occurred_at: 40,
    });
    const questResult = applyQuestProgress({
      state: subquestResult.state,
      definitions: questDefinitions,
      operation: "complete_quest",
      quest_id: "main_quest",
      occurred_at: 50,
    });

    expect(todoResult.warnings).toEqual([]);
    expect(todoResult.state.quests.main_quest.subquests.main_subquest.todos.main_todo).toMatchObject({
      status: "completed",
      updated_at: 30,
      completed_at: 30,
    });
    expect(todoResult.state.quests.main_quest.subquests.main_subquest.status).toBe("incomplete");
    expect(todoResult.state.quests.main_quest.status).toBe("incomplete");
    expect(subquestResult.state.quests.main_quest.subquests.main_subquest.status).toBe("completed");
    expect(subquestResult.state.quests.main_quest.status).toBe("incomplete");
    expect(questResult.state.quests.main_quest).toMatchObject({
      status: "completed",
      updated_at: 50,
      completed_at: 50,
    });
  });

  it("keeps repeated completions and same-node updates idempotent unless explicitly marked updated", () => {
    const completed = applyQuestProgress({
      state: createInitialQuestState(questDefinitions, 0),
      definitions: questDefinitions,
      operation: "complete_todo",
      quest_id: "main_quest",
      subquest_id: "main_subquest",
      todo_id: "main_todo",
      occurred_at: 30,
    }).state;

    const repeated = applyQuestProgress({
      state: completed,
      definitions: questDefinitions,
      operation: "complete_todo",
      quest_id: "main_quest",
      subquest_id: "main_subquest",
      todo_id: "main_todo",
      occurred_at: 60,
    }).state;
    const sameNode = applyQuestProgress({
      state: repeated,
      definitions: questDefinitions,
      operation: "set_quest_node",
      quest_id: "main_quest",
      node_id: "start",
      occurred_at: 70,
    }).state;
    const marked = applyQuestProgress({
      state: sameNode,
      definitions: questDefinitions,
      operation: "mark_updated",
      quest_id: "main_quest",
      occurred_at: 80,
    }).state;

    expect(repeated.quests.main_quest.subquests.main_subquest.todos.main_todo).toMatchObject({
      updated_at: 30,
      completed_at: 30,
    });
    expect(sameNode.quests.main_quest.updated_at).toBe(0);
    expect(marked.quests.main_quest.updated_at).toBe(80);
    expect(marked.updated_quest_ids).toEqual(["main_quest"]);
  });

  it("switches quest and subquest current node descriptions and warns for invalid IDs", () => {
    const initial = createInitialQuestState(questDefinitions, 0);
    const questNodeResult = applyQuestProgress({
      state: initial,
      definitions: questDefinitions,
      operation: "set_quest_node",
      quest_id: "main_quest",
      node_id: "changed",
      occurred_at: 10,
    });
    const subquestNodeResult = applyQuestProgress({
      state: questNodeResult.state,
      definitions: questDefinitions,
      operation: "set_subquest_node",
      quest_id: "main_quest",
      subquest_id: "main_subquest",
      node_id: "sub_changed",
      occurred_at: 20,
    });
    const invalidNodeResult = applyQuestProgress({
      state: subquestNodeResult.state,
      definitions: questDefinitions,
      operation: "set_quest_node",
      quest_id: "main_quest",
      node_id: "missing_node",
      occurred_at: 30,
    });
    const invalidQuestResult = applyQuestProgress({
      state: invalidNodeResult.state,
      definitions: questDefinitions,
      operation: "mark_updated",
      quest_id: "missing_quest",
      occurred_at: 40,
    });
    const view = buildQuestSidebarView({ state: subquestNodeResult.state, definitions: questDefinitions });

    expect(subquestNodeResult.state.quests.main_quest).toMatchObject({ current_node_id: "changed", updated_at: 10 });
    expect(subquestNodeResult.state.quests.main_quest.subquests.main_subquest).toMatchObject({
      current_node_id: "sub_changed",
      updated_at: 20,
    });
    expect(view.selectedQuest?.currentDescription).toBe("Changed description");
    expect(view.selectedQuest?.subquests[0]?.currentDescription).toBe("Sub changed description");
    expect(invalidNodeResult.warnings).toEqual(["Quest node missing_node does not exist in quest main_quest."]);
    expect(invalidNodeResult.state).toBe(subquestNodeResult.state);
    expect(invalidQuestResult.warnings).toEqual(["Quest missing_quest does not exist."]);
  });

  it("hides future todos until the subquest reaches their visible node", () => {
    const initial = createInitialQuestState(questDefinitions, 0);

    const initialView = buildQuestSidebarView({ state: initial, definitions: questDefinitions });
    expect(initialView.selectedQuest?.subquests[0].todos.map((todo) => todo.id)).toEqual(["main_todo"]);

    const advanced = applyQuestProgress({
      state: initial,
      definitions: questDefinitions,
      operation: "set_subquest_node",
      quest_id: "main_quest",
      subquest_id: "main_subquest",
      node_id: "sub_changed",
      occurred_at: 20,
    }).state;

    const advancedView = buildQuestSidebarView({ state: advanced, definitions: questDefinitions });
    expect(advancedView.selectedQuest?.subquests[0].todos.map((todo) => todo.id)).toEqual(["main_todo", "second_todo"]);
  });

  it("builds filtered view models without changing runtime state", () => {
    const state = applyQuestProgress({
      state: createInitialQuestState(questDefinitions, 0),
      definitions: questDefinitions,
      operation: "complete_quest",
      quest_id: "side_quest",
      occurred_at: 20,
    }).state;

    const allView = buildQuestSidebarView({ state, definitions: questDefinitions });
    const incompleteMainView = buildQuestSidebarView({
      state,
      definitions: questDefinitions,
      statusFilter: "incomplete",
      categoryFilter: "main",
    });
    const completedSideView = buildQuestSidebarView({
      state,
      definitions: questDefinitions,
      statusFilter: "completed",
      categoryFilter: "side",
      selectedQuestId: "side_quest",
    });

    expect(allView.collapsedSummary).toEqual({
      incompleteCount: 1,
      mainIncompleteCount: 1,
      recentlyUpdatedTitles: ["Side Quest"],
    });
    expect(allView.list.map((quest) => quest.id)).toEqual(["main_quest", "side_quest"]);
    expect(allView.list.find((quest) => quest.id === "side_quest")?.updated).toBe(true);
    expect(incompleteMainView.list.map((quest) => quest.id)).toEqual(["main_quest"]);
    expect(completedSideView.list.map((quest) => quest.id)).toEqual(["side_quest"]);
    expect(completedSideView.selectedQuest?.id).toBe("side_quest");
    expect(state.quests.side_quest.status).toBe("completed");
  });
});
