import { useState } from "react";
import { Modal, Panel, StatusTag } from "../components/Layout";

export type TimeMultiplier = 1 | 2 | 4 | 8;

const multipliers: TimeMultiplier[] = [1, 2, 4, 8];

interface DebugToolboxProps {
  timeMultiplier: TimeMultiplier;
  onSetTimeMultiplier: (value: TimeMultiplier) => void;
  onResetGame: () => void;
  onClose: () => void;
}

export function DebugToolbox({ timeMultiplier, onSetTimeMultiplier, onResetGame, onClose }: DebugToolboxProps) {
  const [confirmingReset, setConfirmingReset] = useState(false);

  function confirmReset() {
    onResetGame();
    setConfirmingReset(false);
  }

  return (
    <Modal title="Debug toolbox / 作弊菜单" onClose={onClose}>
      <div className="debug-toolbox">
        <Panel title="时间倍率">
          <p className="muted-text">仅用于验收。它不会伪装成正式玩法。</p>
          <div className="debug-multiplier-row" role="group" aria-label="时间倍率">
            {multipliers.map((value) => (
              <button
                type="button"
                key={value}
                className={value === timeMultiplier ? "primary-button" : "secondary-button"}
                onClick={() => onSetTimeMultiplier(value)}
              >
                {value}x
              </button>
            ))}
          </div>
          <p>
            当前倍率：<StatusTag tone="accent">{timeMultiplier}x</StatusTag>
          </p>
        </Panel>

        <Panel title="重置存档" tone="danger">
          <p>清空浏览器存档并回到初始状态。中控台不会替你后悔。</p>
          {confirmingReset ? (
            <div className="debug-confirm-row">
              <strong>确定要重置吗？</strong>
              <button type="button" className="primary-button" onClick={confirmReset}>
                确认重置
              </button>
              <button type="button" className="secondary-button" onClick={() => setConfirmingReset(false)}>
                取消
              </button>
            </div>
          ) : (
            <button type="button" className="secondary-button" onClick={() => setConfirmingReset(true)}>
              重置存档
            </button>
          )}
        </Panel>
      </div>
    </Modal>
  );
}
