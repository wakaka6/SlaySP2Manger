# SlaySP2Manager Rust + Tauri 架构设计草案

## 1. 文档目标

这份文档用于定义 SlaySP2Manager 的首版工程结构、模块边界、数据模型和演进路线。

目标不是一次性设计一个巨大框架，而是建立一个可以持续演进、可测试、可回滚的桌面端基础架构。

## 2. 技术方向

推荐技术栈：

- 桌面容器：Tauri 2
- 核心语言：Rust
- 前端：React + TypeScript
- UI：自定义设计系统，不直接依赖重型后台组件库
- 数据序列化：Serde
- 本地数据库：SQLite
- 异步运行时：Tokio
- 网络请求：Reqwest
- 压缩包处理：zip
- 文件校验：sha2 或 blake3
- 状态管理：前端使用轻量 store，后端保持命令式事务边界

## 3. 总体架构原则

- 核心业务逻辑尽量放在 Rust，而不是前端
- 前端负责展示、路由、轻状态和交互节奏
- 所有安装、更新、回滚、复制存档都通过后端事务服务执行
- 文件系统写入前必须先做预检
- 高风险操作必须可恢复
- 不让前端直接拼路径和处理底层文件

## 4. 建议的项目结构

```text
SlaySP2Manager/
  src-tauri/
    src/
      main.rs
      app/
        mod.rs
        state.rs
        commands.rs
        events.rs
      domain/
        mod.rs
        game.rs
        mod_entity.rs
        profile.rs
        save.rs
        backup.rs
        install_plan.rs
        conflict.rs
        update.rs
      services/
        mod.rs
        game_service.rs
        mod_service.rs
        profile_service.rs
        save_service.rs
        discover_service.rs
        update_service.rs
        diagnostics_service.rs
      integrations/
        mod.rs
        filesystem.rs
        steam.rs
        nexus_client.rs
        archive.rs
        manifest.rs
        settings_repo.rs
        db.rs
      workflows/
        mod.rs
        install_workflow.rs
        update_workflow.rs
        profile_workflow.rs
        save_transfer_workflow.rs
        restore_workflow.rs
      utils/
        mod.rs
        path.rs
        version.rs
        hash.rs
        time.rs
        error.rs
  src/
    app/
    pages/
    components/
    features/
    hooks/
    stores/
    lib/
    styles/
```

## 5. 分层说明

## 5.1 domain

定义稳定的数据对象和业务语义，不做 IO。

包含：

- 游戏安装信息
- 已安装 Mod
- 远程 Mod
- 配置方案
- 存档槽位
- 备份快照
- 安装计划
- 冲突报告
- 更新报告

这一层要尽量纯净，方便测试和重用。

## 5.2 integrations

处理所有外部系统交互：

- 文件系统
- Steam 路径探测
- Nexus API
- 压缩包解析
- manifest 读取
- 本地数据库
- 设置文件

这一层的职责是“拿数据”和“写数据”，不负责产品规则。

## 5.3 services

把 integrations 包成更稳定的业务服务接口。

例如：

- `mod_service` 负责扫描、启用、禁用、卸载
- `discover_service` 负责搜索和详情查询
- `save_service` 负责列出槽位和备份

这一层可以做聚合、过滤、状态映射，但不要承载复杂事务。

## 5.4 workflows

负责真正有风险、有步骤的流程。

例如：

- 安装 Mod
- 更新 Mod
- 应用 Profile
- 复制存档
- 恢复备份

任何需要“预检 -> 备份 -> 执行 -> 失败回滚 -> 记录结果”的行为，都应该进入 workflow。

## 5.5 app

负责 Tauri 层：

- 管理全局状态
- 暴露 commands
- 广播 events
- 注册插件

## 6. 前端结构建议

```text
src/
  app/
    App.tsx
    router.tsx
    providers.tsx
  pages/
    library/
    discover/
    profiles/
    saves/
    settings/
  features/
    mod-library/
    mod-discover/
    profile-manager/
    save-manager/
    updater/
    diagnostics/
  components/
    shell/
    data-table/
    detail-pane/
    action-bar/
    status-badge/
    confirm-dialog/
    empty-state/
  stores/
    app-store.ts
    library-store.ts
    discover-store.ts
    profile-store.ts
    save-store.ts
  lib/
    tauri.ts
    format.ts
    guards.ts
```

