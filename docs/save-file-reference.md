# SlaySP2Manager 存档文件说明

## 1. 适用目录

以下说明适用于 Slay the Spire 2 的档位目录：

- 本地档位根目录：`%APPDATA%/SlayTheSpire2/steam/<SteamID64>/profileN/`
- Modded 档位根目录：`%APPDATA%/SlayTheSpire2/steam/<SteamID64>/modded/profileN/`

云缓存中的目录结构与之基本对应：

- `remote/profileN/...`
- `remote/modded/profileN/...`

## 2. 核心文件

### `saves/progress.save`

这是档位的长期进度文件。

通常可以在这里看到：

- 角色长期进度
- `max_ascension`
- `preferred_ascension`
- `current_streak`
- 一些解锁、统计、事件计数

如果这个文件回退，就会出现：

- A 几解锁不对
- 偏好难度回退
- 连胜、统计、部分长期进度不对

#### `progress.save` 关键字段详解

##### `character_stats`

这是长期角色进度的主体字段，通常是一个数组，每个元素对应一个角色。

典型内容会包含：

- `id`
- `max_ascension`
- `preferred_ascension`
- `current_streak`
- `best_win_streak`
- `total_wins`
- `total_losses`
- `playtime`

它的用途是：

- 保存这个档位下每个角色的长期统计
- 保存每个角色当前能使用到的 Ascension 上限
- 保存游戏 UI 默认给这个角色预选的 Ascension

如果这个字段整体回退，最常见的表现就是：

- 某个角色的长期战绩变旧
- A 几解锁状态看起来倒退
- 连胜和游玩时间变成较早数据

##### `id`

这个字段表示角色 ID。

例如：

- `CHARACTER.IRONCLAD`
- `CHARACTER.SILENT`
- `CHARACTER.REGENT`

它只是标识“这一条统计属于谁”，本身不携带进度。

##### `max_ascension`

这是该角色当前档位的最高已解锁 Ascension。

它回答的是：

- 这个角色在当前档位里最高解锁到 A 几

它不回答：

- 当前这一把局是以 A 几开的

那是 `current_run.save` 或 `history/*.run` 里的 `ascension` 去描述的。

所以排障时一定要分清：

- `progress.save.max_ascension` 是长期解锁状态
- `current_run/history.ascension` 是某一把局的运行难度

##### `preferred_ascension`

这是游戏界面在开新局时默认帮你选中的 Ascension。

它更像“上次使用偏好”或“UI 记忆值”，不是严格意义上的解锁值。

可能出现的情况是：

- `max_ascension` 没变
- 但 `preferred_ascension` 回退了
- 导致你看起来像是“默认难度不对”

##### `current_streak`

这是当前连续胜场。

它属于长期统计，不属于当前地图进度。

如果它回退，说明：

- 档位长期统计回退了
- 不说明当前继续游戏位置发生了什么

##### `best_win_streak`

这是历史最佳连胜。

它只影响长期统计展示，不影响当前局继续游戏。

##### `total_wins` / `total_losses`

这是角色累计胜负场数。

如果这两个值回退，通常说明：

- `progress.save` 不是最新
- 但不一定说明 `history/*.run` 也缺

因为历史记录文件和长期统计文件可能不同步。

##### `playtime`

这是该角色累计游玩时长统计。

它主要用于长期档位统计和 UI 展示，不决定当前关卡。

##### `ancient_stats`

这是事件、古神、遭遇相关的长期统计集合。

它常用于记录：

- 某些事件出现后的胜负统计
- 角色与特定事件/遭遇的交互结果

它通常不是恢复“能不能继续游戏”的关键字段，但在判断长期档位是否完整时有参考价值。

### `saves/current_run.save`

这是当前正在进行中的单局进度文件。

通常可以在这里看到：

- `current_act_index`
- `acts`
- `ascension`
- `map_point_history`
- 当前地图和路线状态

如果这个文件缺失或回退，就会出现：

- “继续游戏”进度不对
- 当前在第几幕、第几层不对
- 当前局难度、地图、路线回到更早状态

#### `current_run.save` 关键字段详解

