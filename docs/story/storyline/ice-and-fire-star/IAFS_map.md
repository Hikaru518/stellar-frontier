# IAFS Map (Story Extract)

本文件根据 `IAFS_story.md` 与 `IAFS_wiki.md` 提取当前已出现地点，并记录其在地图中的相对位置。

## 1) 坐标约定（叙事地图）

- 当前采用临时网格假设：`256 x 256`
- 临时原点：`(128,128)` = 队伍坠毁初始落点（位于 [灰烬霜带] 区域内）
- 方向（临时约定）：
  - `+Y`（向上）朝冷端（冰原）
  - `-Y`（向下）朝热端（火山地界）
  - `+X/-X` 用于区分同纬度点位（故事中未给绝对方位）
- 说明：
  - 本文件记录的是“剧情可用临时位置”，不是运行时最终 tile 坐标。
  - 若某地点证据不足，可填写 `TBD`，后续由正式地图覆盖。
  - `position_confidence`：`high` / `medium` / `low` 表示方位置信心。

## 2) 主区域与聚落

| location_id | 地点 | 区域类型 | 相对位置（叙事） | suggested_coord | position_confidence | 来源 |
| --- | --- | --- | --- | --- | --- | --- |
| `reg_ashfrost_belt` | [灰烬霜带] | 交界主区域（region） | 冰火交界中央带，为一片带状区域而非单点 | `bbox: (96,96) -> (160,160)` | high | `IAFS_story.md` 第一阶段开场；`IAFS_wiki.md` 交界设定 |
| `loc_crash_site` | 坠毁初始落点 | 交界子点位（point） | 位于 [灰烬霜带] 区域中心附近，主线开场点 | `(128,128)` | high | `IAFS_story.md` 第一阶段开场 |
| `loc_frostbay_settlement` | [霜湾聚落] | 聚落（冷端） | 位于交界北侧冷端，稳健落脚点 | `(128,168)` | high | `IAFS_story.md` 第一阶段选择；`IAFS_wiki.md` 聚落设定 |
| `loc_cinderforge_settlement` | [烬炉城寨] | 聚落（热端） | 位于交界南侧热端，激进推进点 | `(128,88)` | high | `IAFS_story.md` 第一阶段选择；`IAFS_wiki.md` 聚落设定 |
| `reg_gate_realm` | [门域] | 终局关键区域（region） | 位于交界带外缘深处，为多层结构区域而非单点 | `bbox: (140,136) -> (188,184)` | medium | `IAFS_story.md` 第三阶段主线；`IAFS_wiki.md` 门域设定 |

## 2.1) [灰烬霜带] 区域结构（region -> points）

- region id: `reg_ashfrost_belt`
- region type: 交界带状区域（冷热通量冲突区）
- temporary bounds: `bbox: (96,96) -> (160,160)`
- key points in region:
  - `loc_crash_site`（坠毁初始落点）
  - `loc_old_border_route`（交界旧路，支线 01/03 高相关）
  - 第三阶段门域接近线的外围节点（与 `loc_gate_realm` 相邻）
- map authoring note:
  - 事件触发（如 `arrival/proximity/idle_time`）优先按“区域 + 子点位”双层判定，避免把 [灰烬霜带] 误建成单 tile 点。

## 2.2) [门域] 区域结构（潜入玩法）

- region id: `reg_gate_realm`
- region type: 高复杂度多层区域（潜入/沟通/驱逐共用）
- temporary bounds: `bbox: (140,136) -> (188,184)`
- 设计原则：
  - [门域] 必须按“外层警戒 -> 过渡层节律 -> 核心层控制”分层，不可简化成单一目标点。
  - 潜入玩法依赖“子区域连通 + 盲区窗口 + 巡逻节律”，因此每个子区域都需要独立触发与风险标签。

### 门域子区域清单

