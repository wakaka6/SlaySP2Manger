# SlaySP2Manager `remotecache.vdf` 说明

## 1. 这份文档讲什么

这份文档只聚焦 Steam Cloud 本地缓存元数据文件 `remotecache.vdf`。

目标是回答四个问题:

- 它是什么
- 它里面每个关键字段大概代表什么
- 它是怎么跟 `remote/` 目录一起工作的
- `SlaySP2Manager` 在做云同步准备时应该怎样处理它

这份文档讨论的是本机 Steam 客户端维护的缓存视图，不是 Steam 云服务器的私有状态。

## 2. 文件位置

对于 Slay the Spire 2:

- Cloud app 目录: `%STEAM%/userdata/<AccountID>/2868840/`
- Cloud 文件缓存目录: `%STEAM%/userdata/<AccountID>/2868840/remote/`
- Cloud 元数据索引: `%STEAM%/userdata/<AccountID>/2868840/remotecache.vdf`

可以把它理解成:

- `remote/` 是文件实体
- `remotecache.vdf` 是 Steam 对这批文件的本地索引快照

两者必须足够一致，Steam 后续的 `ValidateCache`、下载、上传、冲突判断才会稳定。

## 3. 它不是什么

`remotecache.vdf` 不是游戏存档本身。

它也不是“只要改了它，Steam 就会认账”的服务器提交凭证。

外部工具最多只能做到:

- 把本机 `remote/` 缓存整理成一个自洽状态
- 让 Steam 下次启动时更容易把这批文件识别为当前本地缓存

外部工具做不到:

- 直接伪造 Steam 云服务器已经接受了哪些文件
- 直接伪造服务器端的真实变更历史

## 4. 结构概览

典型结构类似:

```text
"2868840"
{
    "ChangeNumber"        "74"
    "ostype"              "0"

    "profile1/saves/progress.save"
    {
        "root"                "0"
        "size"                "149979"
        "localtime"           "1775347179"
        "time"                "1775347179"
        "remotetime"          "1775347179"
        "sha"                 "07cb7f746cf5e46f01fc9eaec8e30a4690dec4ba"
        "syncstate"           "1"
        "persiststate"        "0"
        "platformstosync2"    "-1"
    }
}
```

顶层 key 是 App ID, 对本游戏就是 `2868840`。

顶层下面有两类内容:

- 全局头字段
- 每个相对路径对应的一条文件记录

## 5. 顶层字段

### `ChangeNumber`

这是 Steam Cloud 当前缓存视图关联到的变更号。

可以把它理解成:

- Steam 客户端眼里“我现在大致同步到哪个云端版本了”

注意:

- 这个值和 Steam 服务器状态有关
- 外部工具可以读取它, 但不应该把它当成可以随便伪造的业务字段
- 伪造一个看起来更大的值, 不等于服务器真的接受了你的文件

在 `SlaySP2Manager` 里, 更稳妥的做法是:

- 如果已有旧的 `remotecache.vdf`, 重建时尽量保留它的 `ChangeNumber`
- 不把“改写 `ChangeNumber`”当成成功同步的依据

### `ostype`

这是 Steam 写入的操作系统类型字段。

对 Windows 常见值是 `0`。

这个字段不是存档内容字段, 只需要在重建时尽量保持原值即可。

## 6. 单个文件条目字段

每个文件条目的 key 是相对于 `remote/` 的路径, 例如:

- `profile1/saves/progress.save`
- `profile1/saves/history/1774025478.run`
- `modded/profile1/saves/progress.save`

### `root`

常见值是 `0`。

可以把它理解成 Steam Cloud 规则匹配到的根目录编号。对当前场景来说, 外部工具通常按现有值写回 `0` 即可。

### `size`

文件大小, 单位是字节。

它必须和 `remote/` 中真实文件大小一致。

如果不一致, Steam 很容易把这条记录判成旧索引。

### `localtime`

本地缓存中文件的时间戳。

实测上它通常和文件最后修改时间强相关。对外部工具而言, 最稳妥的做法是:

- 复制文件后把目标侧 mtime 对齐到源文件
- 用目标文件真实 mtime 生成 `localtime`

### `time`

这是 Steam 记录的时间字段之一。

离线观察时, 它经常与 `localtime` 相同, 但语义上更接近 Steam 维护的缓存状态时间。

外部工具不应该把它当成业务时间单独拍脑袋生成。实践上若必须重建, 用同一个真实文件 mtime 回填比乱写更稳妥。

### `remotetime`

这是 Steam 记录的远端相关时间字段。

离线重建时通常也只能回填为当前缓存文件的 mtime, 用来保持缓存自洽。

要注意:

- 这不代表服务器真的在该时间点接受了文件
- 它只是本机缓存索引中的一个字段

### `sha`

文件内容的 SHA-1。

这是 `remotecache.vdf` 里最关键的字段之一。

如果你把某个 `progress.save` 或 `.run` 文件替换了, 但没有同步更新 `sha`, Steam 很容易认为:

- 磁盘上的缓存和索引不一致
- 需要重新下载, 或者至少要重做缓存校验

### `syncstate`

常见值是 `1`。