##### `current_act_index`

这是当前正在进行中的 Act 索引，通常从 `0` 开始。

常见理解方式：

- `0` 表示当前在第一幕
- `1` 表示当前在第二幕
- `2` 表示当前在第三幕

它回答的是：

- 继续游戏时现在处在哪一幕

它不回答：

- 这一把总共经历了哪些幕
- 历史里曾经打过哪几幕

这类信息通常由 `acts` 或历史记录共同补充。

##### `acts`

这是当前这把局的 Act 配置列表。

在 `current_run.save` 里，它通常比历史文件里的 `acts` 更详细，因为每个元素往往不是单纯字符串，而是一个对象，里面可能带有：

- `id`
- 房间池
- 精英池
- 事件池
- `saved_map`

它回答的是：

- 这把局现在有哪些 Act 结构
- 每一幕对应的地图和房间配置是什么

它比 `current_act_index` 更偏向“整局配置”，而不是“当前进行到了哪一幕”。

##### `ascension`

这是当前正在进行中的这一把局的 Ascension 难度。

它表示：

- 如果现在继续这把局，是按 A 几继续

它不等于长期解锁状态。

所以如果你看到：

- `current_run.save.ascension = 4`
- 但 `progress.save.max_ascension` 显示不对

那就说明当前局快照和长期档位状态已经分裂了。

##### `saved_map`

这是当前局地图快照。

它通常记录：

- 地图尺寸
- 每个点的坐标
- 点的类型
- 点与点之间的连线
- Boss 节点

它的作用是：

- 决定继续游戏时地图如何显示
- 决定当前路线还能走到哪里

如果这部分回退，常见表现是：

- 地图路线不对
- 某些已经走过的节点又像没走过
- 当前地图状态和你记忆中的局面不一致

##### `map_point_history`

这是当前这一把局已经走过的节点历史。

它通常会记录：

- 走过哪些点
- 每个点是什么类型
- 在该点发生的战斗、事件、商店、休息
- 卡牌、遗物、金币、血量变化

它和 `saved_map` 的区别可以简单理解成：

- `saved_map` 更像“当前地图全貌”
- `map_point_history` 更像“已经走过的轨迹和发生过的事”

如果它和 `saved_map` 不匹配，或者和你的进度记忆不一致，继续游戏就会显得很怪。

##### `seed`

这是这把局生成时使用的随机种子。

它的作用主要是：

- 让同一把局的随机内容可复现
- 保证地图、战斗、奖励等按同一套随机序列生成

通常它不是你肉眼判断恢复与否的第一指标，但如果 `seed` 变了，而别的字段又没有同步更新，当前局就很容易变得不自洽。

##### `map_drawings`

这是地图绘制相关的序列化字段，通常表现为压缩后的长字符串。

它更偏向渲染和地图可视化缓存，不是第一优先级的人类可读字段。

排障时可以把它理解为：

- 地图显示层的附加状态

一般情况下：

- 不建议只手改这个字段
- 恢复时应和整份 `current_run.save` 一起恢复

### `saves/history/*.run`

这是历史回合记录文件。

每个 `.run` 文件描述一把已经结束或归档的历史记录，通常可以在里面看到：

- `acts`
- `ascension`
- `build_id`
- `map_point_history`
- 战斗和奖励记录

要点：

- `history/*.run` 只决定“历史记录里有没有这把”
- 它不决定当前档位的“继续游戏”状态
- 所以会出现“历史里有数据，但当前关卡进度不对”

#### `history/*.run` 关键字段详解

##### `acts`

这是这把历史回合经历过的幕列表，按顺序记录。

典型形式类似：

```json
"acts": ["ACT.OVERGROWTH", "ACT.HIVE", "ACT.GLORY"]
```

它的含义是：

- 这把回合走过哪些 Act
- 顺序是什么
- 最终至少推进到了哪一幕

它能帮助你判断：

- 这把是不是只打了第一幕就死了
- 这把是不是打到了第二幕、第三幕
- 这份历史记录大概属于什么阶段的局

但它不能单独回答：

- 当前还在第几层
- 这把当前停在地图哪一个节点
- 现在“继续游戏”会从哪里继续

