---
topic: map-system-phaser4
date: 2026-04-30
status: draft
source:
  initial: docs/plans/2026-04-30-18-46/initial.md
  research: docs/plans/2026-04-30-18-46/research.md
  interview: docs/plans/2026-04-30-18-46/map-system-interview.md
---

## 1. 一句话总结

为《Stellar Frontier》PC 客户端的卫星雷达地图页面，实现由 Phaser 4 驱动的可缩放、可拖拽 2D 地图画布，替换现有纯 CSS 网格，为玩家提供视觉丰富的态势感知界面，同时保持地图只读、指令必须经通讯台发出的既有约束。

---

## 2. 背景与问题（As-is）

- **当前做法**：`MapPage.tsx` 使用 HTML `<section>` + `<button>` 格子实现 8×8 网格地图，以 CSS 类和文字表达队员位置、地形、可见状态。
- **痛点**：无缩放/平移能力；地形视觉表达力弱（纯色块）；队员移动无插值动画；无法渲染贴图细节；整体不符合"卫星雷达"视觉定位。
- **为什么现在做**：玩法层（寻路、可见窗口、队员行动）已完整落地，数据结构稳定，是进入视觉表现层的合适时机；Demo 分支已在另一分支验证了 Phaser 核心概念，可复用的设计决策已提炼至 `initial.md`。

---

## 3. 目标（Goals）

1. 在 `MapPage.tsx` 内集成 Phaser 4 Canvas，支持 4 级离散 Zoom（0.35 / 0.70 / 1.50 / 3.00）+ 滚轮以鼠标为中心缩放。
2. 支持右键拖拽摄像机平移，WASD 键盘平移。
3. 渲染贴图（MVP 阶段使用占位 PNG，基础设施就绪），支持 LOD 分层显示（细节层 / 网格线 / 区域标签按 zoom 切换）。
4. 以 250ms/格 Tween 展示队员实时移动动画，绘制橙色已走轨迹线和蓝色待行路线预览。
5. Hover 500ms 后显示 tooltip（地形名 + 区域名 + 坐标），左键点击更新右侧详情面板。
6. 双层渲染架构：Phaser 独占鼠标输入，HTML 语义层仅处理键盘 a11y，`pointer-events: none`。
7. 提供 DOM data attributes + `window.__mapTestState` 供 e2e 测试桥接。

---

## 4. 非目标（Non-goals）

- 地图直接下达移动/调查指令（指令必须经通讯台 → 通话发出）。
- 编辑器模式（`editorMode: true`）的拖拽绘制功能（接口预留，本轮不实现）。
- 贴图动画（水面波纹、旗帜飘动）。
- 迷雾效果（未探索区域蒙版揭示动画）。
- 区域 hover 联动高亮同区域格子。
- 多人物碰撞避让优化（当前 4 槽偏移已够用）。
- 移动指令选点逻辑变更（`onSelectMoveTarget` 接口保持不变）。

---

## 5. 目标用户与使用场景

### 5.1 用户画像

- **P1 — 指挥官（唯一玩家）**：通过 PC 浏览器掌控三名队员行动；需要在地图页面快速感知队员位置、地形危险度、已探索边界；不会在地图上直接下令，但需要地图提供足够信息后再切换到通讯台决策。

### 5.2 典型场景（Top 3）

- **S1 — 全局态势浏览**：玩家打开地图，滚轮缩出至"全局"视角（zoom 0.35），一眼看清所有已探索区域、队员分布、危险格。
- **S2 — 精确选点**：玩家看到某格有未探索地形，滚轮放大至"地块"视角（zoom 1.5），悬停 500ms 查看 tooltip（地形 + 区域名 + 坐标），左键选中，切换到通讯台发出移动指令。
- **S3 — 实时追踪**：队员正在移动中，玩家切回地图，可看到队员标记以 Tween 平滑插值移动，橙色轨迹线记录已走路径，蓝色线预览剩余路线。

---

## 6. 用户旅程（To-be）

