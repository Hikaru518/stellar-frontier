# 调研报告

> **对应 initial.md**：地图系统 Phaser 4 实现
> **调研时间**：2026-04-30
> **调研范围**：项目现状（Project Findings）、主题 A（Phaser 4 vs Phaser 3 API）、主题 B（React + Phaser 集成）、主题 C（游戏地图 UX）

---

## 项目现状（Project Findings）

### P.1 当前实现状态

代码库内地图"玩法与数据层"已完整落地，但 **Phaser 视觉层完全未实现**。

| 功能 | 状态 | 说明 |
|------|------|------|
| 可配置网格（8×8）、BFS 寻路 | ✅ 已实现 | `mapSystem.ts` |
| 可见窗口（discovered + frontier + unknownHole） | ✅ 已实现 | `getVisibleTileWindow` |
| 原点相对坐标显示 | ✅ 已实现 | `displayX/Y` |
| 点击选格 + 右侧详情面板 | ✅ 已实现 | `MapPage.tsx` |
| 通话选点模式（路线预览 / 标记目的地） | ✅ 已实现 | `movePreview` / `onSelectMoveTarget` |
| 队员位置/轨迹显示 | ✅ 已实现（CSS 文字） | 非 Phaser，以 class/文字表达 |
| Phaser 4 渲染引擎 | ❌ **未实现** | 无依赖、无 Scene、无 Canvas |
| 真实 tileset PNG + registry.json | ❌ **未实现** | 无 `content/maps/tilesets/`，无 `public/maps/tilesets/` |
| 4 级 Zoom + 滚轮缩放 | ❌ **未实现** | 当前为纯 CSS 网格 |
| 右键拖拽摄像机 | ❌ **未实现** | |
| 人物 Tween 动画 / 橙色轨迹线 | ❌ **未实现** | |
| Hover tooltip（500ms 延迟） | ❌ **未实现** | |
| DOM data attributes / `__mapTestState` e2e 钩子 | ❌ **未实现** | |

### P.2 关键发现

1. **initial.md 注释"已通过 Demo 阶段验证"与主线仓库矛盾**：主线仓库内无任何 Phaser 源码或依赖；Demo 可能存在于其他分支/外部工程，或文档超前于合码。
2. **Phaser 依赖**：`apps/pc-client/package.json` 中**尚未安装 phaser**，需要从零添加依赖。
3. **MapPage.tsx 当前架构**：纯 React + CSS 网格（`section.map-grid` + `<button>` 格子），无 Canvas。接入 Phaser 需要改造挂载方式，并在同一页保留 HTML 语义层。
4. **content/maps/default-map.json 结构**：每个 tile 字段（`id`、`row`、`col`、`areaName`、`terrain` 等）与 initial.md §5.1–5.2 的数据结构对应，可直接复用；缺少 `tilesetLayer0/1/2` 字段（initial.md §4.5 新增字段，需扩展 JSON 和 schema）。
5. **测试现状**：单元测试（`mapSystem.test.ts`）、RTL（`App.test.tsx`）、E2E（`app.spec.ts`）覆盖玩法层；Phaser canvas 层的 e2e 测试（滚轮缩放、`data-zoom-level`、画布点击）完全待建。

### P.3 近期相关提交

```
95ee70d feat: game system demock (#26)
d8d6620 feat: 重构地图对象与行动系统 (#23)
b589ba6 Add minimal return-home MVP flow (#21)
59166b8 feat: 合并可配置地图系统与事件引擎 (#14)
```

---

## 主题 A：Phaser 4 API 与 Phaser 3 的关键差异

Phaser 4.0.0 于 2026-04-10 正式发布，是框架史上最大的一次版本迭代。官方定性为"核心渲染器完全重写，API 保持一致"——对只使用标准 API 的项目（Sprite、Text、Tilemap、Camera 等），迁移工作量通常在"几小时内可完成"。

### A.1 Camera API

**结论：标准 Camera 属性在 Phaser 4 中完全保留，无需修改。**