可以把它理解成 Steam 当前缓存视图中的同步状态标记。外部工具不应该依赖它表达“服务器已确认上传成功”, 但在重建本地缓存索引时通常保持 `1` 更接近 Steam 生成的正常缓存。

### `persiststate`

常见值是 `0`。

它属于 Steam 自己的持久化状态字段。对离线缓存重建来说, 一般保持 `0` 即可。

### `platformstosync2`

常见值是 `-1`。

它和跨平台同步范围有关。当前项目不需要把它当成业务逻辑字段处理, 重建时沿用常见值即可。

## 7. `remotecache.vdf` 的构建方式

从外部工具视角, 它的正确构建方式不是“按想象拼字段”, 而是:

1. 枚举 `remote/` 下实际存在的全部文件
2. 对每个文件计算相对路径
3. 读取真实文件大小
4. 读取真实文件最后修改时间
5. 计算真实 SHA-1
6. 生成对应条目
7. 保留旧文件中的顶层 `ChangeNumber` 与 `ostype`
8. 用新的文件条目集合整体重写 `remotecache.vdf`

关键点在于“从 `remote/` 反推索引”, 而不是“先想好索引, 再假设磁盘会跟上”。

## 8. 为什么只复制存档文件还是会丢

这正是之前最容易踩的坑。

如果外部工具只是:

- 把本地 `progress.save` 复制到 `remote/`
- 甚至把整个 `profile1/` 或 `modded/profile1/` 复制进去

但没有同步处理 `remotecache.vdf`, 就可能出现:

- `remote/` 中已经是新文件
- `remotecache.vdf` 里还是旧大小/旧 SHA/旧时间

此时 Steam 启动后做 `ValidateCache`, 很可能会判断:

- 本地缓存视图不一致
- 这份文件不是我认可的当前缓存
- 需要重新下载, 或继续沿用旧的缓存判断结果

结果就是你明明“复制过去了”, 下一次启动游戏或 Steam 又把旧数据拉回来了。

## 9. 为什么时间戳也重要

只修 `sha` 还不够。

实测里, 游戏和 Steam 对本地文件修改时间也很敏感。典型问题是:

- 内容已经换成新文件
- 但目标文件 mtime 比源文件旧, 或和同批文件明显不一致

这会导致两类问题:

- Steam 在缓存校验阶段更容易认为缓存被外部篡改
- 游戏自己的云到本地复制逻辑可能把“时间更新的一侧”重新盖回来

所以比较稳妥的策略是:

- 复制完成后, 把目标文件 mtime 同步为源文件 mtime
- 再按这个真实 mtime 重建 `remotecache.vdf`

## 10. `SlaySP2Manager` 当前后端策略

当前项目在做整套云同步准备时, 后端应该遵循下面的顺序:

1. 确认游戏未运行
2. 备份本地存档目录
3. 备份整个 Steam cloud app 目录
4. 对 `remote/` 做文件复制
5. 复制后对齐目标文件 mtime
6. 根据 `remote/` 实际文件集合重建 `remotecache.vdf`
7. 再把结果交给 Steam 自己完成后续上传/下载/冲突收敛

需要特别强调:

- 这一步叫“准备本地 cloud cache”
- 不叫“伪造云端已同步成功”

## 11. 上行与下行的处理差异

### 本地到云缓存

更安全的方式是 merge copy:

- 把本地文件合并复制到 `remote/`
- 不要先清空 `remote/`

原因是:

- Steam 可能仍跟踪一些当前批次里没带上的文件
- 先清空再全量覆盖, 很容易把仍被索引引用的文件暂时删掉

### 云缓存到本地

云缓存下行到本地后, 也建议做一次时间戳对齐。

原因是:

- 用户启动游戏前, 本地目录应该尽量像一套自然产生的同批次文件
- 否则游戏启动时仍可能出现路径间的新旧判断错位

## 12. 不要做的事情

- 不要在 Steam 或游戏运行时改 `remote/` 和 `remotecache.vdf`
- 不要先清空 `remote/` 再镜像拷贝
- 不要只改 `progress.save` 不改索引
- 不要只改 `sha` 不处理时间戳
- 不要把 `ChangeNumber` 当成“可随便伪造的提交成功标志”
- 不要把 `remotecache.vdf` 当成比 `remote/` 更高优先级的真相源

## 13. 排查时怎么用它

当用户说“我明明恢复了, 启动又没了”, 优先检查:

1. `remote/` 里的目标文件内容是不是你想要的版本
2. `remotecache.vdf` 里的同路径 `size` 和 `sha` 是否一致
3. 目标文件 mtime 是否和源文件、同批文件处于合理范围
4. `cloud_log.txt` 是否出现:
   - `Need to download file`
   - `Need to upload file`
   - `ValidateCache`
   - `YldWriteCacheDirectoryToFile`

如果 `remote/` 正确但 `remotecache.vdf` 还指向旧值, 基本可以直接判定为缓存索引未修复。

## 14. 一个实用原则

对于 `SlaySP2Manager`, `remotecache.vdf` 最适合被当成:

- 一个必须与 `remote/` 保持一致的本地缓存索引

而不适合被当成:

- 一个可以脱离 `remote/` 独立编辑的“云同步成功证明”

一句话总结:

`remotecache.vdf` 必须从真实缓存文件反推生成, 不能脱离真实缓存文件单独伪造。`
