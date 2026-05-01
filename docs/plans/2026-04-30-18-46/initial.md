# 地图系统需求文档

> **文档用途**：记录 Phaser 地图系统的技术设计与产品需求，作为正式实现的参考规格。本文档自包含所有关键设计决策、数据结构、算法和常量，不依赖任何临时文件。
>
> **状态**：已通过 Demo 阶段验证；下一步按本文档在主游戏入口实现。

---

## 1. 概述

地图系统的最终形态是一个 **Phaser 4 驱动的、可缩放、可拖拽的 2D 游戏地图**，融合：

- Google Maps 风格的离散缩放（4 个 Zoom Level）
- 基于贴图（tileset）的 RPG Maker 风格视觉层
- 人物移动轨迹与实时插值动画
- 悬停 tooltip、点击选中、右侧面板联动
- 摄像机右键拖拽平移
- 与现有 `GameState` 完全集成（只读），不通过地图下达指令

地图对应游戏中的"卫星雷达地图"页面（`MapPage`）。地图保持只读态势图定位：玩家通过地图查看、选点，指令通过通讯台 → 通话发出。

> **依赖版本**：`phaser: ~4.1.0`（package.json 中的实际依赖；注意 Phaser 4 与 Phaser 3 的 API 存在差异）

---

## 2. 核心概念澄清

### 2.1 区域（Region）

地图中没有"大格"这一固定正方形单元的概念。地图由若干**地块（tile）组成（默认 8×8 网格），每个地块属于某个区域（areaName）**，例如"火山区域""密林边缘""坠毁带"。

- 区域由若干相邻地块共同构成，形状**可以是不规则的**
- 区域的边界和形状由 `content/maps/*.json` 中每个 tile 的 `areaName` 字段决定，不由代码固定
- 地图上**不绘制区域边界线**；区域感来自贴图风格和悬停时显示的区域名标签
- 缩放级别改变的是相机焦距，不改变地块数据层级

**区域名标签锚点规则**：对于同一个 `areaName` 对应的所有 tile，选取 `row` 最小、`row` 相同时 `col` 最小的 tile 作为标签的绘制锚点。这保证标签始终出现在区域的左上角附近，位置稳定。

### 2.2 缩放（Zoom）

Zoom Level 是**纯相机缩放**，控制玩家同时能看到多少地块、多少视觉细节：

- Zoom 低 → 视野广，地块细节较少
- Zoom 高 → 视野窄，贴图细节清晰，人物标记更大
- 共 4 个离散级别，详见 §4.1

### 2.3 地图只读约定

地图展示信息、支持选点；移动、待命、停止、调查四类基础行动通过通讯台 → 通话发出，地图不直接下达指令。

---

## 3. 技术框架

### 3.1 渲染引擎

- **Phaser 4**（`~4.1.0`）作为 WebGL / Canvas 2D 渲染引擎
- 通过 `import("phaser")` 懒加载（~1MB gzip 后），不影响非地图页面的首屏加载
- 在 `import.meta.env.MODE === "test"` 时完全跳过 Phaser 初始化，保证 Vitest + RTL 单元测试可运行

**Phaser Game 初始化配置**（像素艺术贴图必须关闭抗锯齿，否则放大后模糊）：

```typescript
new Phaser.Game({
  type: Phaser.AUTO,
  parent: containerRef.current,
  width: worldWidth,
  height: worldHeight,
  backgroundColor: "#77736b",
  antialias: false,   // 像素艺术不开抗锯齿
  pixelArt: true,     // 等价于 antialias:false + roundPixels:true
  scene: MapScene,
});
```

### 3.2 双层渲染（Dual Rendering）策略

Phaser canvas 负责视觉渲染；HTML 语义层负责键盘 a11y 和测试钩子。**两层不共享 pointer 事件**——Phaser 独占所有鼠标输入，HTML 层只处理键盘。

```
┌─────────────────────────────────┐
│ .phaser-map-canvas              │ ← position: relative 容器
│   ├── .phaser-map-stage         │ ← Phaser canvas 挂载点（视觉层）
│   │     ↑ 接收所有鼠标事件       │
│   └── .phaser-map-fallback      │ ← pointer-events: none（不拦截鼠标）
│         └── <button> × N        │   键盘导航 / tabIndex / onKeyDown
└─────────────────────────────────┘
```

> **关键约束**：`.phaser-map-fallback` 必须设置 `pointer-events: none`。若设为 `pointer-events: all`，HTML 透明层会拦截 `pointermove` 和右键 `pointerdown`，导致 Phaser 的 hover tooltip 和摄像机拖拽完全失效。

- 基础地块大小：`TILE_SIZE = 128`（像素，世界空间）
- 地块间距：`TILE_GAP = 2`（像素）
- `MapPage` 通过这两个常量计算 `TileCenter`，供人物标记插值使用

**测试点击方案**（HTML 层无 pointer events 时的替代）：

- RTL 单元测试：依然通过 `fireEvent.click` 触发 `<button>` 的 `onKeyDown` 或直接调用 `onSelectTile` 回调
- Playwright e2e：对于需要点击的场景，用 `page.mouse.click(x, y)` 直接点击画布坐标，或通过机制 A（data attributes）/ 机制 B（window state）验证状态变化

