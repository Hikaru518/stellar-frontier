# ASCII Asset Format

这份格式用于给 ASCII 地图、事件画面、人物头像建立统一的保存方式，方便后续平滑接入游戏。

## 通用字段

```json
{
  "id": "asset_id",
  "type": "map|event_scene|portrait",
  "width": 48,
  "height": 20,
  "palette": "apple2",
  "fps": 6,
  "frames": [
    ["frame line 1", "frame line 2"]
  ]
}
```

## 字段说明

- `id`
  稳定 ID，用于后续在运行时引用
- `type`
  素材类型：`map`、`event_scene`、`portrait`
- `width` / `height`
  单帧字符尺寸，所有帧保持一致
- `palette`
  调色板名称，例如 `phosphor`、`apple2`、`amber-crt`
- `fps`
  动画帧率；单帧素材也保留该字段，便于统一渲染逻辑
- `frames`
  帧数组；每一帧由字符串数组组成，每个字符串是一行

## 推荐额外字段

### 地图

```json
{
  "regions": [],
  "landmarks": [],
  "notes": "map-specific metadata"
}
```

### 事件画面

```json
{
  "title": "主线 1A / 坠毁倒计时",
  "meta": "核心失压 / 备用电源临界 / 生命支持倒计时",
  "caption": "点名、分工、首轮回收：先活下来，再谈探索。"
}
```

### 人物头像

```json
{
  "states": {
    "idle": [0],
    "blink": [1, 2, 1, 0],
    "talk": [3, 4, 3, 0]
  }
}
```

## 嵌入游戏时的建议

1. 地图底图、事件图、头像都按统一 renderer 渲染
2. 动画只依赖 `frames + fps`
3. UI 文案单独保存，不混进素材本体
4. 正式运行时从 `content/` 读取，不直接读取 `art/`