1. 玩家点击导航进入「卫星雷达」页面 → Phaser Canvas 懒加载完成，地图以"区域"视角（zoom 0.70）渲染，摄像机对准起始地块。
2. 玩家滚轮缩放 → 平滑 Tween 过渡（350ms），LOD 图层按 zoom 阈值自动切换；zoom 级别指示器更新。
3. 玩家右键拖拽 → 摄像机平移，不触发格子选中；摄像机边界限制在地图世界范围内。
4. 玩家将鼠标悬停在格子上 500ms → 出现 tooltip（地形名 / 区域名 / 坐标）。
5. 玩家左键点击格子 → Phaser 内弹出内联菜单（坐标 + "前往此位置"文字）；右侧详情面板更新选中地块信息。
6. 队员正在移动中：地图渲染队员 Tween 动画（250ms/格，与游戏时间倍率联动），橙色轨迹线随步骤推进，蓝色待行路线实时更新。
7. 玩家通过通讯台确认选点后切回地图 → 蓝色路线预览出现，队员开始移动动画。

### 6.1 失败路径与边界

- **F1 — Phaser 初始化失败**：Canvas 区域显示 fallback 文字（"地图加载失败，请刷新"），不影响其他页面功能。
- **F2 — 点击不可走格子**：tooltip 显示"不可通行"，内联菜单不出现"前往此位置"选项。
- **F3 — 队员处于失联状态**：标记仍显示在最后已知格，不做插值动画，以视觉灰化区分。
- **F4 — 地图容器宽度变化（窗口 resize）**：ResizeObserver 触发 `game.scale.resize()`，Phaser 坐标与屏幕坐标保持一致；不出现点击偏移。

---

## 7. 约束与假设

### 7.1 约束

- **C1**：地图保持只读——所有行动指令必须经通讯台 → 通话发出，`onSelectMoveTarget` 仅传出选点，不直接写入 `GameState`。
- **C2**：PC 客户端是权威 `GameState` 持有者，地图渲染层不写 `GameState`。
- **C3**：Phaser 版本锁定为 `4.1.0`（包含 ESM 默认导出 bug #7280 的修复；早期 4.0.0 在 Vite/esbuild 下动态导入报错）。
- **C4**：`pixelArt: true` + `roundPixels: true` 必须同时配置——Phaser 4 将 `roundPixels` 默认值改为 `false`，像素风格贴图需显式开启。
- **C5**：Vitest/RTL 单元测试环境下必须完全跳过 Phaser 初始化（`import.meta.env.MODE === "test"` 守卫）。
- **C6**：Rush + pnpm monorepo，`phaser` 依赖添加到 `apps/pc-client/package.json`，不修改 root。

### 7.2 假设

- **A1**：8×8 网格全量重绘（每次 `updateState`，约 1Hz）在目标浏览器下帧率可接受（验证方式：实现后用 Chrome DevTools Performance 面板录制，确认无掉帧）。
- **A2**：`import("phaser")` 动态懒加载在 Vite + `phaser@4.1.0` 下正常工作（验证方式：本地 `vite dev` 启动后打开地图页，Network 面板确认 Phaser chunk 延迟加载）。
- **A3**：占位贴图（单色/简单图案 PNG）足以验证贴图加载管道，真实美术资产在后续迭代补充。

---

## 8. 方案选择

### 选择的方案：React stateRef + Phaser Scene 全量重绘

- **做法**：`stateRef.current = props` 在每次 React render 同步；Phaser 事件回调通过 `stateRef.current` 读取最新 props；每次 `updateState(SceneState)` 驱动全量重绘；`onSelectTile` 等回调用 `useState` setter 保证引用稳定。
- **优点**：架构简单，无额外 EventBus 模块；React 侧状态在 DevTools 完全可观测；与现有 `GameState` 单向数据流一致。
- **缺点/风险**：若地图超过 200 格，全量重绘可能有性能压力。
- **选择理由**：8×8 = 64 格，重绘量小；initial.md 已在 Demo 中验证该模式可行。

### 方案比较

| 方案 | 优点 | 缺点 | 适用场景 |
|------|------|------|---------|
| **stateRef + 全量重绘**（选用） | 简单、可观测 | 大地图有性能压力 | ≤ 200 格 |
| EventBus 局部更新 | 精确更新、性能好 | 增加模块复杂度 | 大地图 / 高频更新 |
| React 重渲染驱动 Phaser | 无需额外桥接 | 双重渲染开销，不可接受 | 不适用 |

---

## 9. 核心对象/数据

> 完整类型定义与常量见 `docs/plans/2026-04-30-18-46/initial.md` §5；此处仅列对用户旅程有影响的对象。

