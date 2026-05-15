# IAFS side 11: Scavenger Sentry Line Contact

## Meta

- event_id: `iafs_scavenger_sentry_line_contact`
- line_type: `side`
- unique_id: `11`
- source_anchor: `IAFS_story.md` -> `### 支线 03：灰烬拾荒者（交界带）` / 拾荒营地前置接触
- target_file: `IAFS_side_11_scavenger-sentry-line-contact.md`
- tone: `戒备（夹缝营地的第一道线）`

## Narrative Intent

- 让拾荒营地作为靠近坠毁点的可选地点，先以戒备和封营状态出现。
- 建立白噪作为临时哨兵的第一印象。
- 只呈现“营地有事瞒着”，不在本事件揭露难民、证据或后续庇护线真相。

## Tone Narrative

队员抵达拾荒营地外围时，没有马上进入营地。废料板和遮风布把入口压成一道线，线后有人拽住警铃绳，语气比动作更紧。

白噪没有问你是不是外来者，也不知道坠毁点发生了什么。他只看见一个陌生人靠近正在封闭的营地，于是先把对话压在线外：报名字、来路、找谁，少答一样就当麻烦。

玩家此时只能决定第一反应：先观察里面的动静，强硬压回去，老实表明身份，或顺着白噪的话套出“今天为什么特别不想见客”。无论哪种，本事件都只记录开场态度，为后续庇护霜湾难民的事件留下入口。

## Event Journey

### Prologue: 线外问话

- Trigger
  - `trigger.type`: `arrival`
  - recommended source action: 队员抵达拾荒营地外围 tile。
  - trigger tiles: `91-115`, `91-116`, `91-117`, `92-115`, `92-116`, `92-117`
- Condition
  - 至少 1 名队员抵达哨线覆盖范围。
  - 本事件在世界范围内未触发过。
- Event Node
  - `sentry_challenge` (`call`): 白噪在线外拦截并要求报名字、来路、找谁。
- Choice
  - `opt_observe`: 停在线外观察。
  - `opt_threaten`: 强硬要求对方放下警铃。
  - `opt_negotiate`: 表明没有敌意，说明来意。
  - `opt_chat`: 顺着白噪的话套问近况。
- Consequence
  - 写入 `iafs_scavenger_sentry_opening_choice` world flag。
  - 后续庇护霜湾难民事件可读取该首轮态度。

## Event Graph Reference

| node_id | node_type | purpose | next |
| --- | --- | --- | --- |
| `sentry_challenge` | `call` | 白噪哨线问话与首轮回应 | option mapping to terminal nodes |
| `end_observe` | `end` | 记录观察态度 | terminal |
| `end_threaten` | `end` | 记录强硬态度 | terminal |
| `end_negotiate` | `end` | 记录交涉态度 | terminal |
| `end_chat` | `end` | 记录套话态度 | terminal |

terminal_node_ids:

- `end_observe`
- `end_threaten`
- `end_negotiate`
- `end_chat`

## Call Template Notes

- `call_template_id`: `iafs_scavenger_sentry_line_contact.call.sentry_challenge`
- opening line:
  - `站住。线外说话，手别乱动。报名字、来路、找谁。少答一样，我就当你是麻烦。`
- `option_lines` key set:
  - `opt_observe`
  - `opt_threaten`
  - `opt_negotiate`
  - `opt_chat`

## Outcome & Mainline Coupling

- 本事件不推进主线任务，也不强制玩家进入拾荒营地后续线。
- 它把拾荒营地从“火锅支线地点”前置为灰烬霜带政治夹缝的世界观入口。
- 后续事件可继续展开“拾荒营地是否庇护霜湾难民”的核心矛盾；已有“灰烬拾荒者”火锅支线更适合在玩家取得营地信任之后触发。

