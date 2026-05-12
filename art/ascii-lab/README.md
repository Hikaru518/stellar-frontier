# ASCII Lab

`art/ascii-lab/` 用来保存 ASCII art / animation 的探索稿和可嵌入游戏的参考素材。

这里不直接作为运行时内容读取，而是作为：

- 视觉探索区
- 素材规范区
- 未来转入 `content/` 或 `assets/` 的中间层

## 目录约定

```text
art/ascii-lab/
  README.md
  ascii-asset-format.md
  maps/
    radar/default-map-radar.json
    ascii/default-map-base.json
    ascii/buildings/*.json
    ascii/symbols/*.json
  events/
  portraits/
```

## 保存原则

1. 探索稿先放在 `art/ascii-lab/`
2. 一旦要正式接进游戏，再转成：
   - `content/`：结构化 ASCII 数据
   - `assets/`：位图 / gif / 视频预览
3. 不把最终运行时逻辑直接写死在 HTML 里

## 推荐工作流

1. 在 `art/style-exploration/` 里试风格和界面
2. 在 `art/ascii-lab/` 里沉淀单个素材
3. 选定版本后，转成 `content/` 可读取的 JSON

## Viewer 调试方式

`ascii-viewer.html` 现在支持两类预览：

1. **ASCII Lab 文件库**：点击“选择项目目录”，选中仓库根目录后，viewer 会自动读取 `art/ascii-lab/maps/` 并递归列出其中的 JSON 文件。勾选一个文件后点“打开选中”可预览单资产；勾选 radar 和多个 asset 后会自动合成地图。
2. **地图合成预览**：选中项目目录后，viewer 会自动加载 `radar/default-map-radar.json`、`ascii/default-map-base.json`、`ascii/buildings/*.json` 和 `ascii/symbols/*.json` 并合成地图；也可以手动勾选文件后点击“打开选中”重组。
3. **Building Placement**：右侧面板会列出 radar 建筑层里的已放置 building。选中一项后可以改 `asset`、`x`、`y`、`tone`，也可以用方向按钮微调；中间地图和 JSON 预览会同步更新。

合成预览会按游戏里的顺序渲染：底图、建筑层、focus / crew 样例图标。Focus 和 crew 只放在 origin 附近作为图标检查，不代表实际运行时队员位置。

Viewer 里的 `GLITCH` 开关使用接近游戏地图页的横向扰动和噪声块效果，用来确认 ASCII 资产在故障扫描下仍然可读。`显示空格` 可用于检查透明留白和固定宽度。

## 同步到运行时内容

当 `art/ascii-lab/maps/` 里的地图工作稿确认后，用下面的命令同步回 `content/maps/`：

```bash
npm run ascii:sync-map
```

同步前想先看会复制哪些 JSON，可以用：

```bash
npm run ascii:sync-map:dry-run
```

脚本只复制 / 覆盖 `radar` 和 `ascii` 下的 JSON 文件，不会删除 `content/maps/` 里的其他文件。