前端应采用“按功能切分”，而不是把所有页面逻辑堆在 `pages` 下。

## 7. Tauri 命令设计

建议命令分组如下：

### 7.1 应用与设置

- `get_app_bootstrap`
- `get_settings`
- `update_settings`

### 7.2 游戏检测

- `detect_game_install`
- `validate_game_install`
- `scan_game_state`

### 7.3 Mod 管理

- `list_installed_mods`
- `list_disabled_mods`
- `preview_install_archive`
- `install_archive`
- `enable_mod`
- `disable_mod`
- `uninstall_mod`
- `open_mod_folder`

### 7.4 发现与 Nexus

- `search_remote_mods`
- `get_remote_mod_detail`
- `check_mod_updates`
- `download_remote_mod`
- `install_remote_mod`

### 7.5 Profile

- `list_profiles`
- `create_profile`
- `update_profile`
- `duplicate_profile`
- `apply_profile`
- `export_profile`
- `import_profile`

### 7.6 存档

- `list_save_slots`
- `preview_save_transfer`
- `transfer_save`
- `list_backups`
- `restore_backup`

### 7.7 诊断

- `run_diagnostics`
- `export_diagnostics_bundle`

## 8. 事件设计

高耗时流程不要只靠同步命令返回，应通过事件汇报过程状态。

建议事件：

- `install/progress`
- `install/completed`
- `install/failed`
- `update/progress`
- `update/completed`
- `save-transfer/progress`
- `save-transfer/completed`
- `scan/refreshed`

统一事件结构建议：

```json
{
  "taskId": "string",
  "stage": "preflight | backup | download | extract | apply | rollback | done",
  "message": "string",
  "progress": 0.42,
  "payload": {}
}
```

## 9. 核心数据模型

以下是建议的核心实体。

## 9.1 GameInstall

```rust
pub struct GameInstall {
    pub root_dir: PathBuf,
    pub exe_path: PathBuf,
    pub mods_dir: PathBuf,
    pub detected_by: GameDetectSource,
    pub is_valid: bool,
}
```

## 9.2 InstalledMod

```rust
pub struct InstalledMod {
    pub id: String,
    pub name: String,
    pub version: Option<String>,
    pub author: Option<String>,
    pub folder_name: String,
    pub install_dir: PathBuf,
    pub manifest_path: Option<PathBuf>,
    pub source: ModSource,
    pub state: InstalledModState,
    pub local_hash: Option<String>,
}
```

`InstalledModState` 建议包括：

- Enabled
- Disabled
- UpdateAvailable
- Conflict
- Broken
- Unknown

## 9.3 RemoteMod

```rust
pub struct RemoteMod {
    pub remote_id: String,
    pub provider: RemoteProvider,
    pub name: String,
    pub summary: Option<String>,
    pub author: Option<String>,
    pub latest_version: Option<String>,
    pub updated_at: Option<DateTime<Utc>>,
    pub tags: Vec<String>,
    pub detail_url: String,
    pub download_url: Option<String>,
}
```

## 9.4 ModProfile

```rust
pub struct ModProfile {
    pub id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub kind: ProfileKind,
    pub entries: Vec<ProfileModEntry>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
```

```rust
pub struct ProfileModEntry {
    pub mod_id: String,
    pub expected_version: Option<String>,
    pub desired_state: DesiredModState,
}
```

## 9.5 SaveSlot

```rust
pub struct SaveSlot {
    pub steam_user_id: String,
    pub kind: SaveKind,
    pub slot_index: u8,
    pub path: PathBuf,
    pub has_data: bool,
    pub has_current_run: bool,
    pub file_count: usize,
    pub last_modified_at: Option<DateTime<Utc>>,
}
```

## 9.6 BackupSnapshot