| 属性/方法 | Phaser 3 | Phaser 4 | 变化 |
|---|---|---|---|
| `scrollX` / `scrollY` | ✅ | ✅ | 无变化；继承自 `BaseCamera` |
| `setScroll(x, y)` | ✅ | ✅ | 无变化 |
| `setBounds(x, y, w, h)` | ✅ | ✅ | 无变化；继承自 `BaseCamera` |
| `zoom` | ✅ | ✅ | 无变化；默认值仍为 `1` |
| `setZoom(zoom)` | ✅ | ✅ | 无变化；继承自 `BaseCamera` |
| `startFollow(target)` | ✅ | ✅ | 无变化；`roundPixels` 参数仍支持 |
| `roundPixels` | 默认 `true` | **默认 `false`** | ⚠️ 默认值改变 |
| Camera 矩阵直接访问 | 单一矩阵 | 重构为三矩阵结构 | ⚠️ 直接访问需更新 |

> **重点注意**：`roundPixels` 的默认值在 Phaser 4 中改为 `false`。若游戏依赖像素对齐（pixel-perfect），需在配置中显式设置 `roundPixels: true`，或在 Camera 上单独设置。

Camera 矩阵重构细节（仅影响直接访问矩阵的代码）：
- 旧：单一矩阵含位置+旋转+缩放
- 新：`camera.matrix`（含滚动，不含位置）、`camera.matrixExternal`（处理位置）、`camera.matrixCombined`（两矩阵之积，按需合并）

### A.2 Tween API

**结论：Tween API 与 Phaser 3 基本一致，无 Breaking Change。**

`scene.tweens.add({...})` 的配置格式完全不变，支持：
- 全部旧有属性：`targets`、`duration`、`ease`、`repeat`、`yoyo`、`delay` 等
- `scene.tweens.chain({tweens: [...]})` — Phaser 3 中的 `Timeline` 已改名为 `chain`（功能等价）
- 所有 easing 函数名称不变
- `scene.tweens.addCounter({...})` 不变
- `tween.pause()` / `tween.resume()` / `tween.stop()` / `tween.play()` 不变

无需修改，直接使用 Phaser 3 的 Tween 代码即可。

### A.3 Scene 生命周期

**结论：Scene 生命周期完全不变。**

`init → preload → create → update` 的执行顺序与 Phaser 3 相同：
1. `init(data)` — 最先执行，接收来自 `scene.start(key, data)` 的参数
2. `preload()` — 仅在存在 `LoaderPlugin` 时调用，用于加载资源
3. `create()` — 资源加载完成后执行，创建游戏对象
4. `update(time, delta)` — 每帧执行

Scene 事件（`BOOT`、`CREATE`、`DESTROY`、`PAUSE`）亦不变。

### A.4 Input API

**结论：Input API 与 Phaser 3 一致，无 Breaking Change。**

| 特性 | 状态 |
|---|---|
| `this.input.keyboard.on('keydown', cb)` | ✅ 不变 |
| `this.input.keyboard.addKey(key)` | ✅ 不变 |
| `gameObject.setInteractive()` | ✅ 不变（默认关闭，需显式开启） |
| Pointer 事件（`pointerdown`、`pointermove` 等） | ✅ 不变 |
| `this.input.on('pointerdown', cb)` | ✅ 不变 |
| `pointer.rightButtonDown()` | ✅ 不变 |
| `this.input.activePointer` | ✅ 不变 |

### A.5 GameObjects

**结论：主要 GameObject 类型保留，部分被移除或新增。**

| GameObject | 状态 |
|---|---|
| `Image` | ✅ 保留 |
| `Graphics` | ✅ 保留 |
| `Container` | ✅ 保留 |
| `Text` | ✅ 保留 |
| `Sprite` | ✅ 保留 |
| `TilemapLayer` | ✅ 保留（新增 `TilemapGPULayer` 超高性能版本） |
| `Mesh` / `Plane` | ❌ 已移除（无直接替代） |
| `Gradient` | 🆕 新增 GameObject |
| `Noise` | 🆕 新增（Cell/Simplex 噪声） |

Tint 系统变化（影响所有 GameObject）：
- `setTintFill()` — ❌ **已移除**
- 替代：`setTint(color)` + `setTintMode(mode)`，mode 可选 `MULTIPLY`/`FILL`/`ADD`/`SCREEN`/`OVERLAY`/`HARD_LIGHT`

### A.6 动态导入 `import("phaser")` 的可用性

**结论：Phaser 4 提供 ESM 构建，动态导入可用，但早期版本有已知 bug。**

- Phaser 4 提供 `phaser.esm.js` 和 `phaser.esm.min.js`
- **已知问题**：Phaser 4.0.0 的 ESM 构建中存在缺失默认导出的 bug（issue #7280，2026-04-13 提出），导致 `import('phaser')` 在 esbuild 下报错 `No matching export for import "default"`
- **修复状态**：PR #7284（"Add missing default export"）已于 2026-04-22 合并关闭
- **建议**：确保使用 4.0.0 之后包含该修复的版本；或改用 `import * as Phaser from 'phaser'` 的 named import 方式规避