| location_id | 子区域 | 层级 | suggested_coord | position_confidence | 潜入/玩法意义 |
| --- | --- | --- | --- | --- | --- |
| `loc_gate_outer_perimeter` | 外围警戒环 | 外围层 | `bbox: (140,136) -> (172,168)` | medium | 高巡逻密度；用于盲区测绘、首次接触与试探行动 |
| `loc_gate_patrol_corridor` | 巡逻回廊 | 外围层 | `(156,152) -> (176,164)` | low | 巡逻路径重叠区；失败时最易触发追击事件 |
| `loc_gate_transition_band` | 节律过渡带 | 过渡层 | `bbox: (160,152) -> (180,172)` | medium | 七拍语法实测区；误译/误判会抬升警戒值 |
| `loc_gate_spore_front` | 孢子前沿带 | 过渡层 | `bbox: (168,148) -> (184,166)` | low | 与 [孢子禁区] 联动；决定是否出现“回潮”惩罚 |
| `loc_gate_control_nexus` | 核心控制结点 | 核心层 | `(180,176)` | low | 驱逐线的封停目标点，成功可短时夺取控制权 |
| `loc_gate_phase_chamber` | 相位校准腔 | 核心层 | `(176,180)` | low | 潜入/沟通线关键参数提取点（相位钥、校准式） |

### 门域连通与风险注记

- 推荐连通骨架（临时）：
  - `loc_gate_outer_perimeter -> loc_gate_transition_band -> loc_gate_control_nexus`
  - `loc_gate_outer_perimeter -> loc_gate_patrol_corridor -> loc_gate_phase_chamber`
- 高风险瓶颈：
  - `loc_gate_patrol_corridor`（追击触发高）
  - `loc_gate_spore_front`（环境惩罚叠加高）
- 事件建模建议：
  - 潜入分支优先绑定外围层/过渡层点位。
  - 沟通分支优先绑定过渡层节律点位。
  - 驱逐分支优先绑定核心层控制点位。

## 3) 霜湾侧地点（冷端）

| location_id | 地点 | 相对位置（叙事） | suggested_coord | position_confidence | 地图功能 |
| --- | --- | --- | --- | --- | --- |
| `loc_windbarrier_towers` | [风障塔列] | 霜湾外缘，接近冷端观测线 | `(112,184)` | medium | 风向与窗口预判数据源 |
| `loc_ice_shell_workshop` | [冰壳工坊] | 霜湾聚落内部工艺区 | `(128,168)` | medium | 冷端防具加工与工艺交换 |
| `loc_stilltide_depot` | [静潮仓] | 霜湾后勤区 | `(140,164)` | medium | 断供记录、补给调度线索 |

## 4) 烬炉侧地点（热端）

| location_id | 地点 | 相对位置（叙事） | suggested_coord | position_confidence | 地图功能 |
| --- | --- | --- | --- | --- | --- |
| `loc_meltwell_corridor` | [熔井回廊] | 烬炉中层矿道核心 | `(112,72)` | medium | 热流脉冲日志与税档取证 |
| `loc_red_anvil_works` | [赤砧工场] | 烬炉锻造核心区 | `(128,88)` | medium | 耐热装备/核心部件制造 |
| `loc_ashbridge_station` | [灰桥驿台] | 烬炉外联与撤离节点 | `(140,92)` | medium | 外联货单与战斗撤离终点 |

## 5) 支线高频地点

| location_id | 地点 | 关联支线 | 相对位置（叙事） | suggested_coord | position_confidence |
| --- | --- | --- | --- | --- | --- |
| `loc_spore_quarantine` | [孢子禁区] | 支线 04 | 门域外围，靠近 `loc_gate_spore_front` | `(156,148)` | medium |
| `loc_abandoned_fairy_node` | [妖精节点]（弃巢） | 支线 05 | 门域外围废墟群，建议与外围警戒环相邻 | `TBD` | low |
| `loc_old_border_route` | [灰烬霜带] 旧路 | 支线 01/03 | 交界带旧通道，连接霜湾与烬炉（region 内线性子路径） | `(128,144) -> (128,112)` | medium |
| `loc_hightemp_corridor` | 高温走廊（最后一班矿车） | 支线 07 | 烬炉外侧高热矿道 | `TBD` | low |

## 6) 位置推断备注

- [温带母村] 在设定上位于 [灰烬霜带] 北缘（历史地点），建议仅作为“历史图层”标注，不作为当前可达点。
- [霜爆-热浪] 是环境机制，不是固定地点；在地图上应作为“动态危险图层”。
- 第三阶段 A/B/C 在主线中作为“可选支线分支”出现，实际地图活动区主要围绕 [门域] 外围与双聚落联络线展开。

## 7) 后续对接建议

- 若进入事件资产化阶段，可把本表 `location_id` 用作 event 文档中的统一地点别名。
- 当运行时地图（`content/maps/*.json`）给出正式坐标后，把本文件 `suggested_coord` 视为临时值并批量替换为真实 tile 坐标。
