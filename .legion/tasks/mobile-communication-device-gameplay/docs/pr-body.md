## Summary

- 将手机端扩展为 WeChat-like 通讯终端：展示消息 / 联系人 / 会话 / 紧急来电 / 结构化选项，并发送 `phone.choice.select` intent。
- PC 保持唯一权威：校验 phone intent 后复用中央 dispatcher 结算 RuntimeCall 与 survey/standby/stop，并保留 `player.call.choice` / `player.action.dispatch` 日志路径。
- 新增 mobile active/fallback 通讯模式：手机在线时控制中心显示状态卡并隐藏或弱化 PC 通讯台入口；fallback 后恢复 PC 通讯台。

## Tests

- PASS `cd packages/dual-device && node ../../common/scripts/install-run-rushx.js test`
- PASS `cd packages/dual-device && node ../../common/scripts/install-run-rushx.js lint`
- PASS `cd apps/mobile-client && node ../../common/scripts/install-run-rushx.js test`
- PASS `cd apps/mobile-client && node ../../common/scripts/install-run-rushx.js lint`
- PASS `cd apps/pc-client && node ../../common/scripts/install-run-rushx.js test`（最终 46 files / 423 tests）
- PASS `cd apps/pc-client && node ../../common/scripts/install-run-rushx.js lint`
- PASS `npm run lint`
- PASS `npm run test`
- PASS `npm run test:e2e`
- PASS `npm run build`
- PASS `git diff --check`
- Not run: `npm run validate:content`；本 PR 未修改 `content/` 或 schema。

## Review Notes

- 请重点 review phone message 信任边界：`roomId`、`phoneTerminalId`、正向单调 `sequence` 校验必须先于 heartbeat/fallback 状态更新和 intent dispatch。
- 请重点 review RuntimeCall crew 解析：phone payload 与 PC 权威 `RuntimeCall.crew_id` 不匹配时应拒绝。
- 移动仍不在手机端实现；移动流程继续走 PC 通话 / 地图候选 / 通讯确认。
- 内容文件未改动。

## Legion Evidence

- Plan: `.legion/tasks/mobile-communication-device-gameplay/plan.md`
- RFC: `.legion/tasks/mobile-communication-device-gameplay/docs/rfc.md`
- RFC review: `.legion/tasks/mobile-communication-device-gameplay/docs/review-rfc.md` — PASS
- Test report: `.legion/tasks/mobile-communication-device-gameplay/docs/test-report.md` — PASS
- Change review: `.legion/tasks/mobile-communication-device-gameplay/docs/review-change.md` — PASS
- Walkthrough: `.legion/tasks/mobile-communication-device-gameplay/docs/report-walkthrough.md`
