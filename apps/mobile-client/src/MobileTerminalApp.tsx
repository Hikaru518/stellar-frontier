import { paidMainlandHybridPlan, selectPreferredTransport } from "@stellar-frontier/protocol";

export function MobileTerminalApp() {
  const selected = selectPreferredTransport([
    { kind: "lan-websocket", health: "degraded", reason: "等待 PC 本地候选地址。" },
    { kind: "mainland-relay", health: "healthy", rttMs: 60 },
  ]);

  return (
    <main className="mobile-terminal-shell">
      <p className="eyebrow">Stellar Frontier / 私人通讯终端</p>
      <h1>等待配对</h1>
      <section className="terminal-card">
        <h2>推荐链路</h2>
        <p>{paidMainlandHybridPlan.summary}</p>
        <dl>
          <div>
            <dt>当前首选</dt>
            <dd>{selected.selected}</dd>
          </div>
          <div>
            <dt>公网兜底</dt>
            <dd>{selected.fallback}</dd>
          </div>
        </dl>
      </section>
      <section className="terminal-card terminal-card-muted">
        <h2>手机端职责</h2>
        <p>本端只显示 PC 授权的私密通讯，并发送已读、接听、选择等 typed events。游戏结算仍由 PC 完成。</p>
      </section>
    </main>
  );
}
