# Test Report: 手机通讯终端融入 Gameplay

## 验证目标

验证本次实现是否满足 RFC 的核心风险面：dual-device payload guard、mobile UI、PC dispatcher / logger、PC fallback 页面流，以及跨包 TypeScript / unit / e2e / build。

## 执行环境

- Worktree: `.worktrees/mobile-communication-device-gameplay`
- Branch: `legion/mobile-communication-device-gameplay-comm-terminal`
- Base: `origin/main` (`61cff61`)
- Node: `24.13.0`

## 预备步骤

- `npm run rush:update` — PASS
  - 原因: 新 worktree 初始没有 package symlink，首次测试找不到 `vitest` / `tsc`。
- `cd apps/pc-client && node ../../common/scripts/install-run-rushx.js install:browsers` — PASS
  - 原因: 首次 e2e 缺少 Playwright Chromium。

## Targeted Checks

- `cd packages/dual-device && node ../../common/scripts/install-run-rushx.js test` — PASS
  - 结果: 2 files / 11 tests passed。
- `cd packages/dual-device && node ../../common/scripts/install-run-rushx.js lint` — PASS
- `cd apps/mobile-client && node ../../common/scripts/install-run-rushx.js test` — PASS
  - 结果: 2 files / 3 tests passed。
- `cd apps/mobile-client && node ../../common/scripts/install-run-rushx.js lint` — PASS
- `cd apps/pc-client && node ../../common/scripts/install-run-rushx.js test` — PASS
  - 首轮修复后结果: 46 files / 421 tests passed。
  - trust-boundary 修复后结果: 46 files / 422 tests passed。
- `cd apps/pc-client && node ../../common/scripts/install-run-rushx.js lint` — PASS
- `git diff --check` — PASS

## Full Checks

- `npm run lint` — PASS
  - 结果: 4 Rush projects passed。
- `npm run test` — PASS
  - 结果: 4 Rush projects passed。
- `npm run test:e2e` — PASS
  - 结果: PC client e2e passed after installing Playwright Chromium.
- `npm run build` — PASS
  - 结果: 4 Rush projects passed。

## 修复过的验证失败

- 初始 package tests 失败为环境问题：worktree 未运行 Rush update，`vitest` / `tsc` 不可用。已通过 `npm run rush:update` 解决。
- mobile test 曾因文本被冒号拆分和 `enableWebRTC=true` 出现多处而失败。已调整断言为 regex / all matches。
- PC static logger test 曾因 helper 函数重排导致 `universal:move` 源码切片过宽而失败。已收窄断言到 move 分支自身。
- PC lint 曾发现 RuntimeCall 字段误用：使用了不存在的 `options` / `speaker` 字段。已改为 `available_options` / `speaker_crew_id`。
- e2e 首次失败为 Playwright browser missing。已安装 Chromium 后重跑通过。
- `review-change` 首次 FAIL，原因是 PC 只按 `roomId` 接受 phone-origin message，未校验 `clientId` 与单调 `sequence`。已新增 `validatePhoneMessageEnvelope`，要求 `roomId`、`phoneTerminalId` 和递增 `sequence` 同时通过后才更新 heartbeat/fallback 或派发 intent，并补充伪造 client / replay sequence 单测。
- `review-change` 二次 FAIL，原因是生产代码仍注册 `stellar-phone-choice-select` DOM event 作为测试后门，绕过 envelope 校验直达 `handlePhoneChoiceSelect`。已移除该生产监听，并把对应测试改为断言 DOM event 不能驱动 PC 权威行动。
- `review-change` 三次 FAIL，原因是 runtime-call phone intent 仍信任 payload `crewId` 写入 `player.call.choice`，未核对权威 `RuntimeCall.crew_id`。已新增 `resolvePhoneRuntimeCallCrewId`，当 payload crew 与权威通话 crew 不匹配时拒绝；payload 为 `null` 时由 PC 权威 call 派生 crewId。

## 复审前重跑验证

- `cd apps/pc-client && node ../../common/scripts/install-run-rushx.js lint` — PASS
- `cd apps/pc-client && node ../../common/scripts/install-run-rushx.js test` — PASS
  - 结果: 46 files / 422 tests passed。
- `npm run lint` — PASS
- `npm run test` — PASS
- `npm run test:e2e` — PASS
- `npm run build` — PASS
- `git diff --check` — PASS

## DOM 后门移除后重跑验证

- `cd apps/pc-client && node ../../common/scripts/install-run-rushx.js lint` — PASS
- `cd apps/pc-client && node ../../common/scripts/install-run-rushx.js test` — PASS
  - 结果: 46 files / 422 tests passed。
- `npm run lint` — PASS
- `npm run test` — PASS
- `npm run test:e2e` — PASS
- `npm run build` — PASS
- `git diff --check` — PASS

## RuntimeCall crew 校验后重跑验证

- `cd apps/pc-client && node ../../common/scripts/install-run-rushx.js lint` — PASS
- `cd apps/pc-client && node ../../common/scripts/install-run-rushx.js test` — PASS
  - 结果: 46 files / 423 tests passed。
- `npm run lint` — PASS
- `npm run test` — PASS
- `npm run test:e2e` — PASS
- `npm run build` — PASS
- `git diff --check` — PASS

## 未执行 / 不适用

- `npm run validate:content` 未执行；本实现未修改 `content/` 或 schema。

## 结论

PASS。实现通过 targeted checks、根级 lint/test/e2e/build，验证面覆盖本次跨端通讯、PC 页面流和构建风险。