- **`PhaserMapTileView`**
  - 来源：`MapPage.tsx` 由 `GameState` 派生（只读）
  - 关键字段：`id`、`row`、`col`、`status`（discovered/frontier/unknownHole）、`fillColor`、`tooltip`、`terrain`、`crewLabels`、`isSelected`、`isTarget`、`isRoute`
  - 生命周期：每次 `updateState` 重新计算并传入 Phaser Scene

- **`PhaserCrewMarkerView`**
  - 来源：`MapPage.tsx` 由 `crew_actions` + `elapsedGameSeconds` 插值派生
  - 关键字段：`crewId`、`label`（M/A/G）、`x`（画布像素，已插值）、`y`
  - 生命周期：每次 `updateState` 更新坐标；移动中约 1Hz 驱动插值重算

- **`TileCenter`（`Record<string, {x, y}>`）**
  - 来源：由 `tileViews` 计算，`x = col*(TILE_SIZE+TILE_GAP)+TILE_SIZE/2`
  - 用途：提供格子中心画布坐标，供队员标记插值使用

- **Tileset Registry（`content/maps/tilesets/registry.json`）**
  - 来源：编译时 Vite JSON import
  - 关键字段：每条目 `id`、`file`（相对 public 的路径）、`frameWidth`、`frameHeight`、`frameIndex`
  - 用途：Phaser `preload` 阶段加载 sprite sheet，`create` 阶段按 `tilesetLayer0/1/2` 字段铺砖

- **常量**（硬编码于 `PhaserMapCanvas.tsx`）：`TILE_SIZE=128`、`TILE_GAP=2`、`ZOOM_LEVELS=[0.35, 0.7, 1.5, 3.0]`、`STEP_DURATION_MS=250`、`HOVER_DELAY_MS=500`、`ZOOM_TWEEN_DURATION_MS=350`

---

## 10. 范围与阶段拆分

### 10.1 MVP（本次必须做）

- 添加 `phaser@4.1.0` 依赖到 `apps/pc-client/package.json`
- 创建 `PhaserMapCanvas.tsx` 组件（双层渲染架构：Phaser canvas + HTML 语义层 `pointer-events: none`）
- Phaser Scene `preload`：从 `content/maps/tilesets/registry.json` + `public/maps/tilesets/` 加载占位 sprite sheet
- Phaser Scene `create`：按 `tilesetLayer0/1/2` 铺砖，`pixelArt: true` + `roundPixels: true`
- 4 级 Zoom + 滚轮以鼠标为中心缩放（Tween 350ms）+ LOD 在 Tween 回调中切换
- 右键拖拽摄像机平移；WASD 键盘平移；世界边界限制
- ResizeObserver + `game.scale.resize()` 监听容器尺寸变化
- 队员标记 Container（head + body）+ 250ms/格 Tween 动画（与 `elapsedGameSeconds` 时间倍率联动）
- 橙色已走轨迹线（depth 12）+ 蓝色待行路线预览（depth 11）
- Hover tooltip（500ms 延迟，地形名 + 区域名 + 坐标）
- 左键点击 → 内联弹出菜单 + `onSelectTile` 回调更新右侧面板
- HTML 语义层（`pointer-events: none`，键盘 a11y）
- DOM `data-zoom-level` / `data-char-tile` / `window.__mapTestState` e2e 桥接
- `MapPage.tsx` 挂载 `PhaserMapCanvas`，传入 `tileViews` / `crewMarkers` / `onSelectTile` / `onSelectMoveTarget`
- 扩展 `content/maps/default-map.json` 每个 tile 加 `tilesetLayer0/1/2` 字段；更新 `maps.schema.json`
- 创建 `content/maps/tilesets/registry.json` + 占位 PNG 文件（`public/maps/tilesets/`）

### 10.2 Later（未来可能做，明确本轮不做）

- 真实美术 tileset PNG 替换占位图
- 贴图动画（水面波纹、旗帜飘动）
- 迷雾效果（未探索区域蒙版逐格揭示动画）
- 地图编辑器模式（`editorMode: true`，拖拽绘制地形，接口已预留）
- 多人物同屏碰撞避让优化（当前 4 槽偏移已够用，扩展时增加偏移槽）
- 区域 hover 联动高亮同区域所有格子
- `game.scale.resize()` 替代 Phaser Game 完全重建（减少地图尺寸变化时的闪白）

---

## 11. User Stories（MVP）

### US-001：Phaser 地图基础渲染