因为这些属于当前局状态，主要由 `current_run.save` 决定，不由历史文件决定。

##### `ascension`

这是这把回合运行时使用的 Ascension 难度快照。

典型形式类似：

```json
"ascension": 4
```

它的含义是：

- 这把历史局是以 A4、A5 还是别的难度开的
- 它记录的是“这把局当时的难度”

它能帮助你判断：

- 这把历史局到底是哪个 Ascension 难度
- 你看到的历史记录和当前档位难度是否一致

但它不能单独证明：

- 当前档位已经解锁到 A4
- 当前 `progress.save` 里的 `max_ascension` 一定也是 4

因为：

- 历史局里的 `ascension` 是这把局的运行参数
- 长期解锁状态仍然主要看 `progress.save`

也就是说，完全可能出现：

- 历史里有一把 `ascension: 4`
- 但 `progress.save` 回退后，档位显示的长期难度进度不一致

##### `build_id`

这是生成这份历史记录时的游戏版本标识。

典型形式类似：

```json
"build_id": "v0.99.1"
```

它的用途主要是排障，不是游戏内长期进度的一部分。

它能帮助你判断：

- 这把历史局是在哪个版本打出来的
- 为什么不同 `.run` 文件结构略有差异
- 某些字段为什么只在新版本出现
- 云端和本地是不是混入了不同版本生成的历史记录

在排查问题时它尤其有用：

- 如果历史文件来自旧版，而当前存档来自新版
- 你就可能看到字段结构、卡牌 ID、事件 ID、统计内容不完全一致

但 `build_id` 不决定：

- 当前关卡
- 当前继续游戏位置
- 长期档位解锁

##### `map_point_history`

这是这把局最有信息量的字段之一。

它记录的是整把局的路线历史和每个地图点上发生过的事情。通常会包含：

- 经过了哪些地图点
- 地图点类型是什么
  例如 `monster`、`elite`、`event`、`shop`、`rest`
- 每个点发生了什么战斗或事件
- 卡牌奖励选择
- 遗物选择
- 金币变化
- 血量变化
- 卡组变化

它本质上更接近“完整回合轨迹”，而不是一个简单摘要。

在历史文件里，它通常用于回答这些问题：

- 这把局具体走了哪条路线
- 某层打了什么怪
- 某次事件做了什么选择
- 某张牌是哪一层拿到的
- 某件遗物是哪次事件或战斗拿到的

但要注意：

- `map_point_history` 很详细，不适合只靠肉眼快速比较新旧
- 它非常适合做“这把历史局是否完整”的判断
- 它不适合代替 `current_run.save` 去判断当前继续游戏位置

简单说：

- `history/*.run` 里的 `map_point_history` 是“这把已经归档的局曾经发生过什么”
- `current_run.save` 里的相关地图字段才是“现在继续游戏会接着什么位置玩”

### `saves/current_run_mp.save`

这是多人或并行运行相关的当前局文件。

目前单机排查时通常不是第一优先级，但同步时建议和 `current_run.save` 一起保留，不要只复制其中一个。

#### `current_run_mp.save` 关键字段详解

从实际结构看，它通常也会包含：

- `acts`
- `acts[].id`
- `acts[].rooms`
- `acts[].saved_map`

它和 `current_run.save` 的关系更像：

- 另一份与当前局相关的运行时快照
- 某些模式下对 `current_run.save` 的补充状态
- 房间池、地图池、访问计数等运行信息的并行记录

##### `acts`

这里通常也是一个 Act 列表，但内容更偏向房间池、遭遇池和地图生成状态，而不只是“当前打到第几幕”。

它回答的是：

- 当前这把局每一幕用了哪套房间配置
- 某些事件池、遭遇池已经消费到什么程度
- 多人或特殊模式下地图相关状态是否还自洽

如果它和 `current_run.save` 不是同一时刻的快照，就可能出现：

- 地图和遭遇池状态互相对不上
- 继续游戏后某些房间、事件或遭遇显得异常

##### `acts[].id`

这个字段表示该段配置属于哪一幕。

例如：

