<div align="center">

<img src="src-tauri/icons/icon.ico" width="100" height="100" alt="SlaySP2Manager Logo" />

# SlaySP2Manager

**Slay the Spire 2 桌面端 Mod 管理器**  
基于 Rust + Tauri + React 构建 — 快速、安全、全自动化管理。

[![GitHub release](https://img.shields.io/github/v/release/wakaka6/SlaySP2Manger?style=flat-square&color=C9A84C)](https://github.com/wakaka6/SlaySP2Manger/releases)
[![Build Status](https://img.shields.io/github/actions/workflow/status/wakaka6/SlaySP2Manger/release.yml?style=flat-square&label=Build)](https://github.com/wakaka6/SlaySP2Manger/actions)
[![GitHub stars](https://img.shields.io/github/stars/wakaka6/SlaySP2Manger?style=flat-square&color=F1C40F)](https://github.com/wakaka6/SlaySP2Manger/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/wakaka6/SlaySP2Manger?style=flat-square&color=3498DB)](https://github.com/wakaka6/SlaySP2Manger/network)
[![GitHub watchers](https://img.shields.io/github/watchers/wakaka6/SlaySP2Manger?style=flat-square&color=2ECC71)](https://github.com/wakaka6/SlaySP2Manger/watchers)
[![License](https://img.shields.io/github/license/wakaka6/SlaySP2Manger?style=flat-square&color=95A5A6)](LICENSE)

**中文文档** | [English](./README.en.md)

</div>

---

## 🖥️ 演示

<div align="center">
  <video src="https://github.com/user-attachments/assets/f24a8f15-989d-4810-8970-577b16709b66" width="100%" autoplay loop muted playsinline></video>
</div>

---

## 🎯 我们解决了什么问题

给《杀戮尖塔 2》装 Mod 很麻烦——我自己也经历过：

- 🔍 **游戏目录在哪？** 第一次装 Mod 的玩家常常花 20 分钟寻找游戏路径和存档路径。
- 🔀 **浏览器和文件夹来回切。** 在 Nexus Mods 上找到想装的 Mod，下载、解压、复制到不知对不对的目录，再祈祷游戏不崩。
- 💥 **悄无声息的冲突。** 两个 Mod 覆盖同一个文件，没有任何提示，游戏直接挂了，却不知道问题出在哪。
- 💾 **存档焦虑。** 想体验一次模组玩法，却害怕原版存档被覆盖，进退两难。
- 🔙 **没有撤销。** 更新出错之后，没有简单的回滚方式。

**SlaySP2Manager** 把上面这些焦虑场景，变成一个安静、专注、一窗搞定的操作流程。

---

## ✨ 功能概览

### 📦 模组库
- **扫描并展示**本地已安装的所有 Mod，一目了然
- 单击即可**启用 / 禁用 / 卸载** Mod
- **从 ZIP 安装** — 拖拽文件或手动选择；应用读取 manifest、检测冲突，在写入之前显示预览
- **冲突检测** — 在问题发生前高亮显示 Mod 之间的文件级冲突
- **操作日志** — 每次安装、更新、卸载都有清晰的记录

### 🔍 发现（Nexus Mods 集成）
- **在应用内搜索** Nexus Mods 上的 STS2 Mod，无需切换浏览器
- **Mod 详情面板** — 描述、作者、版本、点赞数、标签
- **在 Nexus 中打开** — 需要时可直接跳转到完整的 Nexus 页面
- **下载队列** — 全程可见，切换页面后不会消失
- 需要免费的 Nexus Mods API Key（应用内有获取引导教程）

### 🗂️ 预设
- 创建 **多套本地 Mod 预设**（例如"原版兼容""全力混乱"）
- 安全切换预设 — 应用在切换前会自动校验完整性
- 支持复制、重命名、导出、导入预设

### 💾 存档管理
- 清晰区分**原版存档槽位**和**模组存档槽位**
- 原版与模组存档之间**双向复制**（操作前显示将覆盖哪些内容）
- **存档配对同步** — 将任意原版槽位与模组槽位关联，开启自动同步后根据修改时间双向同步（类似 rsync），支持跨槽位配对
- 卡片之间**可视化连线**，清晰展示配对关系；点击连线中间的 × 按钮即可解除
- **高风险操作前自动备份** — 不会悄悄覆盖任何东西
- **备份列表与恢复** — 浏览历史备份，一键恢复

### ⚙️ 设置与诊断
- 首次启动自动检测游戏目录
- 可配置下载目录和 Nexus API Key
- **应用内教程**：引导获取 API Key，无需离开应用
- 诊断页面：校验游戏路径、存档路径和 Mod 目录健康情况

---


## 🚀 下载与安装

1. 前往 [**Releases 页面**](https://github.com/wakaka6/SlaySP2Manger/releases)
2. 下载最新的 `.msi` 安装包
3. 运行安装程序，无需额外配置
4. 启动 **SlaySP2Manager**，指向你的 STS2 游戏目录

> **系统要求：** Windows 10/11（x64）。无需安装任何运行时依赖。

---

## 🛠️ 本地开发

### 环境要求

| 工具 | 版本要求 |
|------|---------|
| Node.js | 18+ |
| Rust | stable（通过 `rustup` 安装） |
| Windows | 10/11（构建目标） |

> 若 `cargo` 未加入 PATH，需将 `%USERPROFILE%\.cargo\bin` 添加到系统环境变量。

### 启动开发模式

```bash
# 安装前端依赖
npm install

# 启动 Tauri 开发模式（热重载）
npm run tauri:dev
```

### 构建发布包

```bash
npm run tauri:build
# 产物目录：src-tauri/target/release/bundle/msi/
```

---

## 🤝 参与贡献

欢迎提交 Bug 报告、功能建议和 Pull Request！

1. Fork 本仓库
2. 创建你的分支：`git checkout -b feat/my-feature`
3. 提交改动：`git commit -m 'feat: 新增某功能'`
4. 推送并发起 Pull Request

提交信息请遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范。

---

## 📄 许可证

MIT License — 详见 [LICENSE](LICENSE)。

---

<div align="center">

用❤️为《杀戮尖塔 2》社区打造

</div>