### 3.3 React ↔ Phaser 状态桥接

```
React Props (stateRef)
  │  updateState(SceneState) ──→  Phaser Scene（全量重绘）
  │                                    │ onSelectTile(tileId)
  └←──────────────────────────────────┘
```

**关键设计**：`stateRef.current = props` 在每次 render 同步，Phaser 事件回调通过 `stateRef.current` 访问最新 props，避免闭包持有过期值。

**调用约定**：`onSelectTile` 应传入引用稳定的回调（如 React `useState` setter），避免每次 render 都触发不必要的 `updateState`。

Scene 不持有业务状态；每次 `updateState` 驱动全量重绘（网格规模 ≤ 64 格时每秒约 1 次，性能可接受）。

**React 19 StrictMode**：`useEffect` 在 StrictMode 下执行挂载→卸载→再挂载，`cancelled` flag 已正确处理此场景（在 cleanup 中将其设为 `true`，阻止第二次挂载时的 Phaser Game 创建）。

**Phaser Game 尺寸变化**：当 `tileViews.length` 或 `columns` 变化时，当前实现完全销毁并重建 Phaser Game，会产生短暂空白帧。可优化为：检测变化后调用 `game.scale.resize(newWidth, newHeight)` 替代重建。MVP 阶段地图尺寸相对固定，此优化可留至 Later。

### 3.4 图层体系（按 depth 从低到高）


| Depth | 图层名                    | LOD 可见性    | 说明                                    |
| ----- | ---------------------- | ---------- | ------------------------------------- |
| 1     | 地形底色层                  | 始终         | 每格的地形贴图或纯色底层                          |
| 3     | 细节装饰层                  | zoom ≥ 0.9 | 树、石、房屋等贴图细节                           |
| 4     | 地块网格线                  | zoom ≥ 1.2 | 细网格线（透明度低）                            |
| 13    | 区域名标签                  | zoom ≥ 0.7 | 浮于区域锚点格子上方；depth > trail(12) 防止轨迹遮挡标签 |
| 11    | 待行路线预览                 | 动态         | 半透明蓝色折线                               |
| 12    | 已走轨迹                   | 动态         | 橙色实线                                  |
| 15    | HUD 提示文字               | 始终（固定屏幕）   | `setScrollFactor(0)`                  |
| 20    | 人物标记                   | 始终         | Container（头 + 身）                      |
| 30+   | Hover tooltip / 左键弹出菜单 | 动态         | 最顶层                                   |


### 3.5 静态资源服务（贴图文件路径）

Phaser 在运行时通过 URL 加载贴图（`this.load.image(key, url)`），因此贴图文件必须可被浏览器访问。

**采用方案：`public/` 目录静态服务**

- 将贴图文件放在 `apps/pc-client/public/maps/tilesets/`（Vite 的静态资源目录）
- 运行时 URL 格式：`/maps/tilesets/terrain.png`（开发）或 `/stellar-frontier/maps/tilesets/terrain.png`（生产，因 `base` 配置）
- Registry JSON 的读取：`import registry from '../../../content/maps/tilesets/registry.json'`（编译时 import，Vite 支持 JSON import）

> **content/ 与 public/ 的分工**：
>
> - `content/maps/tilesets/registry.json`：描述贴图元数据（哪个 id 对应哪个文件，帧尺寸等），由编译时 import 读取
> - `apps/pc-client/public/maps/tilesets/*.png`：贴图文件本身，由 Phaser 在运行时通过 URL 加载
> - 两者用 `file` 字段中的相对路径关联（registry.json 中的 `file` 字段对应 public 目录下的路径）

**Phaser preload 实现示意**：

```typescript
preload() {
  for (const entry of registry.tilesets) {
    // entry.file 如 "maps/tilesets/terrain.png"
    const base = import.meta.env.BASE_URL; // "/stellar-frontier/" 或 "/"
    this.load.spritesheet(entry.id, `${base}${entry.file}`, {
      frameWidth: entry.frameWidth,
      frameHeight: entry.frameHeight,
    });
  }
}
```

### 3.6 Canvas Resize 策略

游戏容器宽度随浏览器窗口变化时，Phaser 内部分辨率不会自动跟随。需在组件挂载后监听容器尺寸变化，并调用 `game.scale.resize()`：

```typescript
useEffect(() => {
  if (!gameRef.current || !containerRef.current) return;
  const observer = new ResizeObserver(() => {
    const el = containerRef.current;
    if (!el || !gameRef.current) return;
    gameRef.current.scale.resize(el.clientWidth, el.clientHeight);
  });
  observer.observe(containerRef.current);
  return () => observer.disconnect();
}, []);
```

> 不设置此监听，CSS `width: 100%; height: auto` 会拉伸画布像素，导致 Phaser 内坐标与屏幕坐标不对应，点击位置偏移。

---

## 4. 功能需求

### 4.1 Zoom（缩放系统）

**4 个离散 Zoom Level**：


