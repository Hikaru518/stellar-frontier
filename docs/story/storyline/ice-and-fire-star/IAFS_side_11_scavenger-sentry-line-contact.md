# IAFS side 11: Scavenger Sentry Line Contact

## Meta

- event_id:
  - `iafs_scavenger_camp_outer_discovery`
  - `iafs_scavenger_sentry_line_contact`
- line_type: `side_with_mainline_hook`
- unique_id: `11`
- source_anchor: `IAFS_story.md` -> `### 支线 03：灰烬拾荒者（交界带）` / 拾荒营地前置接触
- target_file: `IAFS_side_11_scavenger-sentry-line-contact.md`
- tone: `戒备（贫穷拾荒村落的第一道线）`

## Narrative Intent

- 把拾荒营地从地图上的单点，扩成“远看发现村落 -> 靠近哨线被拦”的两段式遭遇。
- 奥德赛号雷达装置修复后，雷达回报北侧疑似智慧文明活动，并解锁主线任务“与当地居民联系”；本事件承接这条主线的第一处北侧接触点。
- 外围阶段让队员主动打给指挥官，报告这是一个贫穷但有人组织的拾荒者村落，并请求下一步指示。
- 哨线阶段先由队员描述哨卫外貌、武器和接近动作，再让白噪发出拦截台词。
- 观察路线只让玩家听见“两派搜人”的片段；强硬路线让队员临时失联。不在本事件完整揭露难民、证据或后续庇护线真相。

## Tone Narrative

队员先在外圈看见一个低矮、拼接、贫穷的村落。建筑由旧舱板、岩片、废管和遮风布搭成，棚屋之间堆着整理过的零件、燃料罐和布包。外面的人衣着破旧，补丁一层压一层，但货堆、入口和帐篷之间有人维持秩序，说明这里不是一群临时散开的流民，而是一个拾荒者居住点。

如果指挥官让队员继续接近，队员抵达哨线时会先报告：外面有一个哨卫，灰白包巾、护目镜、旧隔热布外套，手边有警铃绳，腰侧有短柄钩刀，背后还有管枪式自制武器。哨卫正在朝队员走来，但不是冲锋。队员安抚指挥官：“先别急，我看得见他的手，问题还不大。”

随后白噪在线外问话：

> 站住。线外说话，手别乱动。报名字、来路、找谁。少答一样，我就当你是麻烦。

玩家可以选择观察、强硬、商量或套话。观察会听到村内正在争论霜湾的人、巡查队和烬炉；强硬会触发营地压制信号，队员临时失联。

## Event Journey

### 1. 外围发现

- Trigger
  - `trigger.type`: `arrival`
  - trigger tiles: `93-115`, `93-116`, `93-117`, `94-115`, `94-116`, `94-117`
- Event Node
  - `outer_report` (`call`): 队员主动打给指挥官，报告贫穷拾荒村落和可见物资。
- Choice
  - `opt_approach`: 继续接近，靠到外线可喊话的位置。
  - `opt_standby`: 先别靠近，原地继续观察。
- Consequence
  - 完成主线任务 `contact_local_residents` 的 `investigate_north_signal` 待办，并把任务节点推进到 `settlement_outer_contact`。
  - 写入 `iafs_scavenger_outer_discovery_choice = approach | standby`。
  - `opt_approach` 会立即派队员继续走向哨位中心 tile `92-116`，抵达后自然触发哨线问话。
  - `opt_standby` 不创建移动行动，队员留在外围继续观察。

### 2. 哨线问话

- Trigger
  - `trigger.type`: `arrival`
  - trigger tiles: `91-115`, `91-116`, `91-117`, `92-115`, `92-116`, `92-117`
- Event Node
  - `sentry_challenge` (`call`): 队员报告哨卫样貌、武器和接近动作；白噪拦线问话。
- Choice
  - `opt_observe`: 停在线外偷听。
  - `opt_threaten`: 强硬要求对方松开警铃绳。
  - `opt_negotiate`: 表明无敌意，说明问路、交易、交换情报的来意。
  - `opt_chat`: 顺着白噪的话套问近况。

### 3. 观察路线

- Node
  - `observe_eavesdrop` (`call`)
- Heard lines
  - “霜湾的人不能再留在后帐，巡查队今天会搜到边线。”
  - “交出去也是死，烬炉的人不会认账。”
- Consequence
  - 写入 `iafs_scavenger_sentry_opening_choice = observe`。
  - 玩家只知道营地夹在两股力量之间；不揭露完整庇护对象和证据。

### 4. 强硬路线

- Node
  - `threaten_backlash` (`call`)
- Heard lines
  - “那人是来压线的。”
  - “别让这路信号继续往外传。”
- Consequence
  - 写入 `iafs_scavenger_sentry_opening_choice = threaten`。
  - 写入 `iafs_scavenger_contact_lost = true`。
  - 给队员添加 `iafs_scavenger_signal_lost` condition。
  - PC 端显示该队员“失联。最后信号停在拾荒营地哨线。”，不可通话，但不死亡、不离开地图。

## Event Graph Reference

| event_id | node_id | node_type | purpose | next |
| --- | --- | --- | --- | --- |
| `iafs_scavenger_camp_outer_discovery` | `outer_report` | `call` | 外围发现村落并请求指示 | option mapping to terminal nodes |
| `iafs_scavenger_sentry_line_contact` | `sentry_challenge` | `call` | 哨卫描述、白噪问话与首轮回应 | option mapping |
| `iafs_scavenger_sentry_line_contact` | `observe_eavesdrop` | `call` | 偷听两派搜人线索 | `end_observe` |
| `iafs_scavenger_sentry_line_contact` | `threaten_backlash` | `call` | 强硬后听见压线与断讯 | `end_threaten` |

## Outcome & Mainline Coupling

- 本事件现在承接“与当地居民联系”主线：外围发现会确认北侧信号源是有组织的拾荒村落，并推进该主线的第一阶段。
- 它仍不强制玩家进入拾荒营地后续线；玩家可以在外围发现后选择保持距离，后续再决定是否靠近哨线。
- 它把拾荒营地前置为灰烬霜带政治夹缝的世界观入口。
- 后续事件可继续展开“拾荒营地是否庇护霜湾难民”的核心矛盾；已有“灰烬拾荒者”火锅支线更适合在玩家取得营地信任之后触发。
