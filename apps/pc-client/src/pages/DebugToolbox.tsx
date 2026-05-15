import { useState } from "react";
import { Modal, Panel, StatusTag } from "../components/Layout";
import {
  CREW_MOVE_SPEED_MULTIPLIER_STEP,
  MAX_CREW_MOVE_SPEED_MULTIPLIER,
  MIN_CREW_MOVE_SPEED_MULTIPLIER,
  normalizeCrewMoveSpeedMultiplier,
} from "../crewSystem";
import { LogPanel } from "./DebugToolbox/LogPanel";

export type TimeMultiplier = 1 | 2 | 4 | 8;

const multipliers: TimeMultiplier[] = [1, 2, 4, 8];
const crewMoveSpeedMultipliers = [0.25, 0.5, 1, 2, 4, 8, 16];

interface DebugToolboxProps {
  timeMultiplier: TimeMultiplier;
  crewMoveSpeedMultiplier: number;
  onSetTimeMultiplier: (value: TimeMultiplier) => void;
  onSetCrewMoveSpeedMultiplier: (value: number) => void;
  onResetGame: () => void;
  onClose: () => void;
}

export function DebugToolbox({
  timeMultiplier,
  crewMoveSpeedMultiplier,
  onSetTimeMultiplier,
  onSetCrewMoveSpeedMultiplier,
  onResetGame,
  onClose,
}: DebugToolboxProps) {
  const [confirmingReset, setConfirmingReset] = useState(false);
  const normalizedCrewMoveSpeedMultiplier = normalizeCrewMoveSpeedMultiplier(crewMoveSpeedMultiplier);

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

        <Panel title="队员移动速度">
          <p className="muted-text">全局 Debug 设置，只影响移动行动。2x 表示移动耗时减半。</p>
          <div className="debug-multiplier-row" role="group" aria-label="队员移动速度">
            {crewMoveSpeedMultipliers.map((value) => (
              <button
                type="button"
                key={value}
                className={value === normalizedCrewMoveSpeedMultiplier ? "primary-button" : "secondary-button"}
                onClick={() => onSetCrewMoveSpeedMultiplier(value)}
              >
                {value}x
              </button>
            ))}
          </div>
          <label className="debug-number-field">
            <span>自定义倍率</span>
            <input
              type="number"
              min={MIN_CREW_MOVE_SPEED_MULTIPLIER}
              max={MAX_CREW_MOVE_SPEED_MULTIPLIER}
              step={CREW_MOVE_SPEED_MULTIPLIER_STEP}
              value={normalizedCrewMoveSpeedMultiplier}
              aria-label="自定义队员移动速度"
              onChange={(event) => onSetCrewMoveSpeedMultiplier(Number(event.currentTarget.value))}
            />
          </label>
          <p>
            当前移动速度：<StatusTag tone="accent">{normalizedCrewMoveSpeedMultiplier}x</StatusTag>
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

        <LogPanel />
      </div>
    </Modal>
  );
}