| 索引  | 系数   | 标签  | 视觉意图               |
| --- | ---- | --- | ------------------ |
| 0   | 0.35 | 全局  | 一次看清整张地图全貌         |
| 1   | 0.70 | 区域  | 约看到 4–6 个地块，默认初始视角 |
| 2   | 1.50 | 地块  | 约看清 1–2 个地块，贴图细节明显 |
| 3   | 3.00 | 精细  | 贴图主导视野，人物标记清晰      |


**缩放触发方式**（均使用平滑 Tween 过渡，duration: 350ms，ease: Cubic.easeInOut）：

- 滚轮（deltaY < 0 → 放大，> 0 → 缩小）
- 键盘 ↑ / ↓ 箭头键
- （预留）UI 缩放按钮

**以鼠标为中心缩放（视口补偿）**：滚轮缩放必须保持鼠标下方的世界坐标不变，否则视口会跳向左上角：

```typescript
private changeZoomLevel(delta: number, pointer?: Phaser.Input.Pointer) {
  if (this.zooming) return;
  const newIndex = Math.min(Math.max(this.zoomLevelIndex + delta, 0), ZOOM_LEVELS.length - 1);
  if (newIndex === this.zoomLevelIndex) return;
  this.zoomLevelIndex = newIndex;
  this.zooming = true;
  setZoomLevelInReact(newIndex);

  const camera = this.cameras.main;
  const newZoom = ZOOM_LEVELS[newIndex];

  // 若有鼠标指针，以指针为中心缩放（保持指针下方的世界坐标不变）
  if (pointer) {
    const worldX = camera.scrollX + pointer.x / camera.zoom;
    const worldY = camera.scrollY + pointer.y / camera.zoom;
    this.tweens.add({
      targets: camera,
      zoom: newZoom,
      duration: ZOOM_TWEEN_DURATION_MS,
      ease: "Cubic.easeInOut",
      onUpdate: () => {
        camera.scrollX = worldX - pointer.x / camera.zoom;
        camera.scrollY = worldY - pointer.y / camera.zoom;
      },
      onComplete: () => { this.zooming = false; },
    });
  } else {
    // 键盘触发：以视口中心为缩放中心
    this.tweens.add({
      targets: camera,
      zoom: newZoom,
      duration: ZOOM_TWEEN_DURATION_MS,
      ease: "Cubic.easeInOut",
      onComplete: () => { this.zooming = false; },
    });
  }
}
```

**LOD 切换规则**：在 Tween 的 `onUpdate` 和 `onComplete` 回调中检测 zoom 是否跨越阈值，**不在 `update()` 每帧检测**（避免不必要的 GL 状态切换）：

```typescript
private applyLOD(zoom: number) {
  const showDetail = zoom >= LOD_DETAIL_THRESHOLD;
  const showGrid = zoom >= LOD_GRID_THRESHOLD;
  if (this.detailLayer) this.detailLayer.setVisible(showDetail);
  if (this.subGridLayer) this.subGridLayer.setVisible(showGrid);
}
// 在 Tween onUpdate 中调用：
onUpdate: () => { this.applyLOD(camera.zoom); }
```

阈值：

- `zoom < 0.9`：隐藏细节装饰层和地块网格线
- `0.9 ≤ zoom < 1.2`：显示细节装饰层，隐藏地块网格线
- `zoom ≥ 1.2`：显示全部图层

### 4.2 摄像机（Camera）

- **世界边界**：`camera.setBounds(0, 0, worldWidth, worldHeight)`，不允许拖出地图外
- **右键拖拽平移**：
  - `pointer.button === 2` 按下时记录 `dragStart = { x, y, scrollX, scrollY }`
  - `pointermove` 时：`camera.scrollX = dragStart.scrollX - (pointer.x - dragStart.x) / camera.zoom`
  - 速度与缩放解耦，屏幕位移感恒定
- **WASD 键盘平移**：在 `update()` 中处理，`worldSpeed = (400 * delta) / (1000 * camera.zoom)`，屏幕速度恒定
- **禁用浏览器右键菜单**：`this.input.mouse?.disableContextMenu()`
  > **副作用说明**：`disableContextMenu()` 会全局禁用整个页面的浏览器右键菜单，不仅限于 Phaser canvas。若地图页其他 DOM 元素需要右键菜单，需评估影响（当前 MapPage 无此需求）。
- **初始位置**：`camera.centerOn(startX, startY)`，对准游戏起始地块坐标中心

### 4.3 人物移动与轨迹

人物通过通讯台 → 通话发出移动指令，地图只展示移动过程。

**人物标记（Phaser Container，depth 20）**：

```
Container
  ├── circle body  (radius=8, color=#24384f, offset y=+3)
  └── circle head  (radius=6, color=#f4eadf, stroke 2px #24384f, offset y=-9)
```

**移动动画**：

- 每步（地块间）使用 Phaser Tween，duration = 250ms（每格移动时长，可配置）
- Tween 完成回调更新当前坐标并追加轨迹，再递归调用下一步（链式移动）
- 新路线到达时 `tweens.killTweensOf(person)` 取消当前移动，snap 到最近已完成格后重新寻路

**已走轨迹（Trail）**：

- 以数组记录已访问格子序列
- `trailGraphics`（depth 12）绘制橙色实线：`lineStyle(4, 0xb45b13, 0.9)`，每节点有小圆点
- 每次步骤完成后调用 `refreshTrail()`