### A.7 `pixelArt: true` 配置

**结论：Phaser 4 完全支持 `pixelArt: true`，功能说明不变。**

官方文档描述：
> "Prevent pixel art from becoming blurred when scaled. It will remain crisp (tells the WebGL renderer to automatically create textures using a linear filter mode)."

`pixelArt: true` 等效于关闭 WebGL 线性插值（nearest-neighbor 采样），适合像素风格游戏。

**配套注意**：`roundPixels` 在 Phaser 4 中默认改为 `false`，若需完整的像素完美渲染，应同时设置：
```js
{
  pixelArt: true,
  roundPixels: true  // Phaser 4 中需显式设置，不再是默认值
}
```

### A.8 其他需注意的移除/变化

| 特性 | 变化 |
|---|---|
| `Geom.Point` | ❌ 移除，改用 `Vector2` |
| `Math.TAU` | ⚠️ 修正为 `Math.PI * 2`（v3 中错误设为 `Math.PI / 2`） |
| `Phaser.Struct.Set` / `Phaser.Struct.Map` | ❌ 移除，改用原生 `Set` / `Map` |
| `DynamicTexture` | ⚠️ 绘制命令不再立即执行，需显式调用 `render()` |
| `BitmapMask` | ❌ 移除，改用新的 Mask Filter |
| FX 系统 | ⚠️ 与 Mask 合并为统一的 Filter 系统 |
| 自定义 WebGL Pipeline | ⚠️ 需重写为 Render Node 架构 |

---

## 主题 B：React + Phaser 集成最佳实践（2025/2026）

### B.1 stateRef 模式：避免闭包陷阱

**问题根源**：Phaser 的 `update()` 回调和 RAF 循环在创建时捕获闭包，若依赖 React `useState`，循环内将始终读到**创建时的快照值**（stale closure）。

**标准解法：stateRef 模式**

```ts
// 游戏循环读取的可变状态 → 全部存 useRef
const gameStateRef = useRef<GameState>(initialGameState);
const phaserGameRef = useRef<Phaser.Game | null>(null);

// 触发 React 重渲染的状态（如 UI 覆盖层） → 存 useState
const [selectedCrewId, setSelectedCrewId] = useState<string | null>(null);

// React 侧更新时，同步写入 ref
const updateGameState = (newState: GameState) => {
  gameStateRef.current = newState;
  // 通过 EventBus 通知 Phaser Scene
  EventBus.emit('gamestate-update', newState);
};
```

Phaser Scene 内读取 `gameStateRef.current` 永远是最新值，无需担心 stale closure。

### B.2 useEffect 与 Phaser Game 实例的生命周期管理

**官方推荐模式**（Phaser React template，Phaser 3.90 + React 19）：

```ts
useEffect(() => {
  if (phaserGameRef.current !== null) return; // 防止重复创建

  phaserGameRef.current = new Phaser.Game({
    parent: containerRef.current,
    // ...config
  });

  return () => {
    phaserGameRef.current?.destroy(true);
    phaserGameRef.current = null;
  };
}, []); // 空依赖数组：仅挂载/卸载时执行
```

**关键原则**：
- `Game` 实例必须存入 `useRef`，不能存入 `useState`（后者会触发不必要的重渲染）
- 清理函数必须调用 `game.destroy(true)` 释放 WebGL context
- `destroy` 后将 ref 设为 `null`，防止后续使用悬空引用

### B.3 React StrictMode 下的双挂载问题

**问题描述**：React 18+ StrictMode 在开发模式下故意执行"挂载 → 卸载 → 重挂载"来检测副作用，导致 Phaser Game 被创建两次。

**具体表现**：
- 页面出现两个 Canvas 元素
- Phaser 实例创建/销毁极快时，内部状态可能崩溃

**推荐解法**：在 `useEffect` 开头添加早返回守卫：

```ts
useEffect(() => {
  if (phaserGameRef.current !== null) return; // 守卫：若已创建则跳过
  // ...创建 Game
}, []);
```

这样第二次挂载执行时，因 `ref.current` 已有值而直接返回，避免重复创建。

