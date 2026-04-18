<div align="center">

<img src="src-tauri/icons/icon.ico" width="100" height="100" alt="SlaySP2Manager Logo" />

# SlaySP2Manager

**《杀戮尖塔 2》桌面 Mod 管理器**  
基于 Rust + Tauri + React 构建，目标是把 Mod 安装、预设切换、存档保护和图鉴整理到一个稳定的桌面工具里。

[![GitHub release](https://img.shields.io/github/v/release/wakaka6/SlaySP2Manger?style=flat-square&color=C9A84C)](https://github.com/wakaka6/SlaySP2Manger/releases)
[![Build Status](https://img.shields.io/github/actions/workflow/status/wakaka6/SlaySP2Manger/release.yml?style=flat-square&label=Build)](https://github.com/wakaka6/SlaySP2Manger/actions)
[![GitHub stars](https://img.shields.io/github/stars/wakaka6/SlaySP2Manger?style=flat-square&color=F1C40F)](https://github.com/wakaka6/SlaySP2Manger/stargazers)
[![License](https://img.shields.io/github/license/wakaka6/SlaySP2Manger?style=flat-square&color=95A5A6)](LICENSE)

**当前版本：`0.9.0`** | [English](./README.en.md)

</div>

---

## 演示

<div align="center">
  <video src="https://github.com/user-attachments/assets/4eddda81-022d-4ac5-9ad8-38529399b653" width="100%" autoplay loop muted playsinline></video>
</div>

---

## 这个项目解决什么问题

给《杀戮尖塔 2》装 Mod 和维护存档，本来会有几个很烦的点：

- 找不到游戏目录、Mods 目录和存档目录。
- 在 Nexus、浏览器和文件夹之间反复切换，安装过程碎片化。
- Mod 冲突没有前置提示，出问题时很难回溯。
- 想试 Mod，又担心覆盖原版存档。
- 预设切换、备份恢复和云存档同步都缺少一个稳定入口。
- 想查卡牌资料时，社区网站信息虽然全，但和本地游戏版本、语言、资源不一定一致。

`SlaySP2Manager` 的目标，就是把这些流程压到一个应用里处理。

---

## 0.9.0 重点更新

- 新增 **原生卡牌图鉴** 页面，支持卡牌浏览、筛选、升级态切换和详情查看。
- 图鉴会从 **本地游戏安装动态生成元数据**，不再依赖仓库内置的静态 `card-metadata` 文件。
- 图鉴卡面可直接提取 **游戏内卡图、边框、横幅、能量图标和标题字体**，展示更接近游戏原始资源。
- 图鉴浏览体验补充了 **吸顶筛选栏、折叠筛选区、回到顶部按钮** 和更完整的浅色主题样式。
- Profiles 页面现在支持 **现有配置档的模组选中自动保存**。

---

## 功能概览

### Mod Library

- 扫描并展示本地已安装的 Mod。
- 单击启用、禁用、卸载。
- 支持从 `.zip` 导入，并在真正写入前做预览和冲突检查。
- 记录安装、更新、卸载等操作日志。

### Discover

- 应用内搜索 Nexus Mods 上的 STS2 Mod。
- 查看作者、版本、标签、简介和插图。
- 支持跳转 Nexus 页面。
- 支持下载队列与应用内 API Key 配置。

### Presets / Profiles

- 保存多套本地 Mod 预设。
- 一键把当前启用 Mod 保存为预设。
- 支持预设导出、导入、分享整合包。
- 对现有配置档的模组勾选会自动保存，减少反复手动点击保存。

### Compendium

- 新增独立卡牌图鉴页。
- 支持角色、类型、稀有度筛选和关键字查看。
- 支持基础态 / 升级态切换。
- 从本地游戏提取卡图与原生卡面资源。
- 点击刷新时，会根据已识别的游戏路径重新构建图鉴元数据和资源缓存。

### Save Management

- 区分原版存档与 Mod 存档。
- 支持双向复制、配对同步、可视化连线。
- 高风险操作前自动备份。
- 提供备份列表和恢复能力。

### Steam Cloud Sync

- 自动识别当前 Steam 账号的云存档目录。
- 支持本地到云端、云端到本地的一键同步。
- 云操作前自动做完整备份。
- 支持云存档差异检查与工作台。

### Settings & Diagnostics

- 自动检测游戏目录。
- 配置 Nexus API Key、代理和下载相关设置。
- 诊断游戏路径、Mods 目录和存档状态。

---

## 图鉴数据源说明

从 `0.9.0` 开始，图鉴数据源采用“本地动态生成”：

- 元数据来源于本地游戏安装中的 `sts2.dll` 和 `SlayTheSpire2.pck`。
- 刷新资源时，应用会在本地重新生成图鉴 snapshot。
- 生成结果与提取出的卡图、边框、字体等资源会缓存到应用缓存目录。
- 仓库里不再需要提交 `card-metadata.*.json` 这类静态快照文件。

这意味着图鉴内容会更贴近用户本机实际安装的游戏版本和语言资源。

---

## 下载与安装

1. 前往 [Releases 页面](https://github.com/wakaka6/SlaySP2Manger/releases)
2. 下载最新 `.msi`
3. 运行安装程序
4. 启动 `SlaySP2Manager`
5. 首次进入后确认或自动识别游戏目录

系统要求：

- Windows 10/11 x64

---

## 本地开发

### 环境要求

| 工具 | 版本要求 |
| --- | --- |
| Node.js | 18+ |
| Rust | stable |
| Windows | 10/11 |

### 启动开发模式

```bash
npm install
npm run tauri:dev
```

### 构建发布包

```bash
npm run tauri:build
```

输出目录：

```text
src-tauri/target/release/bundle/msi/
```

---

## 参与贡献

欢迎提交 Bug、改进建议和 Pull Request。

1. Fork 仓库
2. 新建分支：`git checkout -b feat/my-feature`
3. 提交改动：`git commit -m "feat: add my feature"`
4. 发起 Pull Request

建议遵循 [Conventional Commits](https://www.conventionalcommits.org/)。

---

## 许可证

[MIT](LICENSE)

---

<div align="center">

为《杀戮尖塔 2》社区持续打磨。

</div>