**待行路线预览（Pending Path）**：

- 收到导航请求后立即绘制浅蓝色半透明折线（depth 11）：`lineStyle(2, 0x90b0c8, 0.55)`
- 人物到达目标后清除

**React 层人物位置插值**（用于地图组件将队员位置映射到画布坐标）：

```typescript
// 根据行动数据计算当前帧的插值坐标
// 使用 elapsedGameSeconds（游戏时间）而非 Date.now()，
// 自动与游戏时间倍率（1x/2x/4x/8x）联动，人物动画跟随加速
function getCrewMarkerPosition(input: {
  currentTileId: string;
  action?: CrewActionState | null;
  tileCenters: Record<string, { x: number; y: number }>;
  elapsedGameSeconds: number;
}): { x: number; y: number } {
  const { currentTileId, action, tileCenters, elapsedGameSeconds } = input;
  const fallback = tileCenters[currentTileId] ?? { x: 0, y: 0 };
  if (!action || action.type !== "move" || action.status !== "active") return fallback;

  const route = action.path_tile_ids ?? [];
  const stepIndex = action.action_params.route_step_index;
  const stepStartedAt = action.action_params.step_started_at;
  const stepFinishTime = action.action_params.step_finish_time;
  if (typeof stepIndex !== "number" || typeof stepStartedAt !== "number" || typeof stepFinishTime !== "number") return fallback;
  if (stepFinishTime <= stepStartedAt) return fallback;

  const toTileId = route[stepIndex];
  const fromTileId = stepIndex === 0 ? action.from_tile_id : route[stepIndex - 1];
  if (!fromTileId || !toTileId) return fallback;

  const from = tileCenters[fromTileId];
  const to = tileCenters[toTileId];
  if (!from || !to) return fallback;

  const progress = Math.min(1, Math.max(0,
    (elapsedGameSeconds - stepStartedAt) / (stepFinishTime - stepStartedAt)
  ));
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
  };
}
```

**寻路算法（BFS，4 邻域）**：

```typescript
// 在 tile 网格上做 BFS，返回从 fromId 到 toId 的路径（含两端）
// 返回空数组 [] 表示"不可达"（起点或终点不可走，或两点间无连通路径）
// 起点等于终点的有效情况返回 [tileId]（长度为 1）
function findTilePath(
  tiles: MapTile[],
  fromId: string,
  toId: string,
): string[] {
  const byId = new Map(tiles.map((t) => [t.id, t]));
  const start = byId.get(fromId);
  const target = byId.get(toId);
  if (!start || !target || !isWalkable(start) || !isWalkable(target)) return [];
  if (fromId === toId) return [fromId];

  const queue = [fromId];
  const visited = new Set([fromId]);
  const previous = new Map<string, string>();

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (currentId === toId) break;
    const current = byId.get(currentId)!;
    for (const neighborId of getGridNeighborIds(current)) {
      if (visited.has(neighborId)) continue;
      const neighbor = byId.get(neighborId);
      if (!neighbor || !isWalkable(neighbor)) continue;
      visited.add(neighborId);
      previous.set(neighborId, currentId);
      queue.push(neighborId);
    }
  }

  // previous 未包含 toId → 不可达
  if (!previous.has(toId)) return [];
  const path: string[] = [];
  let cursor = toId;
  while (cursor !== fromId) {
    path.push(cursor);
    cursor = previous.get(cursor)!;
  }
  path.push(fromId);
  return path.reverse();
}

// 4 邻域相邻 tile ID（row-col 格式）
function getGridNeighborIds(tile: { row: number; col: number }): string[] {
  return [
    `${tile.row - 1}-${tile.col}`,
    `${tile.row + 1}-${tile.col}`,
    `${tile.row}-${tile.col - 1}`,
    `${tile.row}-${tile.col + 1}`,
  ];
}
```

### 4.4 Hover 与点击交互

**Hover（悬停 tooltip）**：

- 悬停 500ms 后显示（使用 Phaser `time.delayedCall`，鼠标移动时重置计时器）
- Tooltip 内容：地形名 + 所属区域名 + 坐标
- Tooltip 样式：半透明米色浮框（`0xf4eadf, alpha 0.96`），单细边框（`0x24384f`）
- 点击或右键拖拽触发时隐藏

**左键点击**：

- 更新 React `selectedTileId` 状态 → 右侧面板渲染选中地块详情
- 同时在 Phaser 内显示内联弹出菜单（地形、区域名、"前往此位置"文字）
- "前往此位置"在正式游戏中不直接发出指令，而是通过 `onSelectMoveTarget` 回调传出，由通话页确认

**右键**：触发摄像机拖拽，不触发选中逻辑

### 4.5 贴图系统（Tileset）

**文件布局**：

```
content/maps/tilesets/
  registry.json          ← 编译时 import（贴图元数据）
apps/pc-client/public/
  maps/tilesets/
    terrain.png          ← 运行时 URL 加载（实际贴图文件）
    decoration.png
    buildings.png
```

**贴图规格**：

- 格式：PNG，支持透明通道
- 原始格尺寸：16×16 或 32×32 像素，由 Phaser 缩放到世界空间像素
- 图集格式：横向排列的 sprite sheet（每行 N 帧）