```rust
pub struct BackupSnapshot {
    pub id: Uuid,
    pub backup_type: BackupType,
    pub created_at: DateTime<Utc>,
    pub source_path: PathBuf,
    pub backup_path: PathBuf,
    pub reason: BackupReason,
}
```

## 9.7 InstallPlan

```rust
pub struct InstallPlan {
    pub source: InstallSource,
    pub parsed_mods: Vec<ParsedModPackage>,
    pub conflicts: Vec<ConflictReport>,
    pub actions: Vec<PlannedAction>,
    pub requires_backup: bool,
    pub estimated_targets: Vec<PathBuf>,
}
```

## 10. 本地持久化设计

建议使用 SQLite 存业务元数据，文件系统存实际资源。

数据库可以存：

- 应用设置
- 历史任务
- Profile
- Nexus 缓存元数据
- 备份索引
- 活动日志

文件系统负责：

- 下载缓存
- 备份内容
- 导出的 Profile 包
- 诊断包

建议目录：

```text
%AppData%/SlaySP2Manager/
  app.db
  cache/
    downloads/
    nexus/
    manifests/
  backups/
    saves/
    mods/
  exports/
  logs/
```

## 11. Mod 管理策略

建议不要把启用和禁用只做成 UI 状态。

应该明确采用一种物理状态模型：

- `mods/` 表示启用
- `mods_disabled/` 表示禁用

或者：

- 维护单一仓库目录，再通过复制或链接激活

对于 V1，更建议采用双目录移动模型，理由是：

- 用户容易理解
- 跟参考实现一致
- 回滚和状态判断更简单
- 不依赖符号链接权限

## 12. 安装事务设计

安装流程不应直接写目标目录，建议统一走如下步骤：

1. 解析来源
2. 读取 manifest
3. 检测冲突
4. 生成安装计划
5. 创建临时工作目录
6. 可选创建备份
7. 执行文件写入
8. 校验结果
9. 写入任务记录
10. 失败时回滚

建议接口：

```rust
pub struct WorkflowResult<T> {
    pub success: bool,
    pub data: Option<T>,
    pub warnings: Vec<String>,
    pub rollback_performed: bool,
}
```

## 13. 更新事务设计

更新和安装不同，必须把“恢复点”作为默认前置步骤。

推荐流程：

1. 拉取远程元数据
2. 比较版本
3. 下载新包到缓存目录
4. 解析压缩包
5. 对当前已安装版本创建恢复快照
6. 应用更新
7. 校验版本
8. 刷新本地状态
9. 失败自动回滚

## 14. 存档事务设计

存档复制是高风险操作，必须始终显式预览。

推荐流程：

1. 读取来源槽位和目标槽位
2. 预览是否会覆盖
3. 如果目标已有数据，先创建备份
4. 执行复制
5. 重新扫描两个槽位
6. 记录操作日志

建议提供两层接口：

- `preview_save_transfer`
- `apply_save_transfer`

## 15. Profile 设计

Profile 不只是“勾选一组 Mod”。

建议一个 Profile 至少包含：

- 名称
- 描述
- Mod 列表
- 每个 Mod 的目标状态
- 可选目标版本
- 创建时间和最近应用时间

V1 中 Profile 的应用逻辑：

- 对目标列表中的 Mod 启用或安装
- 对未包含的 Mod 根据策略禁用，不默认删除
- 如果目标版本不一致，标记偏差

## 16. Nexus 集成设计

建议单独抽象 `RemoteProvider`，不要把 Nexus 写死在业务层。

```rust
pub trait RemoteModProvider {
    async fn search(&self, query: SearchQuery) -> Result<Vec<RemoteMod>, AppError>;
    async fn get_detail(&self, id: &str) -> Result<RemoteMod, AppError>;
    async fn check_updates(&self, mods: &[InstalledMod]) -> Result<Vec<UpdateCandidate>, AppError>;
    async fn download(&self, remote_id: &str) -> Result<DownloadedArtifact, AppError>;
}
```

这样未来如果要接第二个来源，不需要重写上层逻辑。

Nexus 客户端建议负责：

- API Key 注入
- 速率限制处理
- 元数据映射
- 错误码转换
- 结果缓存

## 17. 错误模型

