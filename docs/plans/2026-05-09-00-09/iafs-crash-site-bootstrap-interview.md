# IAFS Crash Site Bootstrap Interview

## User Initial Request

让我们从头开始一步一步实现IAFS吧。首先让我们在4-4放一个坠毁地点，地点上几个对象：发电机，维生装置，穿梭机核心。然后我们在坠毁地点周围围一圈山阻挡玩家出去。以上三个对象都处于损坏状态，具有维修的action。在通话时选择维修后将进入维修事件。这几个维修事件都不需要额外的维修技能，而是根据人物的敏捷来做检定。（请跟我确认鉴定的计算公式）检定失败不会有负面效果，仅仅消耗了时间，玩家也可以再次进行维修。（请跟我确认如果有队员正在维修，另外的队员会如何跟该对象交互？）维修成功后暂时不提供新的功能，我们后续再加，仅仅改变对象的状态

## Clarification Round 1

### Assistant

是否需要在动手访谈前，先探索现有 docs（core-ideas、gameplay/、ui-designs/）？

### User

先扫描 docs

### Assistant

以下哪些方向值得做互联网研究？

### User

不用探索

### Assistant

先确认敏捷检定公式。你更倾向哪种？

### User

敏捷决定成功率，默认敏捷*20%-难度的概率，不同事件可单独配置ratio和bias，默认20%ratio与0的难度，即5点属性可保证100%成功。如果当前系统无法实现请告知我

### Assistant

如果一个队员正在维修该对象，其他队员应该如何交互？

### User

对象锁定，其他人不可修

## Follow-up Clarification

### Assistant

说明当前事件系统现状：类型与校验层存在 `probability` 结构，但运行时没有直接消费“属性参与公式后的动态成功率”；建议在本轮 IAFS 中按最小专用实现落地维修公式，而不是单开通用系统能力。

### User

ok,按你这么来吧。

### Assistant

展示第 2 节《设计意图（Design Intent）》供确认。

### User

好的

### User Follow-up

建议强调一下软失败只是说无状态改变，损耗的时间是指事件本身就需要的时间。

### Assistant

展示更新后的第 3 节与软失败措辞供确认。

### User

ok

### Assistant

展示第 10 节《Open Questions》供确认，并准备将策划案状态改为 approved。

### User

ok

### Assistant

展示第 5 节《机制与规则（Mechanics & Rules）》供确认。

### User

OK

### Assistant

展示第 9 节《参考与灵感（References & Inspiration）》供确认。

### User

ok

### Assistant

展示第 8 节《取舍与反模式（Design Trade-offs & Anti-patterns）》供确认。

### User

OK

### Assistant

展示第 7 节《关键场景（Key Scenarios）》供确认。

### User

OK

### Assistant

展示第 6 节《系统交互（System Interactions）》供确认。

### User

OK

### Assistant

展示第 4 节《核心循环与玩家体验（Core Loop & Player Experience）》供确认。

### User

ok