**图层与贴图对应**：

- **Layer 0 – 地形底层**：草地、水面、沙漠、岩石等地形基础瓦片；始终可见
- **Layer 1 – 装饰层**：树木、灌木、岩石堆、花丛等覆盖贴图；zoom ≥ 0.9 时可见
- **Layer 2 – 建筑/对象层**：房屋、设施、遗迹；zoom ≥ 1.2 时可见

**Content JSON 扩展**（`content/maps/default-map.json` 每个 tile 新增字段）：

```json
{
  "id": "4-4",
  "terrain": "forest",
  "areaName": "密林边缘",
  "walkable": true,
  "moveCostSeconds": 90,
  "tilesetLayer0": "forest_base",
  "tilesetLayer1": "tree_dense",
  "tilesetLayer2": null
}
```

**Tileset 注册文件**（`content/maps/tilesets/registry.json`，编译时 import 读取）：

```json
{
  "tilesets": [
    {
      "id": "forest_base",
      "file": "maps/tilesets/terrain.png",
      "frameWidth": 32,
      "frameHeight": 32,
      "frameIndex": 5
    }
  ]
}
```

**Phaser 加载流程**：

```typescript
import registry from "../../../content/maps/tilesets/registry.json";

preload() {
  const base = import.meta.env.BASE_URL; // "/" 或 "/stellar-frontier/"
  for (const entry of registry.tilesets) {
    this.load.spritesheet(entry.id, `${base}${entry.file}`, {
      frameWidth: entry.frameWidth,
      frameHeight: entry.frameHeight,
    });
  }
}

create() {
  for (const tile of tileViews) {
    const x = tile.col * (TILE_SIZE + TILE_GAP);
    const y = tile.row * (TILE_SIZE + TILE_GAP);
    if (tile.tilesetLayer0) {
      const entry = registryById.get(tile.tilesetLayer0);
      this.add.image(x, y, entry.id, entry.frameIndex).setOrigin(0).setDepth(1);
    }
    if (tile.tilesetLayer1) {
      const entry = registryById.get(tile.tilesetLayer1);
      this.add.image(x, y, entry.id, entry.frameIndex).setOrigin(0).setDepth(3);
    }
    // Layer 2 同理，depth 取 6
  }
}
```

### 4.6 地图编辑器预留接口

地图编辑器（`apps/editor/`）通过读写 `content/maps/*.json` 工作。地图渲染层预留以下接口：

**组件 props 扩展**：

```typescript
interface MapCanvasEditorOptions {
  editorMode: boolean;
  // 格子属性被编辑器修改时的回调（写回 content JSON）
  onTileEdit?: (tileId: string, patch: Partial<MapTileData>) => void;
  // 格子右键时弹出编辑器菜单（screenPos 为屏幕坐标）
  onTileContextMenu?: (tileId: string, screenPos: { x: number; y: number }) => void;
  // 拖拽绘制时当前激活的笔刷 terrain
  paintTerrain?: string | null;
}
```

**编辑器专属图层**（仅 `editorMode === true` 时启用）：

- 高亮选中格：depth 50，橙色描边
- 笔刷预览：depth 55，半透明叠加
- 格子 ID 标签：depth 60，调试用

**内容数据边界**：

- 游戏模式下地图渲染只读，编辑器模式下允许写
- 编辑器不依赖 `GameState`，维护独立的"编辑器地图数据"状态

---

## 5. 数据结构

### 5.1 坐标系

```
Tile 内部坐标：(row, col)，row 从上到下，col 从左到右，0-indexed
Tile ID 格式："row-col"，如 "4-4"

画布像素坐标（tile 左上角）：
  x = col * (TILE_SIZE + TILE_GAP)
  y = row * (TILE_SIZE + TILE_GAP)

画布像素坐标（tile 中心）：
  x = col * (TILE_SIZE + TILE_GAP) + TILE_SIZE / 2
  y = row * (TILE_SIZE + TILE_GAP) + TILE_SIZE / 2

玩家可见坐标（显示用）：
  以起始地块 originTile 为 (0,0)，向东为正 X，向北为正 Y，可出现负数
  避免通过坐标范围提前暴露完整地图大小
```

### 5.2 核心类型

```typescript
// 地块发现状态
type VisibleTileStatus = "discovered" | "frontier" | "unknownHole";

// React → Phaser 传递的 tile 视图数据
interface PhaserMapTileView {
  id: string;
  row: number;              // 网格行（显示用，从 0 开始）
  col: number;              // 网格列（显示用，从 0 开始）
  displayCoord: string;     // 如 "(0,0)"
  status: VisibleTileStatus;
  fillColor: string;        // 程序生成色（贴图到位后退为次要）
  tooltip: string;
  label: string;
  terrain?: string;
  semanticLines?: string[]; // 供 HTML 语义层 / a11y 使用
  crewLabels: string[];     // 如 ["M", "A"]
  isDanger: boolean;
  isRoute: boolean;         // 是否在候选移动路线上
  isSelected: boolean;
  isTarget: boolean;        // 是否为移动目标
}

// 队员标记（含实时插值画布坐标）
interface PhaserCrewMarkerView {
  crewId: string;
  label: string;   // 如 "M" / "A" / "G"
  x: number;       // 画布像素 X（已完成插值）
  y: number;       // 画布像素 Y（已完成插值）
}

// Tile 中心坐标（供插值使用）
interface TileCenter {
  x: number;
  y: number;
}
```

