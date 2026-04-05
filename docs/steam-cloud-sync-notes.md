# SlaySP2Manager Steam 云存档同步机制与踩坑记录

## 1. 文档目的

这份文档面向 `SlaySP2Manager` 的维护者，用来说明 Slay the Spire 2 在 Steam Cloud 下的真实同步边界，以及为什么“直接复制文件”会导致看起来同步成功、实际下一次启动又被覆盖。

相关文档：

- [`remotecache.vdf` 专项说明](./remotecache-vdf-reference.md)

示例占位符：

- 本地存档根目录：`%APPDATA%/SlayTheSpire2/steam/<SteamID64>/`
- Steam Cloud 本地缓存：`%STEAM%/userdata/<AccountID>/2868840/remote/`
- Steam Cloud 元数据：`%STEAM%/userdata/<AccountID>/2868840/remotecache.vdf`
- Steam 客户端日志：`%STEAM%/logs/cloud_log.txt`

## 2. 三层存档结构

### 2.1 本地工作目录

游戏真正读取和写入的本地目录是：

`%APPDATA%/SlayTheSpire2/steam/<SteamID64>/`

这里通常包含：

- `profile.save`
- `settings.save`
- `profile1/...`
- `modded/profile1/...`

这是 `SlaySP2Manager` 做本地备份、槽位复制、原版/模组配对同步时应该优先信任的目录。

### 2.2 Steam Cloud 本地缓存目录

Steam 客户端会维护一份自己的 Cloud 缓存目录：

`%STEAM%/userdata/<AccountID>/2868840/remote/`

它不是“服务器真相”，而是 Steam 客户端用于上传、下载、校验和冲突判断的本地缓存层。

### 2.3 Steam Cloud 元数据目录

Steam 客户端还会在 `remote/` 同级维护：

`%STEAM%/userdata/<AccountID>/2868840/remotecache.vdf`

`remotecache.vdf` 不是游戏生成的存档文件，而是 Steam 客户端根据当前缓存状态构建出的索引。

它记录的信息包括：

- 相对路径
- 文件大小
- SHA-1
- 本地缓存时间
- 远端时间
- 同步状态
- 当前缓存视图对应的 `ChangeNumber`

## 3. 关键结论

### 3.1 `remote/` 不是云端真相

`remote/` 只是 Steam 在本机维护的缓存层。外部工具把文件复制进 `remote/`，不等于“服务器已经收到并接受了这些文件”。

### 3.2 `remotecache.vdf` 是状态机的一部分

Steam 不只看 `remote/` 目录里有没有文件，还会结合 `remotecache.vdf` 判断：

- 哪些文件原本应该存在
- 哪些文件是已同步状态
- 哪些文件需要上传
- 哪些文件需要下载

### 3.3 “先清空再整目录复制”是危险操作

如果外部工具先清空 `remote/`，再把本地文件整目录复制进去，就可能删掉：

- `remotecache.vdf` 仍然登记着的旧文件
- 远端仍存在、但本地快照里暂时没有的历史文件
- Steam 自己生成的缓存副本和备份文件

下一次 Steam 启动时，`ValidateCache` 会把这些缺失解释成“本地缓存缺文件，云端有变化”，然后反向下载，覆盖外部工具刚刚复制进去的内容。

### 3.4 启动期拉云和运行期写档不一定是同一套路径

对于 Slay the Spire 2，普通环境和模组环境可能分别使用：

- `profileN/...`
- `modded/profileN/...`

启动时同步、运行时写档、退出时上传，不一定总是在同一棵目录下进行。只比较单个 `progress.save` 或单个槽位，结论可能是错的。

## 4. Steam Cloud 的真实生命周期

根据 Steam 客户端日志和游戏日志，可以把同步过程概括为：

### 4.1 启动阶段

Steam 客户端会：

1. 读取旧的 `remotecache.vdf`
2. 校验 `remote/` 是否与缓存索引一致
3. 如有必要，执行下载
4. 重写 `remotecache.vdf`