不要把所有错误都返回成字符串。

建议统一错误类型：

```rust
pub enum AppError {
    InvalidGamePath,
    GameNotFound,
    SaveRootNotFound,
    ManifestParseFailed(String),
    ArchiveUnsupported,
    ConflictDetected,
    RemoteAuthRequired,
    RemoteRateLimited,
    DownloadFailed(String),
    FileInUse(PathBuf),
    Io(String),
    Db(String),
    Unknown(String),
}
```

前端再把错误映射成更平静的用户文案。

## 18. 前端状态设计

建议采用轻量 store，而不是把所有状态塞进 React 组件树。

推荐 store 划分：

- `appStore`
- `libraryStore`
- `discoverStore`
- `profileStore`
- `saveStore`

每个 store 只保存：

- 当前页面需要的数据
- 加载状态
- 当前筛选和排序
- 当前选中项

不要把业务规则写进 store。

## 19. UI 路由建议

```text
/
/library
/library/updates
/library/conflicts
/discover
/discover/:modId
/profiles
/profiles/:profileId
/saves
/settings
/settings/nexus
/settings/diagnostics
```

## 20. 设计系统建议

组件要尽量少而稳。

优先建设这些基础组件：

- `AppShell`
- `SidebarNav`
- `TopStatusBar`
- `SectionHeader`
- `ModList`
- `DetailPane`
- `StatusBadge`
- `PrimaryButton`
- `SecondaryButton`
- `ConfirmDialog`
- `ActionSheet`
- `EmptyState`

视觉原则：

- 层次靠间距、字重、细边框来拉开
- 少用大面积卡片
- 动画只服务于切换和反馈

## 21. 启动流程设计

应用启动时的推荐顺序：

1. 读取本地设置
2. 尝试恢复上次的游戏目录
3. 校验目录是否仍有效
4. 若无效，尝试自动探测
5. 扫描 Mod 和存档
6. 读取 Profile 和缓存状态
7. 如果已配置 Nexus Key，异步检查更新
8. 前端先显示可用壳层，再渐进填充数据

不要让应用在启动时黑屏等待全部任务完成。

## 22. 日志与诊断

建议记录三类日志：

- 用户操作日志
- 工作流日志
- 错误日志

诊断包建议包含：

- 应用版本
- 系统版本
- 游戏路径和校验结果
- 安装的 Mod 列表
- 最近任务日志
- 关键错误摘要

敏感信息要脱敏：

- API Key
- 用户名
- 精确系统路径中的个人目录名

## 23. 测试策略

### 23.1 Rust 单元测试

重点覆盖：

- 路径探测
- manifest 解析
- 版本比较
- 冲突判断
- Profile 应用差异计算
- 存档槽位识别

### 23.2 集成测试

通过临时目录模拟：

- 游戏目录
- mods 目录
- mods_disabled 目录
- 存档目录
- zip 安装源

验证：

- 安装成功
- 更新成功
- 回滚成功
- 存档复制和备份成功

### 23.3 前端测试

重点覆盖：

- 关键页面路由
- 高风险确认弹窗
- 状态标签渲染
- 空状态和错误状态

## 24. 实施路线

### 阶段 1：本地闭环

- 游戏目录探测
- 本地 Mod 扫描
- zip 安装
- 启用禁用
- 卸载
- 存档双向复制
- 备份恢复

### 阶段 2：远程发现

- Nexus API Key 接入
- 搜索
- 详情
- 更新检查
- 单个更新

### 阶段 3：方案和稳定性

- Profile
- 活动日志
- 诊断页
- 批量更新
- 回滚历史

## 25. V1 推荐落地决策

- 启用/禁用采用双目录移动模型
- 高风险流程统一进入 workflow
- 前端不直接操作文件系统
- Nexus 相关逻辑都通过 `RemoteModProvider` 抽象
- 先把本地闭环做好，再接远程搜索和更新

## 26. 下一步建议

这份架构文档确定后，下一步应立即产出三样东西：

1. `src-tauri` 的 crate 和模块骨架
2. SQLite 表结构草案
3. 前端页面 wireframe 和设计 token