### 5.3 常量

```typescript
const TILE_SIZE = 128;                           // 世界空间像素/格（基础分辨率）
const TILE_GAP = 2;                              // 格间距（像素）
const ZOOM_LEVELS = [0.35, 0.7, 1.5, 3.0];      // 4 个离散 zoom 系数
const ZOOM_LABELS = ["全局", "区域", "地块", "精细"] as const;
const INITIAL_ZOOM_LEVEL_INDEX = 1;              // 默认视角："区域"
const STEP_DURATION_MS = 250;                    // 人物每步移动时长（ms）
const HOVER_DELAY_MS = 500;                      // tooltip 悬停延迟（ms）
const LOD_DETAIL_THRESHOLD = 0.9;               // 细节装饰层显示阈值
const LOD_GRID_THRESHOLD = 1.2;                  // 网格线显示阈值
const ZOOM_TWEEN_DURATION_MS = 350;              // 缩放过渡动画时长
```

---

## 6. 地形颜色映射

此映射用于贴图可用前的程序生成底色，以及语义层 `fillColor` 字段（贴图到位后底色退为次要）。

### 6.1 游戏地形颜色（按 terrain 字符串匹配）

```typescript
function getTerrainFillColor(terrain?: string, status?: VisibleTileStatus): string {
  if (status === "frontier" || status === "unknownHole") {
    return "#6f7378"; // 未探索区域：统一暗灰
  }
  if (!terrain) return "#8c8174"; // 默认底色

  if (terrain.includes("水"))                                return "#2f80ed";
  if (terrain.includes("森林"))                              return "#2f8f46";
  if (terrain.includes("沙漠"))                              return "#d8b45f";
  if (terrain.includes("山") || terrain.includes("岩") || terrain.includes("丘陵"))
                                                             return "#777b82";
  if (terrain.includes("草") || terrain.includes("平原"))    return "#7fbf69";
  if (terrain.includes("坠毁") || terrain.includes("设施") || terrain.includes("残骸"))
                                                             return "#8c8174";
  return "#8c8174"; // 默认
}
```


| 地形关键字        | 颜色        | 效果   |
| ------------ | --------- | ---- |
| 水            | `#2f80ed` | 蓝色水域 |
| 森林           | `#2f8f46` | 深绿   |
| 沙漠           | `#d8b45f` | 沙黄   |
| 山 / 岩 / 丘陵   | `#777b82` | 灰褐岩地 |
| 草 / 平原       | `#7fbf69` | 浅绿草地 |
| 坠毁 / 设施 / 残骸 | `#8c8174` | 暗棕废墟 |
| 未探索          | `#6f7378` | 统一暗灰 |
| 默认           | `#8c8174` | 暗棕   |


### 6.2 背景色

- Phaser 画布背景：`#77736b`（灰褐，与未探索地块融合）
- 地图容器背景：`#1f536b`（深蓝，深空感）

---

## 7. 与现有游戏系统的集成

### 7.1 MapPage 数据流

```
MapPage (React)
  ├── visibleWindow = getVisibleTileWindow(mapConfig, gameMap)
  │     └─ 已发现 tiles + 外围一圈 frontier，求外接矩形
  ├── phaserTileViews = visibleWindow.cells.map(buildPhaserTileView)
  │     ├─ fillColor   = getTerrainFillColor(terrain, status)
  │     ├─ tooltip     = getTileTooltipText(displayCoord, status, terrain)
  │     ├─ isRoute     = movePreview.route.includes(cell.id)
  │     ├─ isSelected  = selectedId === cell.id
  │     └─ isTarget    = selectedMoveTargetId === cell.id
  ├── phaserCrewMarkers = buildPhaserCrewMarkers(crew, crewActions, tileCenters, elapsed)
  │     └─ getCrewMarkerPosition(currentTile, moveAction, tileCenters, elapsed)
  └── <PhaserMapCanvas
        columns={visibleColumns}
        tileViews={phaserTileViews}
        crewMarkers={phaserCrewMarkers}
        onSelectTile={setSelectedId}   → 更新右侧面板（引用稳定的 setter）
      />
```

### 7.2 TileCenter 计算

```typescript
function buildTileCenters(
  tileViews: PhaserMapTileView[]
): Record<string, TileCenter> {
  return Object.fromEntries(
    tileViews.map((tile) => [
      tile.id,
      {
        x: tile.col * (TILE_SIZE + TILE_GAP) + TILE_SIZE / 2,
        y: tile.row * (TILE_SIZE + TILE_GAP) + TILE_SIZE / 2,
      },
    ])
  );
}
```

### 7.3 队员标记偏移（多人同格时）

```typescript
// 当前支持最多 4 名队员同格（与游戏当前队伍规模 3 人匹配，留 1 槽余量）
// 若未来队伍扩展超过 4 人，第 5 人起会与第 1 人重叠，届时需增加偏移槽位
const CREW_MARKER_OFFSETS = [
  { x: 0, y: 0 }, { x: 18, y: 0 }, { x: -18, y: 0 }, { x: 0, y: 18 }
];
// index = crew 在数组中的顺序 % 4
```

