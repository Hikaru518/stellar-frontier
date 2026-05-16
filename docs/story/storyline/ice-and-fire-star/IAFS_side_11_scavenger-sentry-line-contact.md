# IAFS side 11: Scavenger Sentry Line Contact

## Meta

- event_id:
  - `iafs_scavenger_camp_outer_discovery`
  - `iafs_scavenger_sentry_line_contact`
  - `iafs_scavenger_supply_chief_callback`
  - `iafs_scavenger_heir_chief_invitation`
  - `iafs_scavenger_sentry_capture_callback`
  - `iafs_scavenger_sentry_control_negotiation`
- line_type: `side`
- unique_id: `11`
- source_anchor: `IAFS_story.md` -> `### 支线 03：灰烬拾荒者（交界带）` / 拾荒营地前置接触
- target_file: `IAFS_side_11_scavenger-sentry-line-contact.md`
- tone: `戒备（贫穷拾荒村落的第一道线）`

## Narrative Intent

- 把拾荒营地从地图上的单点，扩成“远看发现村落 -> 靠近哨线被拦”的两段式遭遇。
- 外围阶段让队员主动打给指挥官，报告这是一个贫穷但有人组织的拾荒者村落，并请求下一步指示。
- 哨线阶段先由队员描述哨卫外貌、武器和接近动作，再让白噪发出拦截台词。
- 观察与闲聊路线是一次性信息尝试：失败回到线外问话，成功发现营地缺维持性物资，飞船物资可成为进入村长对话的筹码。
- 强硬路线让队员临时失联。不在本事件完整揭露难民、证据或后续庇护线真相。

## Tone Narrative

队员先在外圈看见一个低矮、拼接、贫穷的村落。建筑由旧舱板、岩片、废管和遮风布搭成，棚屋之间堆着整理过的零件、燃料罐和布包。外面的人衣着破旧，补丁一层压一层，但货堆、入口和帐篷之间有人维持秩序，说明这里不是一群临时散开的流民，而是一个拾荒者居住点。

如果指挥官让队员继续接近，队员抵达哨线时会先报告：外面有一个哨卫，灰白包巾、护目镜、旧隔热布外套，手边有警铃绳，腰侧有短柄钩刀，背后还有管枪式自制武器。哨卫正在朝队员走来，但不是冲锋。队员安抚指挥官：“先别急，我看得见他的手，问题还不大。”

随后白噪在线外问话：

> 站住。线外说话，手别乱动。报名字、来路、找谁。少答一样，我就当你是麻烦。

玩家可以选择观察、强硬、商量或套话。观察或套话成功会暴露营地真正缺的是滤芯、保温层、维修件和应急食物；这让玩家意识到飞船物资可成为谈判筹码。观察失败或套话失败只回到线外问话，但对应信息选项不再重复出现。强硬会触发营地压制信号，队员临时失联。

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

### 3. 信息尝试路线

- `opt_observe`
  - 进入 `[感知]` 判定。
  - 失败：`observe_partial_failure` 后回到 `sentry_challenge`；写入 `iafs_scavenger_sentry_observe_tried = true`，该选项隐藏。
  - 成功：`observe_eavesdrop` 听到营地缺滤芯、保温层、维修料和食物，也听到霜湾 / 巡查队 / 烬炉片段。
  - 成功后若主动提出分担物资，会进入 `[运气]` 判定；成功进入等待村长回话，失败被哨卫怀疑是烬炉派来的人并回到 `sentry_challenge`。
- `opt_chat`
  - 进入 `[智力]` 判定。
  - 失败：`chat_suspicion` 后回到 `sentry_challenge`；写入 `iafs_scavenger_sentry_chat_tried = true`，该选项隐藏。
  - 成功：`chat_reply` 套出营地缺防寒、维修和食物类维持物资。
  - 成功后提出可以分担物资，哨卫会去找村长，让队员在线外等消息。
