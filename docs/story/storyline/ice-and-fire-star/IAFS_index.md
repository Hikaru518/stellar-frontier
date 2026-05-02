# IAFS Story-Event Index

本文件用于把 `IAFS_story.md` 中的主线与支线拆成可独立维护的 story-event 条目。

## 1) 命名与状态约定

- `line_type`：`main` / `side`
- `status`：`todo` / `in_progress` / `done`
- `priority`：`P0` / `P1`

## 2) 主线清单

| line_type | unique_id | story_event | source_anchor | target_file | status | priority |
| --- | --- | --- | --- | --- | --- | --- |
| main | 1A | 第一阶段开场：坠毁与生存倒计时 | `IAFS_story.md` -> 第一阶段 `### 开场局势` | `IAFS_main_1A_crash-countdown.md` | todo | P1 |
| main | 1B | 第一阶段推进：线索判读与聚落接触 | `IAFS_story.md` -> 第一阶段 `### 情境/冲突/选择` | `IAFS_main_1B-trace-routing-to-settlement.md` | todo | P1 |
| main | 2A | 第二阶段开场：双区调查启动 | `IAFS_story.md` -> 第二阶段 `### 开场局势` | `IAFS_main_2A_dual-zone-investigation-init.md` | todo | P1 |
| main | 2B | 第二阶段推进：聚落与周边取证 | `IAFS_story.md` -> 第二阶段 `### 情境/冲突` | `IAFS_main_2B_settlement-perimeter-investigation.md` | todo | P1 |
| main | 2C | 第二阶段结算：样本与坐标碎片成型 | `IAFS_story.md` -> 第二阶段 `### 选择/后果/阶段收束` | `IAFS_main_2C_sample-and-shard-consolidation.md` | todo | P1 |
| main | 3A | 第三阶段开场：门域首次接触 | `IAFS_story.md` -> 第三阶段 `### 开场局势/### 情境（前半）` | `IAFS_main_3A_gate-contact-setup.md` | todo | P0 |
| main | 3B | 第三阶段推进：策略分流与双证据冲突 | `IAFS_story.md` -> 第三阶段 `### 情境（后半）/### 冲突` | `IAFS_main_3B_strategy-fork-and-evidence-conflict.md` | todo | P0 |
| main | 3C | 第三阶段结算：策略组合进入终局前置 | `IAFS_story.md` -> 第三阶段 `### 后果/阶段收束` | `IAFS_main_3C_branch-combination-pre-endgame.md` | todo | P0 |
| main | 4A | 第四阶段开场：离场窗口与解释分裂 | `IAFS_story.md` -> 第四阶段 `### 开场局势` | `IAFS_main_4A_departure-window-and-interpretation-split.md` | todo | P1 |
| main | 4B | 第四阶段执行：终局行动链与强制抉择 | `IAFS_story.md` -> 第四阶段 `### 情境/### 冲突/### 选择` | `IAFS_main_4B_final-operation-chain.md` | todo | P1 |
| main | 4C | 第四阶段结算：终局结果与章节遗留状态 | `IAFS_story.md` -> 第四阶段 `### 后果/阶段收束` | `IAFS_main_4C_endings-and-carryover-state.md` | todo | P1 |

## 3) 支线清单

| line_type | unique_id | story_event | source_anchor | target_file | status | priority |
| --- | --- | --- | --- | --- | --- | --- |
| side | 01 | 失温婚约（霜湾） | `IAFS_story.md` -> `### 支线 01：失温婚约（霜湾）` | `IAFS_side_01_frozen-vow.md` | done | P0 |
| side | 02 | 火井税单（烬炉） | `IAFS_story.md` -> `### 支线 02：火井税单（烬炉）` | `IAFS_side_02_firewell-tax-bill.md` | done | P0 |
| side | 03 | 灰烬拾荒者（交界带） | `IAFS_story.md` -> `### 支线 03：灰烬拾荒者（交界带）` | `IAFS_side_03_ashland-scavengers.md` | done | P0 |
| side | 04 | 孢子禁区（门域外围） | `IAFS_story.md` -> `### 支线 04：孢子禁区（门域外围）` | `IAFS_side_04_spore-quarantine-zone.md` | todo | P1 |
| side | 05 | 妖精弃巢（生态观察） | `IAFS_story.md` -> `### 支线 05：妖精弃巢（生态观察）` | `IAFS_side_05_fairy-abandoned-nest.md` | todo | P1 |
| side | 06 | 双村停火（社会线） | `IAFS_story.md` -> `### 支线 06：双村停火（社会线）` | `IAFS_side_06_dual-settlement-ceasefire.md` | todo | P1 |
| side | 07 | 最后一班矿车（战斗撤离） | `IAFS_story.md` -> `### 支线 07：最后一班矿车（战斗撤离）` | `IAFS_side_07_last-minecart-evac.md` | todo | P1 |
| side | 08 | 盲区测绘（第三阶段策略分支） | `IAFS_story.md` -> `支线 A：盲区测绘` | `IAFS_side_08_blind-zone-mapping.md` | todo | P0 |
| side | 09 | 七拍语法（第三阶段策略分支） | `IAFS_story.md` -> `支线 B：七拍语法` | `IAFS_side_09_seventh-beat-protocol.md` | todo | P0 |
| side | 10 | 边境清剿（第三阶段策略分支） | `IAFS_story.md` -> `支线 C：边境清剿` | `IAFS_side_10_border-purge.md` | todo | P0 |

## 4) 与 Wiki 同步提示

- `IAFS_wiki.md` 的“支线与主线耦合（当前生效）”章节需要在每条 story-event 完成后回填文件映射。
- 当 `status` 从 `todo` 变为 `done` 时，同步更新：
  - `IAFS_story.md`（替换为链接 + 精简摘要）
  - `IAFS_wiki.md`（耦合摘要不变，补 `target_file`）