对应日志中常见的关键字：

- `ValidateCache`
- `Need to download file`
- `Download complete`
- `Successfully synced to ChangeNumber ...`
- `YldWriteCacheDirectoryToFile`

### 4.2 游戏运行阶段

游戏通过 Steamworks 写入存档时，日志里通常会同时出现两类信息：

- 本地写入：`Wrote ... to path=user://...`
- 写入 Steam 远程存储：`Wrote ... in steam remote store`

这说明游戏自身是知道 Steam Cloud 的，不是单纯依赖 Steam 对目录做被动监听。

### 4.3 退出阶段

Steam 客户端会做一轮 exit sync：

- 扫描变化
- 组装 upload batch
- 上传有变化的文件
- 更新 `ChangeNumber`
- 重写 `remotecache.vdf`

## 5. `remotecache.vdf` 应该如何看待

### 5.1 可以依赖的字段

离线分析时，可以把这些字段当成比较可靠的缓存索引：

- `path`
- `size`
- `sha`
- `localtime`
- `syncstate`

### 5.2 不应该离线伪造为“同步成功”的字段

以下字段是 Steam 客户端和远端状态机交互后的结果，不应该由外部工具拍脑袋伪造：

- `ChangeNumber`
- `time`
- `remotetime`

如果外部工具试图手写这些值，把一个并未真正完成同步的缓存伪装成“已同步”，后续行为会非常不可控。

结论：

- `remotecache.vdf` 可以读取
- `remotecache.vdf` 不应该被当作“外部工具可稳定重建的提交成功凭证”

## 6. SlaySP2Manager 的推荐实现策略

## 6.1 上传到云端的正确理解

对外部工具来说，更准确的说法不是“直接上传到云端”，而是：

`准备 Steam Cloud 本地缓存，并等待 Steam / 游戏完成正式同步`

如果 UI 仍然保留“上传到云端”字样，内部实现也必须清楚这一步只是准备缓存，不是伪造服务器确认。

### 6.2 上传流程（本地 -> Cloud cache）

推荐顺序：

1. 确认 `Steam.exe` 和 `SlayTheSpire2.exe` 都未运行
2. 备份本地目录 `%APPDATA%/SlayTheSpire2/steam/<SteamID64>/`
3. 备份整个 `%STEAM%/userdata/<AccountID>/2868840/`
4. 只对 `remote/` 做“合并覆盖”，不要先清空目录
5. 复制完成后，重新比较本地目录与 `remote/` 的快照差异
6. 启动 Steam，让 Steam 自己完成后续状态收敛
7. 如有必要，再启动一次游戏并正常退出，让游戏自身再写一轮 Steam Remote Storage
8. 用 `cloud_log.txt` 和 `remotecache.vdf` 验收

### 6.3 下载流程（Cloud cache -> 本地）

推荐顺序：

1. 确认 `Steam.exe` 和 `SlayTheSpire2.exe` 都未运行
2. 备份本地目录
3. 备份整个 `%STEAM%/userdata/<AccountID>/2868840/`
4. 用 `remote/` 覆盖本地存档根目录
5. 完成后重新比较本地与 `remote/`，确认内容一致

### 6.4 绝对不要做的事情

- 不要在 Steam 或游戏运行时写 `remote/`
- 不要先清空 `remote/` 再整目录复制
- 不要手工伪造 `ChangeNumber`
- 不要把“文件复制成功”误判为“云端提交成功”
- 不要只同步一个 `progress.save` 就宣称整套存档同步完成

## 7. 启动游戏前的预检建议

用户点击“启动游戏”前，建议做一轮轻量预检。

### 7.1 检查目标

比较两棵目录：

- 本地：`%APPDATA%/SlayTheSpire2/steam/<SteamID64>/`
- 云缓存：`%STEAM%/userdata/<AccountID>/2868840/remote/`

### 7.2 对比维度