- `ACT.OVERGROWTH`
- `ACT.HIVE`
- `ACT.GLORY`

它本身不记录你当前停在第几层，而是标识“这一段房间配置对应哪一幕”。

##### `acts[].rooms`

这是 `current_run_mp.save` 里很关键的一块。

它通常会记录：

- `ancient_id`
- `boss_id`
- `second_boss_id`
- `elite_encounter_ids`
- `normal_encounter_ids`
- `event_ids`
- `boss_encounters_visited`
- `elite_encounters_visited`
- `normal_encounters_visited`
- `events_visited`

它更偏向“这一幕还能抽到什么、已经消费了什么”的运行态缓存。

它的用途是：

- 维持当前局房间池和遭遇池的一致性
- 记录某些 Ancient / Boss / Event 的抽取上下文
- 让继续游戏时的房间生成和路线逻辑保持自洽

所以它一旦回退，常见表现不是“历史没了”，而是：

- 当前局继续时遇到的内容和预期不一致
- 地图相关逻辑显得像是混进了另一份旧快照

##### `acts[].saved_map`

这一块和 `current_run.save` 里的 `saved_map` 类似，也是在保存当前地图的某个快照视图。

通常会带有：

- `boss`
- `height`
- `width`
- `points`

它主要解决的是：

- 当前局地图如何继续显示
- 某些节点还能不能走
- 已生成的地图结构是否与房间池状态一致

因此恢复时要遵守一个原则：

- 不要只恢复 `current_run.save` 或只恢复 `current_run_mp.save`
- 如果你想恢复当前局，就应把它们视为同一组快照
- 如果你不想恢复当前局，就两个都不要恢复

排障时的原则是：

- 单机问题优先看 `current_run.save`
- 但恢复或复制时不要故意漏掉 `current_run_mp.save`

因为如果只恢复一半，可能出现：

- 当前局一部分状态来自新文件
- 另一部分状态来自旧文件
- 最终继续游戏时表现异常

### `saves/prefs.save`

这是该档位下的偏好设置文件。

通常包含：

- UI 选项
- 快速模式
- 文本效果
- 上传数据等偏好

它不是核心进度文件，但完整备份时建议一起保留。

#### `prefs.save` 关键字段详解

它主要保存的是该档位相关的偏好设置，而不是通关、地图或 Ascension 进度。

从实际内容看，常见字段包括：

- `fast_mode`
- `long_press`
- `mute_in_background`
- `schema_version`
- `screenshake`
- `show_card_indices`
- `show_run_timer`
- `text_effects_enabled`
- `upload_data`

##### `fast_mode`

这是快速模式相关设置。

它影响的是：

- 动画、结算、战斗反馈的节奏感
- 你进入游戏后体感是不是“还是原来的手感”

它不影响：

- 历史回合
- Ascension 解锁
- 当前关卡或继续游戏位置

##### `long_press`

这是长按交互相关偏好。

它属于输入和操作手感设置，不属于存档进度。

##### `mute_in_background`

这是窗口切后台时的音频偏好。

它只影响体验，不影响进度。

##### `schema_version`

这是偏好文件自己的结构版本号。

它主要用于：

- 让游戏知道如何解释这份 `prefs.save`
- 在新旧版本之间兼容不同的偏好字段

通常不建议手改。

##### `screenshake`

这是屏幕震动强度相关设置。

它属于纯 UI / 体感偏好，不参与任何进度判断。

##### `show_card_indices`

这是是否显示卡牌序号之类的界面偏好。

它只影响显示方式。

##### `show_run_timer`

这是是否显示计时器的偏好。

它只影响界面展示，不影响真实运行时长统计。

##### `text_effects_enabled`

这是文本特效开关。

它只影响观感，不影响存档内容。

##### `upload_data`

这是数据上传或遥测相关偏好。

它不决定 Steam Cloud 是否同步成功，也不决定游戏本地存档是否完整。

常见用途包括：

- 记住界面选项
- 记住是否快速模式
- 记住一些显示和交互偏好

恢复时可以这样理解：

- 缺它通常不会导致“正常游戏进度丢失”
- 但可能导致手感、显示、偏好配置回到默认或旧状态

