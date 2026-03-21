# SlaySP2Manager `src-tauri` 模块骨架草案

## 1. 目标

这份文档不是最终代码，而是首版代码结构蓝图。

目标是：

- 先建立稳定边界
- 避免业务逻辑堆在 `commands.rs`
- 让安装、更新、存档这些事务流程有明确归属

## 2. 推荐目录结构

```text
src-tauri/
  Cargo.toml
  build.rs
  tauri.conf.json
  src/
    main.rs
    lib.rs
    app/
      mod.rs
      bootstrap.rs
      commands.rs
      events.rs
      state.rs
    domain/
      mod.rs
      backup.rs
      conflict.rs
      game.rs
      install_plan.rs
      mod_entity.rs
      profile.rs
      remote_mod.rs
      save.rs
      task.rs
      update.rs
    services/
      mod.rs
      backup_service.rs
      diagnostics_service.rs
      discover_service.rs
      game_service.rs
      mod_service.rs
      profile_service.rs
      save_service.rs
      task_service.rs
      update_service.rs
    workflows/
      mod.rs
      apply_profile_workflow.rs
      install_archive_workflow.rs
      install_remote_workflow.rs
      restore_backup_workflow.rs
      save_transfer_workflow.rs
      update_mod_workflow.rs
    integrations/
      mod.rs
      archive.rs
      db.rs
      filesystem.rs
      manifest.rs
      nexus_client.rs
      settings_repo.rs
      steam.rs
    repositories/
      mod.rs
      backups_repo.rs
      profiles_repo.rs
      settings_repo.rs
      tasks_repo.rs
    utils/
      mod.rs
      error.rs
      hash.rs
      path.rs
      time.rs
      version.rs
```

## 3. 每层职责

## 3.1 `app`

负责 Tauri 接入层。

内容包括：

- 应用启动
- 全局共享状态
- Tauri commands
- 事件广播
- 初始化配置和依赖

这一层不能直接写业务规则。

## 3.2 `domain`

负责纯业务模型定义。

应该放这里的内容：

- `GameInstall`
- `InstalledMod`
- `RemoteMod`
- `ModProfile`
- `SaveSlot`
- `BackupSnapshot`
- `TaskRecord`
- `ConflictReport`
- `InstallPlan`

这一层不应该依赖 Tauri。

## 3.3 `integrations`

负责与外部系统交互：

- 文件系统
- SQLite
- Steam 路径探测
- Nexus API
- 压缩包
- manifest 解析

这一层可以失败、可以重试、可以超时，但不负责业务编排。

## 3.4 `repositories`

负责数据库的领域化读写。

例如：

- `profiles_repo` 专门处理 Profile 表
- `tasks_repo` 处理任务与事件

优点是：

- SQL 不会散落
- service 和 workflow 更干净

## 3.5 `services`

负责提供稳定的业务接口。

例如：

- `mod_service` 负责扫描、启用、禁用、卸载
- `discover_service` 负责搜索和详情
- `save_service` 负责列出存档、备份、恢复

service 适合做聚合和映射，不适合写复杂事务。

## 3.6 `workflows`

负责多步骤、有风险的真实流程。

例如：

- 安装本地 zip
- 安装远程 Mod
- 更新 Mod
- 应用 Profile
- 复制存档
- 恢复备份

任何需要：

- 预检
- 备份
- 执行
- 校验
- 失败回滚

的流程，都应该进入 workflow。

## 4. 核心文件建议

## 4.1 `main.rs`

职责：

- 作为 Tauri 入口
- 注册 command
- 初始化 app state

建议保持极薄。

## 4.2 `lib.rs`

职责：

- 暴露模块
- 提供测试和复用入口

## 4.3 `app/state.rs`

建议维护：

- 数据库连接池
- 当前设置快照
- 当前游戏环境快照
- 任务总线
- 远程 provider 实例

示意：

```rust
pub struct AppState {
    pub db: Arc<Database>,
    pub settings: Arc<RwLock<AppSettings>>,
    pub task_hub: Arc<TaskHub>,
    pub nexus: Arc<NexusClient>,
}
```

## 4.4 `app/commands.rs`

只做三件事：

- 参数接收
- 调用 service 或 workflow
- 返回 DTO

不要在这里：

- 直接做文件写入
- 直接写 SQL
- 写长流程

## 4.5 `app/events.rs`

负责：

- workflow 进度事件结构
- 给前端发消息
- 统一 stage 命名

## 5. 模块级建议

## 5.1 `domain/game.rs`

建议包含：

- `GameInstall`
- `GameDetectSource`
- `GameStateSummary`

## 5.2 `domain/mod_entity.rs`

建议包含：

- `InstalledMod`
- `InstalledModState`
- `ModSource`
- `ParsedModPackage`