对每个相对路径收集：

- 是否存在
- 文件大小
- 文件哈希
- 修改时间

至少统计三类差异：

- `local_only`：只在本地存在
- `cloud_only`：只在云缓存存在
- `different`：两边都有，但内容不同

### 7.3 用户提示建议

如果存在差异，不要静默启动。应至少提示：

- 本地与 Steam Cloud 缓存不一致
- 差异数量
- 1 到 5 个样例路径
- 建议去存档页处理

推荐按钮：

- `前往存档页`
- `取消`
- `仍然启动`

这样既不会强制阻止高级用户，也能显著减少“点完启动才发现被云端回滚”的事故。

## 8. 上传/下载后的验收建议

外部工具完成一次云同步动作后，建议立即做验收，而不是直接显示“同步成功”。

### 8.1 本地级验收

检查以下项目：

- 本地目录与 `remote/` 的快照是否符合预期
- 关键文件哈希是否一致
- 是否出现意外缺失

### 8.2 Steam 级验收

如果后续已经启动 Steam，则继续检查：

- `%STEAM%/logs/cloud_log.txt`
- `%STEAM%/userdata/<AccountID>/2868840/remotecache.vdf`

重点关注：

- 是否出现 `ValidateCache ... missing from disk`
- 是否出现 `Need to download file ...`
- 是否出现 `Need to upload file ...`
- 是否出现新的 `Upload complete`
- 是否出现新的 `YldWriteCacheDirectoryToFile`

### 8.3 状态文案建议

比起直接显示“已上传到云端”，更稳妥的文案是：

- `Cloud cache prepared`
- `Steam reconciliation pending`
- `Local and cloud cache still differ`
- `Review before launch`

## 9. 已知踩坑清单

### 9.1 只复制本地档到 `remote/`，但不看 `remotecache.vdf`

结果：

- 下次 Steam 启动触发 `ValidateCache`
- Steam 认为云端有变化
- 反向下载覆盖外部复制结果

### 9.2 把 `remote/` 当成唯一真相

结果：

- 忽略了 `ChangeNumber`
- 忽略了同步状态
- 忽略了 Steam 的缓存重建逻辑

### 9.3 只同步普通档，不同步模组档

结果：

- 启动时拉回普通档
- 运行时却写入模组档
- 用户看到的“云同步状态”与真实运行路径不一致

### 9.4 只看 `progress.save`，不看整棵目录

结果：

- `history/*.run`
- `current_run*.save`
- `replays/latest.mcr`
- `.backup`

这些文件会丢状态，之后很容易出现局部回滚、历史缺失或当前局崩坏。

### 9.5 在运行中的 Steam 上改缓存目录

结果：

- Steam 和外部工具同时写缓存
- 时序不确定
- 后续行为不可预测

## 10. 对代码实现的最低要求

`SlaySP2Manager` 在涉及 Steam Cloud 时，最低要求应为：

- 云同步前强制确认 Steam 与游戏都已关闭
- 上传前同时备份本地存档和整个 Cloud App 目录
- 上传改为 merge copy，而不是 destructive mirror
- 下载后做本地一致性校验
- 启动游戏前做本地/云缓存差异检查
- 不在未完成 Steam 状态收敛时宣称“真正上传成功”

## 11. 后续可继续演进的方向

- 增加 `cloud_log.txt` 的解析器，自动提取最近一次 upload/download/validate 结果
- 增加 `remotecache.vdf` 解析器，展示关键字段而不是只显示“检测到云目录”
- 在存档页显示 `in sync / mismatch / unavailable` 三态
- 在启动游戏前展示差异摘要
- 为高风险操作提供“一键回滚到上一次 Cloud App 目录备份”

## 12. 一句话原则

对于 Slay the Spire 2：

`Steam Cloud 不是一个普通文件夹；它是一个带状态机的缓存系统。`

只复制文件，不理解状态机，就一定会在某些时序下丢档。