### 7.4 GameState 只读约定

- 地图 Phaser canvas 不写入任何 `GameState`
- `onSelectTile` 只更新 `MapPage` 的 local state `selectedId`
- 移动选点通过 `onSelectMoveTarget` 回调传出，由通话页确认

---

## 8. CSS 样式规范

### 8.1 主地图组件

```css
/* 容器：相对定位，允许 fallback 层绝对覆盖 */
.phaser-map-canvas {
  grid-area: grid;
  position: relative;
  display: block;
}

/* Phaser canvas 挂载点 */
.phaser-map-stage {
  min-height: 432px;
  background: #77736b;
}
.phaser-map-stage canvas {
  display: block;
  width: 100%;
  height: auto;
}

/* HTML 语义层：pointer-events: none，不拦截 Phaser 的鼠标事件 */
.phaser-map-fallback {
  position: absolute;
  inset: 0;
  display: grid;
  pointer-events: none;  /* 必须为 none，否则会阻断 Phaser 的 hover 和右键拖拽 */
}
.phaser-map-fallback-tile {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  opacity: 0;
  pointer-events: none;  /* 继承父元素设定，也显式声明 */
  padding: 4px;
  font-family: monospace;
  font-size: 11px;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}
```

### 8.2 缩放级别指示器

```css
.zoom-level-bar {
  display: flex;
  gap: 6px;
  align-items: center;
}
.zoom-level-pip,
.zoom-level-active {
  padding: 2px 8px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 12px;
  border: 1px solid #77736b;
}
.zoom-level-active {
  background: #24384f;
  color: #f4eadf;
  border-color: #24384f;
}
```

### 8.3 地图详情侧面板

```css
/* 地图主布局：canvas 区 + 右侧详情面板 */
.map-layout {
  display: grid;
  grid-template-areas:
    "grid detail"
    "legend detail"
    "crew detail"
    "return detail";
  grid-template-columns: minmax(0, 1fr) minmax(280px, 320px);
  gap: 18px;
}

/* ≤ 980px 响应式：单列 */
@media (max-width: 980px) {
  .map-layout {
    grid-template-columns: 1fr;
    grid-template-areas: none;
  }
}
```

---

## 9. 测试策略

### 9.1 单元测试（Vitest + RTL）

Phaser 在 test 模式不初始化，所有视觉逻辑通过纯函数或语义 HTML 层验证：


| 测试范围          | 验证方式                                                                |
| ------------- | ------------------------------------------------------------------- |
| 地形颜色映射        | 直接调用 `getTerrainFillColor` 断言返回值                                    |
| Tooltip 文本生成  | 直接调用 `getTileTooltipText` 断言返回值                                     |
| 队员标记字符        | 直接调用 `getCrewMarkerLabel` 断言                                        |
| 移动插值坐标        | 构造 `CrewActionState`，调用 `getCrewMarkerPosition` 断言 progress=0.5 时坐标 |
| BFS 寻路（有路径）   | 给定可走 tile 数组和起终点，断言路径 ID 序列非空                                       |
| BFS 寻路（不可达）   | 起点或终点设为不可走，断言返回 `[]`                                                |
| BFS 寻路（起点=终点） | fromId === toId，断言返回 `[fromId]`                                     |
| 语义层结构         | RTL 断言 `phaser-map-stage` 和 `phaser-map-fallback` 都存在               |


### 9.2 端到端测试（Playwright）

**策略：DOM 状态桥接（不使用截图对比）**

`window.__mapTestState` 仅在 `import.meta.env.DEV` 为 `true` 时填充，因此 e2e 测试需针对 `vite dev`（开发服务器）运行，而非 `vite preview`（生产构建预览）。

**机制 A：DOM data attributes**

地图容器元素在 Phaser Scene 状态变化时写入 `data-`* 属性（Phaser 写 DOM 属性是可接受的轻量耦合）：

```typescript
// Scene 内部，状态变化时写入：
const stage = document.querySelector(".phaser-map-stage");
if (stage) {
  (stage as HTMLElement).dataset.zoomLevel = String(this.zoomLevelIndex);
  (stage as HTMLElement).dataset.charTile = `${charRow}-${charCol}`;
  (stage as HTMLElement).dataset.trailLength = String(this.trailRef.current.length);
}
```

Playwright 读取：

```typescript
await expect(page.locator(".phaser-map-stage")).toHaveAttribute("data-zoom-level", "2");
await expect(page.locator(".phaser-map-stage")).toHaveAttribute("data-char-tile", "3-4");
```

**机制 B：`window.__mapTestState`（仅 vite dev 模式）**

```typescript
if (import.meta.env.DEV) {
  (window as any).__mapTestState = {
    zoomLevelIndex: this.zoomLevelIndex,
    cameraScrollX: Math.round(camera.scrollX),
    cameraScrollY: Math.round(camera.scrollY),
    characterTile: `${charRow}-${charCol}`,
    trailLength: this.trailRef.current.length,
  };
}
```