- **作为**：玩家
- **我想要**：打开卫星雷达页面时看到 Phaser Canvas 渲染的贴图地图，而不是纯色 CSS 格子
- **以便**：有真实的视觉感知来判断地形和区域
- **验收标准**：
  - [ ] `MapPage.tsx` 中存在 `.phaser-map-stage` 挂载点和 `.phaser-map-fallback` 语义层
  - [ ] Phaser 以懒加载方式导入（Network 面板显示 phaser chunk 在地图页打开后才加载）
  - [ ] 地图以"区域"视角（zoom index 1）初始化，摄像机对准起始地块
  - [ ] 地形底色层可见（至少占位色块或 sprite）
  - [ ] Vitest 单元测试通过（测试环境跳过 Phaser 初始化）
- **不包含**：真实美术贴图；编辑器模式
- **优先级**：P0

### US-002：缩放与 LOD

- **作为**：玩家
- **我想要**：用滚轮在 4 个缩放级别间切换，缩放以鼠标所在位置为中心
- **以便**：可以在全局态势和地块细节间灵活切换，且视野不跳转到左上角
- **验收标准**：
  - [ ] 滚轮 deltaY < 0 放大，> 0 缩小，有 350ms Tween 过渡
  - [ ] 缩放锚点为鼠标世界坐标（鼠标下方格子在缩放前后位置不变）
  - [ ] zoom < 0.9 时细节装饰层和网格线隐藏；≥ 0.9 时装饰层可见；≥ 1.2 时网格线可见
  - [ ] DOM `.phaser-map-stage[data-zoom-level]` 随缩放更新（e2e 可断言）
  - [ ] 键盘 ↑/↓ 也可触发缩放
- **不包含**：UI 缩放按钮（Later）
- **优先级**：P0

### US-003：摄像机平移

- **作为**：玩家
- **我想要**：右键拖拽地图进行平移，WASD 也可控制
- **以便**：在大地图上自由浏览，不受初始视口限制
- **验收标准**：
  - [ ] 右键按下拖拽时摄像机跟随移动，速度与缩放解耦（屏幕位移感恒定）
  - [ ] 右键拖拽不触发格子选中逻辑
  - [ ] 摄像机不能拖出地图世界边界
  - [ ] 页面右键菜单被禁用（`disableContextMenu`）
  - [ ] WASD 平移时屏幕速度恒定（worldSpeed 随 zoom 补偿）
- **优先级**：P0

### US-004：Hover Tooltip

- **作为**：玩家
- **我想要**：将鼠标悬停在格子上 500ms 后，看到包含地形名、区域名和坐标的 tooltip
- **以便**：在不点击的情况下快速了解格子信息
- **验收标准**：
  - [ ] 悬停 500ms 后显示 tooltip，包含地形名 + 区域名 + 坐标
  - [ ] 鼠标移动时重置计时器（避免光标快速经过触发）
  - [ ] 点击或右键拖拽时 tooltip 消失
  - [ ] Tooltip 样式：半透明米色浮框（`0xf4eadf, alpha 0.96`），细边框（`0x24384f`）
- **优先级**：P0

### US-005：格子选中与右侧面板联动

- **作为**：玩家
- **我想要**：左键点击格子后，右侧面板显示该格子的详情，Phaser 内同时弹出内联菜单
- **以便**：获取地块详细信息并准备下达移动指令
- **验收标准**：
  - [ ] 左键点击可走格子 → 内联菜单显示坐标 + "前往此位置"；`onSelectTile` 回调触发，右侧面板更新
  - [ ] 点击不可走格子 → 内联菜单不显示"前往此位置"
  - [ ] "前往此位置"通过 `onSelectMoveTarget` 传出选点，不直接写 `GameState`
  - [ ] Playwright e2e 可通过 `page.mouse.click(x, y)` 点击画布坐标并断言右侧面板变化
- **优先级**：P0

### US-006：队员移动动画与轨迹

- **作为**：玩家
- **我想要**：在地图上看到队员标记随移动指令平滑移动，并显示已走路径和待行路线
- **以便**：实时了解队员行进状态，不必靠文字描述判断位置
- **验收标准**：
  - [ ] 队员标记为 Container（圆形头 + 圆形身），depth 20
  - [ ] 移动中每步 250ms Tween，速度与 `elapsedGameSeconds` 时间倍率联动
  - [ ] 橙色实线轨迹（depth 12，`lineStyle(4, 0xb45b13, 0.9)`）记录已走格子序列
  - [ ] 蓝色半透明待行路线预览（depth 11，`lineStyle(2, 0x90b0c8, 0.55)`）
  - [ ] 多队员同格时按偏移槽位排布，不完全重叠
  - [ ] DOM `data-char-tile` 在队员到达新格后更新（e2e 可断言）
