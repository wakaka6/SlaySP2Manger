# SlaySP2Manager SQLite 表结构草案

## 1. 设计目标

数据库只存“业务元数据”和“可恢复索引”，不直接存大文件内容。

SQLite 主要承担：

- 应用设置
- Nexus 连接状态
- Mod 元数据缓存
- 本地安装状态索引
- Profile
- 任务记录
- 备份索引
- 活动日志

文件系统继续负责：

- 实际下载包
- 备份内容
- 导出文件
- 日志正文

## 2. 推荐数据库文件位置

```text
%AppData%/SlaySP2Manager/app.db
```

## 3. 版本管理

建议单独维护 schema 版本。

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);
```

## 4. 核心表

## 4.1 应用设置

```sql
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

建议保存的 key：

- `game_root_dir`
- `mods_dir_name`
- `disabled_mods_dir_name`
- `download_cache_dir`
- `active_profile_id`
- `theme_mode`
- `accent_color`
- `nexus_api_key_encrypted`
- `nexus_user_name`
- `diagnostics_opt_in`

## 4.2 游戏安装快照

```sql
CREATE TABLE IF NOT EXISTS game_installs (
  id TEXT PRIMARY KEY,
  root_dir TEXT NOT NULL,
  exe_path TEXT NOT NULL,
  mods_dir TEXT NOT NULL,
  disabled_mods_dir TEXT,
  detected_by TEXT NOT NULL,
  is_valid INTEGER NOT NULL DEFAULT 1,
  last_scanned_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

说明：

- 目前大概率只会有一条有效记录
- 保留多条记录有利于后续支持多环境或历史恢复

## 4.3 本地已安装 Mod 索引

```sql
CREATE TABLE IF NOT EXISTS installed_mods (
  id TEXT PRIMARY KEY,
  game_install_id TEXT NOT NULL,
  mod_id TEXT NOT NULL,
  name TEXT NOT NULL,
  version TEXT,
  author TEXT,
  folder_name TEXT NOT NULL,
  install_dir TEXT NOT NULL,
  manifest_path TEXT,
  source_type TEXT NOT NULL,
  source_ref TEXT,
  state TEXT NOT NULL,
  local_hash TEXT,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (game_install_id) REFERENCES game_installs(id)
);
```

建议索引：

```sql
CREATE INDEX IF NOT EXISTS idx_installed_mods_game_install_id
ON installed_mods(game_install_id);

CREATE INDEX IF NOT EXISTS idx_installed_mods_mod_id
ON installed_mods(mod_id);

CREATE INDEX IF NOT EXISTS idx_installed_mods_state
ON installed_mods(state);
```

## 4.4 远程 Mod 缓存

```sql
CREATE TABLE IF NOT EXISTS remote_mod_cache (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  remote_mod_id TEXT NOT NULL,
  game_domain TEXT NOT NULL,
  slug TEXT,
  name TEXT NOT NULL,
  summary TEXT,
  author TEXT,
  latest_version TEXT,
  detail_url TEXT NOT NULL,
  category TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  fetched_at TEXT NOT NULL,
  expires_at TEXT
);
```

建议索引：

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_remote_mod_cache_provider_remote_mod_id
ON remote_mod_cache(provider, remote_mod_id);

CREATE INDEX IF NOT EXISTS idx_remote_mod_cache_slug
ON remote_mod_cache(slug);
```

## 4.5 本地与远程映射

```sql
CREATE TABLE IF NOT EXISTS mod_remote_links (
  id TEXT PRIMARY KEY,
  installed_mod_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  remote_mod_id TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1.0,
  linked_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (installed_mod_id) REFERENCES installed_mods(id)
);
```

用途：

- 记录本地 Mod 与 Nexus 远程 Mod 的关联
- 支持人工确认和自动匹配两种来源

## 4.6 配置方案

```sql
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  kind TEXT NOT NULL,
  is_builtin INTEGER NOT NULL DEFAULT 0,
  last_applied_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

```sql
CREATE TABLE IF NOT EXISTS profile_mod_entries (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  mod_id TEXT NOT NULL,
  expected_version TEXT,
  desired_state TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);
