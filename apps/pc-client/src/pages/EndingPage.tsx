import { ConsoleShell, Panel } from "../components/Layout";

interface EndingPageProps {
  completedAtLabel: string;
  gameTimeLabel: string;
  onResetGame: () => void;
  onReturnControl: () => void;
}

export function EndingPage({ completedAtLabel, gameTimeLabel, onResetGame, onReturnControl }: EndingPageProps) {
  return (
    <ConsoleShell title="返航完成" subtitle="折跃仓启动，小队已脱离前沿星域。" gameTimeLabel={gameTimeLabel}>
      <Panel title="任务总结" tone="success">
        <p>折跃仓完成最后校准。可通讯且可行动的小队成员已集合返航，控制中心保留本次行动记录。</p>
        <p>完成时间：{completedAtLabel}</p>
      </Panel>

      <section className="page-actions" aria-label="结局操作">
        <button type="button" onClick={onReturnControl}>
          回控制中心查看记录
        </button>
        <button type="button" className="secondary" onClick={onResetGame}>
          重置游戏
        </button>
      </section>
    </ConsoleShell>
  );
}
