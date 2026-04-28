# 原始输入

用户消息：

```text
@.opencode/skills/game-design-brainstorm 
@event_editor.md (1-12)
```

引用文件：`tmp/event_editor.md`

```text
我期望实现一个策划的 editor 页面.

当前所有的内容都是由 json 实现的。由于这些游戏的事件才是策划实际工作的内容，因此我需要有一个 editor

1. 我期望有一个 editor 供策划使用。这和游戏是两个不同的入口。在这一次我们只先做一个 event editor。可以来查看和编辑事件。
2. 可以更方便地展示现在的 content 下的 event 数据，具体请看 docs/game_model 和 content 下的内容。
3. 虽然不是游戏，但是整体美学也要遵循 docs/ui-designs/ui-design-principles.md
4. 这个 event editor 不是玩家可以游玩到的内容，而是方便策划和开发人员可视化现在的 event，也方便进行修改和新增。也可以更方便地查看 event schema
5. 后续可能还有 character editor，map editor, item editor, npc editor 等等，我期望这些 game editor 共享同一个 game editor 的网页入口，但不是 src 入口。我们可以单独放到一个叫做 editor 的项目根目录下
7. 编辑和输出的的内容在 content 目录内。
```
