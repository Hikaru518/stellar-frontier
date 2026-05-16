# IAFS side 12: Scavenger Chief Meeting

## Meta

- event_id:
  - `iafs_scavenger_captive_chief_invitation`
  - `iafs_scavenger_chief_meeting`
- line_type: `side`
- unique_id: `12`
- source_anchor: `IAFS_story.md` -> `### 支线 03：灰烬拾荒者（交界带）` / 拾荒营地村长会谈
- target_file: `IAFS_side_12_scavenger-chief-meeting.md`
- tone: `谨慎谈判（生存资源、身份担保与人质压力）`

## Narrative Intent

- 把所有通往村长的入口统一到一次会谈：物资筹码、家徽、压制哨线、带哨卫做人质、被俘队员待救援。
- 村长在会谈中推断并确认队员的飞船已经坠毁，但玩家只有限承认，不暴露飞船位置和完整库存。
- 村长不直接交付完整合作线，而是根据入口提出后续要求，写入后续入口 flags。
- 人质状态只会是一方持有人质：要么我方队员被关押，要么我方控制哨卫；不会出现双方同时交换人质的分支。

## Event Journey

### 1. 人质入口邀请

- Trigger
  - `trigger.type`: `arrival`
  - trigger tiles: `91-115`, `91-116`, `91-117`, `92-115`, `92-116`, `92-117`
  - requires `iafs_scavenger_captive_needs_rescue = true`
  - requires `iafs_scavenger_captive_callback_received = true`
  - primary crew must not have `iafs_scavenger_captive`
- Event
  - `iafs_scavenger_captive_chief_invitation`
- Choice
  - 同意见村长：写入 `iafs_scavenger_chief_entry_reason = captive_rescue`，进入 `iafs_scavenger_chief_meeting`。
  - 要求确认被俘队员状态：写入 `iafs_scavenger_captive_status_requested = true`，回到邀请选择。
  - 拒绝会谈：写入 `iafs_scavenger_captive_chief_invitation_refused = true`，救援目标保持待处理。

### 2. 统一村长会谈

- Event
  - `iafs_scavenger_chief_meeting`
- Entry flags
  - `iafs_scavenger_chief_entry_reason`
  - `iafs_scavenger_chief_entry_ready`
  - `iafs_scavenger_chief_entry_signal`
  - `iafs_scavenger_chief_meeting_crew`
  - `iafs_scavenger_chief_meeting_tile`
- Opening
  - 村长态度由入口决定：物资线偏交易试探；家徽线偏身份审视；劫持哨卫线偏敌意谈判；我方队员被关押时偏扣押筹码；烬炉怀疑会额外压上质疑。
  - 村长会指出飞船坠毁事实。玩家有限承认后写入 `iafs_scavenger_ship_crash_disclosed = true` 和 `iafs_scavenger_ship_crash_disclosure_level = limited`。

### 3. 合作要求优先级

- 我方队员被关押：村长要求先证明飞船物资或技术价值，才安排释放谈判。
- 我方带着哨卫做人质：村长要求先释放哨卫，才继续合作。
- 家徽路线：村长要求以家徽作担保，建立临时互信。
- 物资路线：村长要求承诺防寒、维修、食物等第一批维持物资。
- 普通 / 压制入营路线：村长要求放低武器、接受有限入营规则。

### 4. 会谈结果

- 接受：`iafs_scavenger_chief_deal_status = accepted`，`iafs_scavenger_chief_cooperation_pending = true`。
- 暂缓：`iafs_scavenger_chief_deal_status = deferred`，`iafs_scavenger_chief_cooperation_pending = true`。
- 拒绝：`iafs_scavenger_chief_deal_status = refused`，`iafs_scavenger_chief_cooperation_pending = false`。
- 所有结果都会写入 `iafs_scavenger_chief_cooperation_request`，用于后续任务分流。

## Outcome & Mainline Coupling

- 本轮不检查或消耗真实飞船库存。
- 本轮不释放被俘队员，也不真正移除被控制哨卫；只记录后续合作要求。
- 后续可按 `iafs_scavenger_chief_cooperation_request` 展开物资交付、技术证明、释放谈判、家徽担保或有限入营任务。