```

建议索引：

```sql
CREATE INDEX IF NOT EXISTS idx_profile_mod_entries_profile_id
ON profile_mod_entries(profile_id);
```

## 4.7 备份索引

```sql
CREATE TABLE IF NOT EXISTS backups (
  id TEXT PRIMARY KEY,
  backup_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  source_path TEXT NOT NULL,
  backup_path TEXT NOT NULL,
  related_task_id TEXT,
  related_mod_id TEXT,
  related_profile_id TEXT,
  size_bytes INTEGER,
  created_at TEXT NOT NULL
);
```

`backup_type` 建议值：

- `save`
- `mod_update`
- `mod_install`
- `profile_apply`

## 4.8 任务记录

```sql
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  task_type TEXT NOT NULL,
  status TEXT NOT NULL,
  summary TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  result_json TEXT NOT NULL DEFAULT '{}',
  rollback_performed INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  completed_at TEXT
);
```

`task_type` 建议值：

- `scan`
- `install_archive`
- `install_remote_mod`
- `update_mod`
- `apply_profile`
- `transfer_save`
- `restore_backup`

## 4.9 任务事件

```sql
CREATE TABLE IF NOT EXISTS task_events (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);
```

用途：

- 前端显示进度
- 保留详细活动记录
- 支撑诊断导出

## 4.10 活动日志

```sql
CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT,
  ref_type TEXT,
  ref_id TEXT,
  created_at TEXT NOT NULL
);
```

用于 UI 简报，不代替任务事件。

## 4.11 存档快照索引

```sql
CREATE TABLE IF NOT EXISTS save_snapshots (
  id TEXT PRIMARY KEY,
  steam_user_id TEXT NOT NULL,
  save_kind TEXT NOT NULL,
  slot_index INTEGER NOT NULL,
  path TEXT NOT NULL,
  has_data INTEGER NOT NULL DEFAULT 0,
  has_current_run INTEGER NOT NULL DEFAULT 0,
  file_count INTEGER NOT NULL DEFAULT 0,
  last_modified_at TEXT,
  scanned_at TEXT NOT NULL
);
```

说明：

- 这是扫描缓存，不是权威来源
- 权威状态仍应来自文件系统实时扫描

## 4.12 远程搜索缓存

```sql
CREATE TABLE IF NOT EXISTS search_cache (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  query_hash TEXT NOT NULL,
  query_json TEXT NOT NULL,
  result_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  expires_at TEXT
);
```

## 5. 推荐保留策略

建议定期清理：

- `task_events` 只保留最近 5,000 到 10,000 条
- `activity_logs` 只保留最近 2,000 条
- `search_cache` 根据过期时间清理
- `remote_mod_cache` 根据 `expires_at` 清理

## 6. 推荐枚举值

## 6.1 installed_mods.state

- `enabled`
- `disabled`
- `update_available`
- `conflict`
- `broken`
- `unknown`

## 6.2 profiles.kind

- `vanilla`
- `qol`
- `multiplayer`
- `custom`

## 6.3 tasks.status

- `pending`
- `running`
- `completed`
- `failed`
- `rolled_back`

## 7. 数据库初始化顺序

建议初始化顺序：

1. `schema_migrations`
2. `app_settings`
3. `game_installs`
4. `installed_mods`
5. `remote_mod_cache`
6. `mod_remote_links`
7. `profiles`
8. `profile_mod_entries`
9. `backups`
10. `tasks`
11. `task_events`
12. `activity_logs`
13. `save_snapshots`
14. `search_cache`

## 8. Rust 数据访问建议

建议把数据库访问抽到 `integrations/db.rs` 和对应 repository 中。

推荐拆分：

- `settings_repo`
- `mods_repo`
- `profiles_repo`
- `tasks_repo`
- `backups_repo`
- `discover_cache_repo`

不要把 SQL 直接散落在 workflow 里。

## 9. V1 最小必需表

如果你要更快开工，V1 最小可先只实现：

- `schema_migrations`
- `app_settings`
- `installed_mods`
- `profiles`
- `profile_mod_entries`
- `backups`
- `tasks`
- `task_events`

其他表可以在接入 Nexus 和更复杂的缓存后补齐。
