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
    map-template.json
  events/
    event-template.json
  portraits/
    portrait-template.json
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