- **优先级**：P0

### US-007：贴图加载管道

- **作为**：开发者
- **我想要**：建立完整的贴图加载基础设施，使后续美术资产可以直接替换占位图投入使用
- **以便**：MVP 验证管道正确性，后续只需换图不改代码
- **验收标准**：
  - [ ] `content/maps/tilesets/registry.json` 存在，描述贴图元数据
  - [ ] `apps/pc-client/public/maps/tilesets/` 下存在占位 PNG 文件
  - [ ] Phaser `preload` 按 registry 加载 sprite sheet，`create` 阶段按 tile 的 `tilesetLayer0/1/2` 字段铺砖
  - [ ] `content/maps/default-map.json` 中每个 tile 包含 `tilesetLayer0/1/2` 字段（可为 `null`）
  - [ ] `maps.schema.json` 更新以包含新字段
  - [ ] `npm run validate:content` 通过
- **优先级**：P0

---

## 12. 成功标准

- [ ] `npm run lint` 和 `npm run test` 在添加 Phaser 依赖后全部通过
- [ ] `npm run validate:content` 通过（schema 扩展后内容文件仍合法）
- [ ] 打开地图页面，Phaser Canvas 正常渲染，无控制台报错
- [ ] 滚轮缩放触发 Tween 动画，`data-zoom-level` 属性随之变化
- [ ] 右键拖拽摄像机移动，`window.__mapTestState.cameraScrollX` 变化
- [ ] Hover 500ms 显示 tooltip，内容包含地形名 / 区域名 / 坐标
- [ ] 点击格子，右侧面板更新选中坐标
- [ ] 队员移动时标记平滑 Tween，`data-char-tile` 在到达新格后更新
- [ ] 现有 Playwright e2e 测试（`app.spec.ts`）全部通过（无回归）
- [ ] 窗口 resize 后地图点击位置不偏移

### 12.2 使用效果

- **Metric 1**：地图页加载时间（Phaser chunk 懒加载后）不超过当前加载时间 +2 秒
- **Metric 2**：8×8 地图全量重绘在 Chrome DevTools 中无明显掉帧（目标 60fps）

---

## 13. 风险与缓解

- **R1：Phaser 4 ESM 动态导入在 Vite 下失败**
  - **缓解**：锁定 `phaser@4.1.0`（包含 PR #7284 修复）；若仍有问题，改用 `import * as Phaser from 'phaser'` 规避。

- **R2：`roundPixels` 默认改为 `false` 导致像素模糊**
  - **缓解**：在 Phaser Game 配置中显式设置 `pixelArt: true` + `roundPixels: true`。

- **R3：React StrictMode 双挂载导致 Phaser Game 重复创建**
  - **缓解**：`useEffect` 开头添加 `if (phaserGameRef.current !== null) return` 守卫；cleanup 调用 `game.destroy(true)` 并将 ref 置 `null`。

- **R4：全量重绘在未来地图扩展（>200 格）时性能不足**
  - **缓解**：MVP 阶段不处理；若地图扩展，改用 `StaticGroup` + 脏标记优化，或迁移到 EventBus 局部更新。

- **R5：`content/maps/default-map.json` 扩展 tilesetLayer 字段导致 schema 校验失败**
  - **缓解**：新字段设为 optional（`"required"` 不包含），`validate:content` 在 PR 合并前必须通过。

- **R6：Demo 分支的 Phaser 实现与 initial.md 规格存在偏差**
  - **缓解**：Demo 代码不复用，完全以 initial.md 为规范实现；initial.md 已提炼所有可复用设计决策。

---

## 14. 未决问题

1. **占位 PNG 的具体规格**：占位贴图是程序生成（脚本输出单色 PNG）还是手工放一张简单图片？需确认以便 US-007 实现。
2. **区域名标签锚点**：initial.md §2.1 定义了"row 最小、col 最小"的锚点规则；是否需要针对中文长区域名做截断或换行处理？
3. **失联队员视觉**：§6.1 F3 提到"视觉灰化"，具体实现方式（alpha 降低 / 灰色 tint / Container 上叠加蒙版）待实现时确认。