## 3. 为什么会出现“历史有，但关卡进度不对”

最常见的原因是：

1. `history/*.run` 被同步到了
2. 但 `current_run.save` 没同步到，或者被旧缓存覆盖
3. 或者 `progress.save` 被回退，导致长期进度和难度状态不一致

所以不能只看 `history`，至少要同时检查：

- `progress.save`
- `current_run.save`
- `history/*.run`

## 4. 判断“最新数据”时该看什么

如果你关心的是不同类型的数据，判断方式不同：

- 当前关卡/继续游戏：优先看 `current_run.save`
- A 几、长期档位进度：优先看 `progress.save`
- 历史回合是否完整：看 `history/*.run`

这三类文件必须分开判断，不能用其中一个替代另外两个。

## 5. 自动备份目录

SlaySP2Manager 当前会把备份放在：

- 档位备份：`%APPDATA%/SlaySP2Manager/backups/saves/`
- 云缓存备份：`%APPDATA%/SlaySP2Manager/backups/cloud_cache/`

其中：

- `backups/saves/` 适合恢复本地档位
- `backups/cloud_cache/` 适合回看当时 Steam Cloud 本地缓存是什么状态

## 6. 恢复时的建议顺序

如果你要找回“真正最新”的可玩数据，建议按下面顺序判断：

1. 先看目标备份里是否有 `current_run.save`
2. 再看同一份备份里的 `progress.save`
3. 最后看 `history` 里是否包含你关心的 `.run`

如果一份备份只有 `history/*.run`，那它只能证明历史记录较新，不能证明当前关卡进度也较新。

## 7. 如果你只想恢复长期进度，不想恢复当前局

这时思路应该和“找回继续游戏”完全分开。

你真正应该关心的是：

- `progress.save`
- `history/*.run`

你应该明确排除的是：

- `current_run.save`
- `current_run_mp.save`

因为你不想恢复当前局，就不应该把当前局快照再写回去。

### 7.1 文件选择原则

如果目标是恢复：

- A 几解锁
- 角色长期统计
- 历史回合

那么优先级应当是：

1. 先找 `max_ascension` / `preferred_ascension` 正确的 `progress.save`
2. 再找历史最完整的 `history/*.run`
3. 不要为了保留当前局而把 `current_run.save` 一起带回去

### 7.2 为什么长期进度和历史回合可能要来自不同备份

这是很常见的情况。

例如：

- 备份 A 的 `progress.save` 更正确
- 但备份 B 的 `history` 更全

这并不矛盾，因为：

- `progress.save` 决定长期解锁和累计统计
- `history/*.run` 决定历史回合列表里有哪些局
- 它们本来就不是同一个文件

所以“长期进度恢复”完全可能是：

- 从较早但正确的备份恢复 `progress.save`
- 从较新的备份恢复 `history/*.run`

### 7.3 如何判断哪份 `progress.save` 更值得信任

优先看这些指标：

- `character_stats[].max_ascension`
- `character_stats[].preferred_ascension`
- `character_stats[].best_win_streak`
- `character_stats[].total_wins`
- `character_stats[].total_losses`
- `character_stats[].playtime`

如果两份 `progress.save` 冲突：

- `max_ascension` 更高的一般更接近真实长期解锁
- `best_win_streak`、`total_wins`、`total_losses`、`playtime` 更大的通常更接近新数据
- 但 `current_streak` 不一定越大越新，因为它会随失败归零

### 7.4 如何判断哪份 `history` 更完整

最直接的方法是：

- 比 `.run` 文件数量
- 比文件名集合
- 比你关心的那几把局是否存在

如果一份历史目录里包含更多 `.run`，通常它更值得保留。

### 7.5 恢复后的预期

如果你只恢复长期进度而不恢复当前局，那么恢复后应该出现的是：

- 角色 Ascension 解锁状态回到正确值
- 历史回合列表恢复
- 角色长期统计恢复
- “继续游戏”入口要么不存在，要么是你当前机器上保留下来的另一份局

这不是异常，而是你有意放弃当前局快照后的正常结果。