## 5.3 `domain/profile.rs`

建议包含：

- `ModProfile`
- `ProfileKind`
- `ProfileModEntry`
- `DesiredModState`

## 5.4 `domain/save.rs`

建议包含：

- `SaveKind`
- `SaveSlot`
- `SaveTransferPreview`

## 5.5 `domain/task.rs`

建议包含：

- `TaskRecord`
- `TaskType`
- `TaskStatus`
- `TaskEvent`

## 6. 关键 service 接口示例

## 6.1 `game_service.rs`

```rust
pub trait GameService {
    async fn detect_install(&self) -> Result<GameInstall, AppError>;
    async fn validate_install(&self, root: PathBuf) -> Result<GameInstall, AppError>;
    async fn scan_state(&self) -> Result<GameStateSummary, AppError>;
}
```

## 6.2 `mod_service.rs`

```rust
pub trait ModService {
    async fn list_installed(&self) -> Result<Vec<InstalledMod>, AppError>;
    async fn list_disabled(&self) -> Result<Vec<InstalledMod>, AppError>;
    async fn enable(&self, mod_id: &str) -> Result<(), AppError>;
    async fn disable(&self, mod_id: &str) -> Result<(), AppError>;
    async fn uninstall(&self, mod_id: &str) -> Result<(), AppError>;
}
```

## 6.3 `discover_service.rs`

```rust
pub trait DiscoverService {
    async fn search(&self, query: SearchQuery) -> Result<Vec<RemoteMod>, AppError>;
    async fn get_detail(&self, remote_id: &str) -> Result<RemoteMod, AppError>;
}
```

## 6.4 `save_service.rs`

```rust
pub trait SaveService {
    async fn list_slots(&self) -> Result<Vec<SaveSlot>, AppError>;
    async fn preview_transfer(
        &self,
        from: SaveRef,
        to: SaveRef,
    ) -> Result<SaveTransferPreview, AppError>;
}
```

## 7. workflow 模板建议

推荐所有 workflow 都采用相近骨架：

```rust
pub struct WorkflowContext {
    pub task_id: Uuid,
    pub started_at: DateTime<Utc>,
}

pub struct WorkflowResult<T> {
    pub success: bool,
    pub data: Option<T>,
    pub warnings: Vec<String>,
    pub rollback_performed: bool,
}
```

典型流程：

1. 创建任务记录
2. 做预检
3. 发事件
4. 做备份
5. 执行主动作
6. 校验结果
7. 成功写入结果
8. 失败自动回滚

## 8. 建议先落地的 commands

第一阶段建议只实现这些：

- `get_app_bootstrap`
- `detect_game_install`
- `list_installed_mods`
- `list_disabled_mods`
- `preview_install_archive`
- `install_archive`
- `enable_mod`
- `disable_mod`
- `uninstall_mod`
- `list_save_slots`
- `preview_save_transfer`
- `transfer_save`

这样能先跑通本地核心闭环。

## 9. DTO 与 domain 分离建议

不要让前端直接吃 domain 对象。

建议 `commands.rs` 返回 DTO：

- `InstalledModDto`
- `RemoteModDto`
- `ProfileDto`
- `SaveSlotDto`

原因：

- 避免泄露内部字段
- 保持 API 稳定
- 方便前后端演进

## 10. 错误处理建议

统一使用 `AppError`，不要到处 `String`。

建议：

- domain 返回语义错误
- integrations 包装底层 IO 或网络错误
- command 层映射成可展示的前端错误对象

## 11. 测试目录建议

```text
src-tauri/
  tests/
    install_archive.rs
    update_mod.rs
    save_transfer.rs
    profile_apply.rs
```

每个测试用临时目录模拟：

- 游戏目录
- mods 目录
- disabled 目录
- save 目录
- zip 输入源

## 12. 首批模块实现顺序

建议顺序：

1. `utils/error.rs`
2. `domain/*`
3. `integrations/filesystem.rs`
4. `integrations/manifest.rs`
5. `integrations/archive.rs`
6. `services/game_service.rs`
7. `services/mod_service.rs`
8. `workflows/install_archive_workflow.rs`
9. `services/save_service.rs`
10. `workflows/save_transfer_workflow.rs`
11. `app/commands.rs`

## 13. V1 推荐保守决策

- 不把太多逻辑塞进一个 `mod_manager.rs`
- 不让前端直接参与路径和文件判断
- 不把 workflow 写成 command 内联流程
- 先完成本地闭环，再接 Nexus

## 14. 下一步最实际的产出

如果继续往前推，建议下一步直接生成：

- `src-tauri/src/domain/*.rs` 空文件骨架
- `src-tauri/src/app/commands.rs` 的命令签名
- `src-tauri/src/utils/error.rs` 的统一错误类型