Playwright 读取：

```typescript
const state = await page.evaluate(() => (window as any).__mapTestState);
expect(state.zoomLevelIndex).toBe(2);
```

**机制 C：`page.mouse.click(x, y)` 直接点击画布**

HTML 语义层设为 `pointer-events: none` 后，Playwright 可直接向画布坐标发送点击事件（Phaser 会正常接收）：

```typescript
// 点击地图中心区域
await page.mouse.click(400, 300);
// 断言右侧面板更新
await expect(page.getByRole("heading", { name: "坐标详情" })).toBeVisible();
```

**推荐 e2e 测试覆盖场景**：


| 场景                   | 机制  | 验证方式                            |
| -------------------- | --- | ------------------------------- |
| 页面加载，地图正常渲染          | A   | `data-zoom-level` 存在且为初始值 `"1"` |
| 滚轮放大 → zoom level 增加 | A   | `data-zoom-level` 变为 `"2"`      |
| 右键拖拽 → 摄像机移动         | B   | `cameraScrollX` 发生变化            |
| 点击画布 tile → 选中       | C   | 右侧面板显示对应坐标                      |
| 导航到某地块 → 人物移动        | A   | `data-char-tile` 最终变为目标格        |


---

## 10. 实现路线图

### MVP 基线（与已验证 Demo 等价）

- 用真实 tileset PNG 替代程序生成色块（`public/maps/tilesets/` + `content/maps/tilesets/registry.json`）
- Phaser Scene 的 `preload` + `create` 支持 sprite sheet 铺砖，配置 `pixelArt: true`
- 4 级 Zoom + 以鼠标为中心的缩放补偿 + LOD 切换（在 Tween 回调中而非 update 每帧）
- 右键拖拽摄像机
- Canvas resize 监听（ResizeObserver + `game.scale.resize()`）
- 人物移动轨迹（250ms/格 Tween + 橙色轨迹线）
- Hover tooltip（500ms 延迟，含地形和区域名）
- 点击 → 右侧面板联动
- HTML 语义层（`pointer-events: none`，仅键盘 a11y）
- DOM data attributes 桥接（供 e2e 测试）

### Later（后续迭代）

- 贴图动画（水面波纹、旗帜飘动）
- 迷雾效果（未探索区域蒙版，逐格揭示动画）
- 地图编辑器模式（`editorMode: true`，拖拽绘制地形）
- 多人物同屏碰撞避让优化（当前 4 槽偏移已够用，扩展时增加偏移槽）
- `game.scale.resize()` 替代 Phaser Game 完全重建（减少探索后地图扩展的闪白）
- 区域 hover 时同区域格子高亮联动

---

## 11. 关键设计决策

1. **Phaser 4 而非手写 Canvas API**：Phaser 提供 Camera（世界边界、缩放、平移）、Tween（平滑动画）、Group（批量管理）、Input（pointer / keyboard 统一）等能力，自行实现成本过高。
2. **HTML 语义层设为 `pointer-events: none`**：Phaser 独占所有鼠标输入，HTML 层只处理键盘 a11y。这是 hover tooltip 和右键拖拽正常工作的前提；e2e 点击测试改用 `page.mouse.click(x, y)` 直接点击画布坐标。
3. **全量重绘而非 Diff 优化**：每次 `updateState` 时全量重建 GameObjects。`elapsedGameSeconds` 以约 1Hz 驱动更新，64 格下性能可接受。若未来窗口超过 200 格，再考虑 `StaticGroup` 或脏标记优化。
4. **React 持有业务状态，Phaser 只负责渲染**：`setZoomLevel` / `setSelectedTileId` 通过 React `useState` 管理，Phaser Scene 不持有业务状态。保证 React DevTools 可观测，避免双向同步问题。
5. **stateRef 避免闭包陷阱**：`stateRef.current = props` 在每次 render 同步，Phaser 事件回调通过 `stateRef.current` 访问最新 props。
6. **游戏时间驱动插值（非 wall clock）**：`getCrewMarkerPosition` 使用 `elapsedGameSeconds` 而非 `Date.now()`，自动与游戏时间倍率（1x/2x/4x/8x）联动——游戏加速时人物动画也同步加快。
7. **区域名不绑定固定形状**：区域（areaName）由 content JSON 中每个 tile 的 `areaName` 字段决定，可以是任意不规则形状，地图上不绘制区域边界线。
8. **贴图在 `content/` 元数据 + `public/` 文件分离**：registry.json 编译时 import，PNG 文件运行时通过 URL 加载，符合"内容数据与代码解耦"原则，也满足 Vite 的静态资源服务要求。
9. **e2e 测试不用截图**：通过 DOM data attributes（机制 A）+ `window.__mapTestState`（机制 B，仅 dev 模式）+ 直接画布点击（机制 C）覆盖 Phaser 黑箱 canvas 的测试盲区，无 baseline 维护成本。
10. **LOD 在 Tween 回调中切换而非 `update()` 每帧**：避免每帧都调用 `setVisible()`，减少不必要的 GL 状态切换。
11. **懒加载 Phaser**：`import("phaser")` 动态导入，非地图页面不受 Phaser（~1MB gzip 后）影响。

