# 地图编辑器策划体验 research topics

## 项目内探索

选择：需要探索。

原因：

- 本轮需要评估 `docs/plans/2026-05-01-22-43/` 中已有地图编辑器计划是否满足策划实际铺图体验。
- 本轮设计需要贴合当前 `assets/` 中 Kenney Tiny Battle 素材的组织方式、tile 粒度和图层样例。
- 本轮设计需要考虑当前 `content/maps` schema、地图 JSON、tileset registry、`apps/editor` helper/UI 模式，以及 PC Phaser 地图展示方式。

## 互联网探索

选择：需要探索。

探索主题：

- Tile map editor 的常见 authoring 交互：palette 选 tile、brush 点击 / 拖动绘制、eraser、fill、rectangle、eyedropper、undo / redo。
- 地图图层工作流：active layer、visible / lock / solo、opacity、图层顺序、按层预览。
- Tiled、LDtk 等成熟工具对 tileset、tile palette、layer 与 project/map 创建流程的处理方式。

原因：

- 本轮设计关注策划如何从素材库高效拼地图，互联网调研可以帮助避免只做出“能存 JSON”的工具，而忽视地图编辑器已有的用户习惯。
- 当前 assets 是 16px tile sheet 和独立 tile 图片，适合参考成熟 tile editor 的 palette + brush + layer 模式。