- 成功提出物资筹码时写入 `iafs_scavenger_supply_leverage_discovered = true`、`iafs_scavenger_supply_leverage_source = chat | eavesdrop`、`iafs_scavenger_chief_entry_reason = supply_offer_chat | supply_offer_eavesdrop`。
- 后续轻量事件 `iafs_scavenger_supply_chief_callback` 等待约 120 秒后回电，确认村长愿意听物资提议；确认后进入 `iafs_scavenger_chief_meeting`。

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

### 5. 进入村长会谈的入口

- 物资筹码
  - `iafs_scavenger_supply_chief_callback` 回电后，确认会进入 `iafs_scavenger_chief_meeting`。
  - 入口 reason 为 `supply_offer_chat | supply_offer_eavesdrop`。
- 家徽手帕
  - `iafs_scavenger_heir_chief_invitation` 中同意见村长后进入 `iafs_scavenger_chief_meeting`。
  - 入口 reason 为 `heir_handkerchief`。
  - 邀请中“观察哨兵的迟疑”是一次性感知检定；成功写入 `iafs_scavenger_sentry_doubts_read = true`，无论成功或失败都会写入 `iafs_scavenger_sentry_doubts_tried = true` 并隐藏该选项。
- 压制哨线
  - `iafs_scavenger_sentry_control_negotiation` 中选择进入房间、带哨卫进村或要求首领到哨站，确认后都会进入 `iafs_scavenger_chief_meeting`。
  - 入口 reason 分别为 `sentry_control_enter_room`、`sentry_control_enter_with_hostage`、`sentry_control_leader_to_post`。
  - 带哨卫进村时额外写入 `iafs_scavenger_has_sentry_hostage = true`。
- 被俘队员待救援
  - 见 `IAFS_side_12_scavenger-chief-meeting.md`：另一名未被俘队员返回哨线，会触发 `iafs_scavenger_captive_chief_invitation`。

## Event Graph Reference

| event_id | node_id | node_type | purpose | next |
| --- | --- | --- | --- | --- |
| `iafs_scavenger_camp_outer_discovery` | `outer_report` | `call` | 外围发现村落并请求指示 | option mapping to terminal nodes |
| `iafs_scavenger_sentry_line_contact` | `sentry_challenge` | `call` | 哨卫描述、白噪问话与首轮回应 | option mapping |
| `iafs_scavenger_sentry_line_contact` | `observe_eavesdrop` | `call` | 偷听缺物资与两派搜人线索 | `check_supply_offer_luck` |
| `iafs_scavenger_sentry_line_contact` | `chat_reply` | `call` | 套出缺物资并提出分担 | `supply_offer_wait` |
| `iafs_scavenger_sentry_line_contact` | `supply_offer_suspicion` | `call` | 偷听后提物资失败，被怀疑是烬炉线人 | `sentry_challenge` |
| `iafs_scavenger_supply_chief_callback` | `supply_chief_callback` | `call` | 村长愿意听取物资交换提议 | `iafs_scavenger_chief_meeting` |
| `iafs_scavenger_heir_chief_invitation` | `chief_invitation` | `call` | 家徽手帕后的村长邀请 | `iafs_scavenger_chief_meeting` or deferred |
| `iafs_scavenger_sentry_control_negotiation` | `control_parley` | `call` | 压制哨线后的谈判入口 | `iafs_scavenger_chief_meeting` |
| `iafs_scavenger_sentry_line_contact` | `threaten_backlash` | `call` | 强硬后听见压线与断讯 | `end_threaten` |

## Outcome & Mainline Coupling

- 本事件不推进主线任务，也不强制玩家进入拾荒营地后续线。
- 它把拾荒营地前置为灰烬霜带政治夹缝的世界观入口。
- 物资、家徽、压制哨线与人质待救援路线会进入统一 `iafs_scavenger_chief_meeting`；该事件只记录村长提出的后续合作要求，不在本轮消耗库存或解决人质状态。
- 后续事件可继续展开“拾荒营地是否庇护霜湾难民”的核心矛盾；已有“灰烬拾荒者”火锅支线更适合在玩家取得营地信任之后触发。