**注意**：上述守卫虽然在 StrictMode 下防止了双创建，但**第一次挂载产生的 Game 实例在 StrictMode 的卸载阶段会被 destroy**。若需要更完整的 StrictMode 兼容，需额外考虑这一点（通常在生产环境中 StrictMode 不会双挂载，影响仅在开发时）。

### B.4 React ↔ Phaser 通信：EventBus 模式

官方 Phaser React template 使用 **EventBus（自定义 EventEmitter）** 作为两个框架间的桥梁：

```ts
// EventBus.ts
import Phaser from 'phaser';
export const EventBus = new Phaser.Events.EventEmitter();

// React 侧发送
EventBus.emit('select-crew', crewId);

// Phaser Scene 侧监听
EventBus.on('select-crew', (crewId: string) => {
  this.highlightCrew(crewId);
});
```

不要尝试让 Phaser GameObjects 变成 React 受控组件——两套渲染体系的生命周期不兼容。

### B.5 全量重绘 vs Diff 更新的性能权衡

| 策略 | 适用场景 | 优缺点 |
|---|---|---|
| **Phaser 场景内部全量更新**（每帧 update） | 高频动态对象（角色移动、动画） | 零 React 开销；Phaser 内部优化好；推荐 |
| **EventBus 触发 Phaser 局部更新** | 低频状态变更（GameState 更新） | 精确、无冗余渲染；推荐 |
| **React 重渲染驱动 Phaser** | 几乎不适用于游戏主循环 | 虚拟 DOM 对账 + Phaser 重绘双重开销；避免 |

**核心原则**：Phaser 管自己的渲染，React 管 UI 覆盖层（HUD、面板、Tooltip 等）。两者不交叉。

---

## 主题 C：游戏地图 UX 设计模式

### C.1 以鼠标为中心的缩放（Mouse-Centered Zoom）

**标准实现算法**：

```
// 缩放前：将鼠标位置转换为世界坐标
worldX = (mouseX - offsetX) / scale
worldY = (mouseY - offsetY) / scale

// 应用新缩放
newScale = clamp(scale * zoomFactor, minScale, maxScale)

// 调整偏移，使世界坐标点保持在鼠标位置下
offsetX = mouseX - worldX * newScale
offsetY = mouseY - worldY * newScale
```

**在 Phaser Camera 中的等效实现**：

Phaser Camera 的 `zoom` 以相机中心为锚点，若需以鼠标为中心缩放，需同步调整 `scrollX` / `scrollY`：

```ts
const cam = this.cameras.main;
const worldPoint = cam.getWorldPoint(pointer.x, pointer.y);
cam.zoom = newZoom;
// 缩放后重新对准世界点
cam.centerOn(
  worldPoint.x - (pointer.x - cam.width / 2) / newZoom,
  worldPoint.y - (pointer.y - cam.height / 2) / newZoom
);
```

或更简洁：在 `wheel` 事件中先记录 `worldPoint`，设置新 zoom 后，通过 `scrollX/Y` 补偿偏移。

### C.2 右键拖拽平移

**标准实现**：

```ts
// create() 中
this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
  if (p.rightButtonDown()) {
    this.isDragging = true;
    this.dragStartX = p.x + cam.scrollX;
    this.dragStartY = p.y + cam.scrollY;
  }
});

this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
  if (this.isDragging) {
    cam.setScroll(
      this.dragStartX - p.x,
      this.dragStartY - p.y
    );
  }
});

this.input.on('pointerup', () => { this.isDragging = false; });
```

**UX 建议**：
- 右键拖拽是地图/设计工具（Figma、Google Maps、游戏地图）的通用范式，用户心智模型成熟
- 建议在拖拽时将鼠标光标改为 `grabbing`（CSS `cursor` 属性），提供视觉反馈
- 需处理鼠标移出 Canvas 区域时的 `pointerup` 事件（可在 `window` 上监听 `mouseup` 防漏释放）
- 禁用右键菜单：`canvas.addEventListener('contextmenu', e => e.preventDefault())`

### C.3 Hover Tooltip 延迟时长

**行业标准**：300–500 ms

| 延迟时长 | 评价 |
|---|---|
| < 200ms | 过短，光标快速经过也会触发，体验嘈杂 |
| 300ms | WCAG 推荐下限；W3C APG 示例使用此值 |
| 400–500ms | 主流游戏 / 应用常见值；balance 遍历速度与误触 |
| **当前设计 500ms** | ✅ 符合行业标准，处于合理上限 |
| > 700ms | 过长，用户感觉系统反应迟钝 |

