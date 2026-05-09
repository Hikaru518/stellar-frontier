import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { QuestNavigationEntry } from "../content/contentData";
import type { QuestDetailView, QuestSidebarView } from "../questSystem";
import { QuestSidebar } from "./QuestSidebar";

const stationNavigation: QuestNavigationEntry = { type: "page", label: "打开通讯台", page: "station" };
const mapNavigation: QuestNavigationEntry = { type: "tile", label: "定位坠毁点", tile_id: "4-4" };
const crewNavigation: QuestNavigationEntry = { type: "crew", label: "联系 Mike", crew_id: "mike" };

const quests: QuestDetailView[] = [
  {
    id: "main_quest",
    category: "main",
    title: "重组幸存者",
    summary: "确认坠毁后的生还者状态。",
    status: "incomplete",
    currentDescription: "Mike 已回到通讯范围。",
    updated: true,
    completedAt: null,
    description: "建立最小通讯链路，确认队员与坠毁点状态。",
    navigation: [stationNavigation],
    subquests: [
      {
        id: "contact_mike",
        title: "建立联络",
        summary: "先让 Mike 报告周边情况。",
        status: "incomplete",
        currentDescription: "需要一次通话确认。",
        navigation: [crewNavigation],
        todos: [
          {
            id: "call_mike",
            title: "呼叫 Mike",
            description: "在通讯台发起通话。",
            status: "completed",
            navigation: [crewNavigation],
          },
          {
            id: "survey_crash",
            title: "确认坠毁点",
            description: "查看坠毁点地图标记。",
            status: "incomplete",
            navigation: [mapNavigation],
          },
        ],
      },
    ],
  },
  {
    id: "side_quest",
    category: "side",
    title: "南侧通道测绘",
    summary: "记录南侧通道的地形。",
    status: "completed",
    currentDescription: "Current quest intel is missing.",
    updated: false,
    completedAt: 90,
    description: "这是一个次要任务。",
    navigation: [mapNavigation],
    subquests: [
      {
        id: "map_passage",
        title: "测绘通道",
        summary: "把通道标在地图上。",
        status: "completed",
        currentDescription: "",
        navigation: [],
        todos: [
          {
            id: "finish_map",
            title: "提交测绘记录",
            status: "completed",
            navigation: [],
          },
        ],
      },
    ],
  },
];

function makeView(sourceQuests: QuestDetailView[] = quests): QuestSidebarView {
  return {
    collapsedSummary: {
      incompleteCount: sourceQuests.filter((quest) => quest.status === "incomplete").length,
      mainIncompleteCount: sourceQuests.filter((quest) => quest.category === "main" && quest.status === "incomplete").length,
      recentlyUpdatedTitles: sourceQuests.filter((quest) => quest.updated).map((quest) => quest.title),
    },
    list: sourceQuests,
    selectedQuest: sourceQuests[0],
    emptyText: sourceQuests.length === 0 ? "No registered quests." : "No quests match the current filters.",
  };
}

describe("QuestSidebar", () => {
  it("renders collapsed counts, main count, and recent update summary", () => {
    render(<QuestSidebar view={makeView()} quests={quests} initiallyCollapsed onNavigate={vi.fn()} />);

    expect(screen.getByText("未完成 1")).toBeInTheDocument();
    expect(screen.getByText("主要 1")).toBeInTheDocument();
    expect(screen.getByText("重组幸存者")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "展开任务" })).toBeInTheDocument();
  });

  it("renders expanded filters, quest list, detail, three-level structure, and updated mark", () => {
    render(<QuestSidebar view={makeView()} quests={quests} onNavigate={vi.fn()} />);

    expect(screen.getByRole("group", { name: "完成状态" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "任务类型" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /重组幸存者/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /南侧通道测绘/ })).toBeInTheDocument();
    expect(screen.getByText("updated")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "重组幸存者" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "建立联络" })).toBeInTheDocument();
    expect(screen.getByText("呼叫 Mike")).toBeInTheDocument();
    expect(screen.queryByText("main_quest")).not.toBeInTheDocument();
  });

  it("filters by main or side category without calling navigation", async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(<QuestSidebar view={makeView()} quests={quests} onNavigate={onNavigate} />);

    await user.click(within(screen.getByRole("group", { name: "任务类型" })).getByRole("button", { name: "次要" }));
    expect(screen.queryByRole("button", { name: /重组幸存者/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /南侧通道测绘/ })).toBeInTheDocument();

    await user.click(within(screen.getByRole("group", { name: "任务类型" })).getByRole("button", { name: "主要" }));
    expect(screen.getByRole("button", { name: /重组幸存者/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /南侧通道测绘/ })).not.toBeInTheDocument();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("filters by incomplete or completed status without calling navigation", async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(<QuestSidebar view={makeView()} quests={quests} onNavigate={onNavigate} />);

    await user.click(within(screen.getByRole("group", { name: "完成状态" })).getByRole("button", { name: "已完成" }));
    expect(screen.queryByRole("button", { name: /重组幸存者/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /南侧通道测绘/ })).toBeInTheDocument();

    await user.click(within(screen.getByRole("group", { name: "完成状态" })).getByRole("button", { name: "未完成" }));
    expect(screen.getByRole("button", { name: /重组幸存者/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /南侧通道测绘/ })).not.toBeInTheDocument();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("marks completed todos with completed styling", () => {
    render(<QuestSidebar view={makeView()} quests={quests} onNavigate={vi.fn()} />);

    expect(screen.getByText("呼叫 Mike").closest("li")).toHaveClass("quest-todo-completed");
    expect(screen.getByText("确认坠毁点").closest("li")).toHaveClass("quest-todo-incomplete");
  });

  it("calls onNavigate from navigation buttons only", async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(<QuestSidebar view={makeView()} quests={quests} onNavigate={onNavigate} />);

    await user.click(screen.getAllByRole("button", { name: "联系 Mike" })[0]);

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith(crewNavigation);
  });

  it("shows explicit empty text for no quests and filtered empty results", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<QuestSidebar view={makeView([])} quests={[]} onNavigate={vi.fn()} />);

    expect(screen.getByText("暂无已登记任务。")).toBeInTheDocument();

    rerender(<QuestSidebar view={makeView([quests[0]])} quests={[quests[0]]} onNavigate={vi.fn()} />);
    await user.click(within(screen.getByRole("group", { name: "完成状态" })).getByRole("button", { name: "已完成" }));
    expect(screen.getByText("当前筛选下没有任务。")).toBeInTheDocument();
  });

  it("falls back when current node descriptions are missing", async () => {
    const user = userEvent.setup();
    render(<QuestSidebar view={makeView()} quests={quests} onNavigate={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /南侧通道测绘/ }));

    expect(screen.getAllByText("当前任务情报缺失。").length).toBeGreaterThan(0);
  });
});