**无障碍要求（WCAG 1.4.13）**，三项必须满足：
1. **持续性（Persistent）**：Tooltip 显示后，在指针移走或焦点离开前保持可见
2. **可悬停（Hoverable）**：指针移到 Tooltip 内容上时，Tooltip 不消失
3. **可消除（Dismissible）**：按 Escape 键可关闭 Tooltip，无需移开鼠标

游戏地图场景为非无障碍关键场景，可放宽第 3 点，但前两点建议保留（避免 Tooltip 在用户移向 Tooltip 内容时消失）。

### C.4 LOD（Level of Detail）在 2D 地图中的应用

**2D 地图中"LOD"的实质**：不同于 3D LOD（多精度网格替换），2D 地图 LOD 的核心是**基于 Zoom Level 的内容分层显示**。

| Zoom Level | 显示内容（建议）|
|---|---|
| Zoom 1（最小）| 仅地形色块/区域色彩；不显示地块网格线；隐藏人物标记；仅显示区域名标签 |
| Zoom 2 | 地形贴图轮廓；显示区域边界感；人物标记缩小版 |
| Zoom 3 | 完整贴图细节；人物标记正常大小；Tooltip 可触发 |
| Zoom 4（最大）| 贴图最大细节；人物头像/名称完整显示；所有交互可用 |

**Phaser 实现思路**：

```ts
// 在 zoom 变化时，更新对象可见性
private applyLOD(zoom: number): void {
  const showFull = zoom >= ZOOM_LEVELS[2];
  this.areaLabels.setVisible(true);    // 始终显示
  this.crewMarkers.setVisible(zoom >= ZOOM_LEVELS[1]);
  this.gridLines.setVisible(zoom >= ZOOM_LEVELS[2]);
  this.crewNames.setVisible(showFull);
}
```

**性能意义**：在低 zoom 时减少绘制对象数量，尤其在 8×8 地图中意义有限；但对于未来扩展到更大地图时，LOD 是保持帧率的关键手段。

---

## 参考来源

| 编号 | 标题 | URL |
|---|---|---|
| [1] | Migrating from Phaser 3 to Phaser 4 (官方) | https://phaser.io/news/2026/04/migrating-from-phaser-3-to-phaser-4-what-you-need-to-know |
| [2] | Phaser v4.0.0 Release Notes | https://github.com/phaserjs/phaser/releases/tag/v4.0.0 |
| [3] | Phaser 4 Camera API Docs (BaseCamera) | https://docs.phaser.io/api-documentation/4.0.0-rc.6/class/cameras-scene2d-basecamera |
| [4] | Phaser 4 Config Class Docs | https://docs.phaser.io/api-documentation/4.0.0-rc.6/class/core-config |
| [5] | Phaser 4 Tweens Concepts | https://docs.phaser.io/phaser/concepts/tweens |
| [6] | Phaser 4 Input Concepts | https://docs.phaser.io/phaser/concepts/input |
| [7] | Phaser 4 Scene Types | https://docs.phaser.io/api-documentation/4.0.0-rc.6/typedef/types-scenes |
| [8] | Phaser 4 ESM Default Export Bug #7280 | https://github.com/phaserjs/phaser/issues/7280 |
| [9] | phaserjs/template-react (官方 React 模板) | https://github.com/phaserjs/template-react |
| [10] | React StrictMode double-mount issue with Phaser | https://stackoverflow.com/questions/73910900/why-are-multiple-canvases-being-made-in-my-phaser-react-app |
| [11] | React stale closure with useRef in game loop | https://dev.to/shaishav_patel_271fdcd61a/building-snake-in-react-canvas-raf-loop-mutable-refs-to-avoid-stale-closures-and-wall-wrap-3gbg |
| [12] | Mouse-centered zoom implementation | https://stackoverflow.com/questions/38674179/how-to-implement-a-stable-zoom-in-a-mapping-application |
| [13] | Infinite canvas tutorial (zoom+pan) | https://www.ywian.com/blog/build-infinite-canvas-step-by-step |
| [14] | WCAG 1.4.13 Tooltip accessibility standard | https://www.w3.org/WAI/ARIA/apg/patterns/tooltip |
| [15] | Accessible Tooltip timing guide (2025) | https://blog.greeden.me/en/2025/05/14/accessible-tooltip-design-guide-based-on-wcag-1-4-13-a-practical-approach/ |
| [16] | Phaser 4 NineSlice pixelArt issue #7281 | https://github.com/phaserjs/phaser/issues/7281 |
