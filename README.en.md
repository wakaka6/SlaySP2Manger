<div align="center">

<img src="src-tauri/icons/icon.ico" width="100" height="100" alt="SlaySP2Manager Logo" />

# SlaySP2Manager

**The desktop mod manager for Slay the Spire 2**  
Built with Rust + Tauri + React — Fast, Secure, and Fully Automated.

[![GitHub release](https://img.shields.io/github/v/release/wakaka6/SlaySP2Manger?style=flat-square&color=C9A84C)](https://github.com/wakaka6/SlaySP2Manger/releases)
[![Build Status](https://img.shields.io/github/actions/workflow/status/wakaka6/SlaySP2Manger/release.yml?style=flat-square&label=Build)](https://github.com/wakaka6/SlaySP2Manger/actions)
[![GitHub stars](https://img.shields.io/github/stars/wakaka6/SlaySP2Manger?style=flat-square&color=F1C40F)](https://github.com/wakaka6/SlaySP2Manger/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/wakaka6/SlaySP2Manger?style=flat-square&color=3498DB)](https://github.com/wakaka6/SlaySP2Manger/network)
[![GitHub watchers](https://img.shields.io/github/watchers/wakaka6/SlaySP2Manger?style=flat-square&color=2ECC71)](https://github.com/wakaka6/SlaySP2Manger/watchers)
[![License](https://img.shields.io/github/license/wakaka6/SlaySP2Manger?style=flat-square&color=95A5A6)](LICENSE)

[中文文档](./README.md) | **English**

</div>

---

## 🖥️ Demo

<div align="center">
  <video src="https://github.com/user-attachments/assets/4eddda81-022d-4ac5-9ad8-38529399b653" width="100%" autoplay loop muted playsinline></video>
</div>

---

## 🎯 The Problem We Solve

Installing mods for Slay the Spire 2 is messy — and we've been there:

- 🔍 **Where's my game folder?** First-time modders spend 20 minutes hunting for game and save paths before they even start.
- 🔀 **Browser ↔ folder hell.** You find a mod on Nexus Mods, download it, unzip it, drop it somewhere, hope it works — then repeat for the next one.
- 💥 **Silent conflicts.** Two mods overwrite the same file with no warning. The game breaks. You don't know why.
- 💾 **Save file anxiety.** You want to try a modded run, but you're scared of overwriting your vanilla save.
- 🔙 **No undo.** After an update goes wrong, there's no easy way to roll things back.

**SlaySP2Manager** turns all of this into a calm, one-window workflow.

---

## ✨ Features

### 📦 Mod Library
- **Scan & display** all locally installed mods in one place
- **Enable / Disable / Uninstall** mods with a single click
- **Install from ZIP** — drag-and-drop or pick a file; the app reads the manifest, detects conflicts, and shows a preview before writing anything
- **Conflict detection** — highlights file-level collisions between mods before they cause problems
- **Activity log** — a clear history of every install, update, and removal

### 🔍 Discover (Nexus Mods integration)
- **Search Nexus Mods** for STS2 mods without leaving the app
- **Mod detail panel** — description, author, version, endorsements, tags
- **Multi-language Friendly** — translate mod descriptions right in the app
- **Open on Nexus** — jump to the full Nexus page in your browser when you need more context
- **Download queue** — persistent, visible across all pages while downloads are in progress
- Requires a free Nexus Mods API key (the app walks you through getting one)

### 🗂️ Presets
- Create **multiple local mod presets** (e.g. "Vanilla-friendly", "Full chaos run")
- Switch presets safely — the app validates integrity before applying
- Duplicate and rename presets
- **Share as bundle**: Package a preset with all its mods into a `.zip` bundle (with `.spm` manifest) to share with friends in one click
- **Import bundles**: Click a button or drag-and-drop a bundle onto the window — the app detects conflicts and lets you choose "Skip" or "Replace" per mod
- **Save preset from Library**: Capture all currently enabled mods as a new preset with one click

### 💾 Save Management
- Clearly separates **vanilla save slots** from **modded save slots**
- **Two-way copy** between vanilla and modded saves (with a preview of what will be overwritten)
- **Save pairing & sync** — link any vanilla slot with any modded slot, enable auto-sync and saves are bidirectionally synced by modification time (rsync-style), with cross-slot pairing support
- **Visual connection lines** between paired cards; click the × button on a line to unlink
- **Auto-backup before every risky action** — no silent overwrites
- **Backup list & restore** — browse past backups and restore with one click

### ☁️ Steam Cloud Sync
- **Auto-discovers** the current Steam account's cloud save directory — zero manual configuration
- One-click **Upload to Cloud** (Local → Cloud) or **Download to Local** (Cloud → Local), syncing both vanilla and modded saves
- **Full backup created automatically** before every cloud operation to ensure data safety
- Quickly **open the cloud save folder** in your file manager for manual inspection

### ⚙️ Settings & Diagnostics
- Auto-detects your game directory on first launch
- Configure download directory and Nexus API key
- **In-app tutorial** for obtaining an API key (no browser needed)
- Diagnostic page: validate game path, save path, and mod folder health

---


## 🚀 Download & Install

1. Go to the [**Releases page**](https://github.com/wakaka6/SlaySP2Manger/releases)
2. Download the latest `.msi` installer
3. Run the installer — no configuration needed
4. Launch **SlaySP2Manager** and point it at your STS2 game folder

> **Requirements:** Windows 10/11 (x64). No additional runtime dependencies.

---

## 🛠️ Development Setup

### Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 18+ |
| Rust | stable (via `rustup`) |
| Windows | 10/11 (build target) |

### Run locally

```bash
# Install frontend dependencies
npm install

# Start in Tauri dev mode (hot-reload)
npm run tauri:dev
```

### Build a release binary

```bash
npm run tauri:build
# Output: src-tauri/target/release/bundle/msi/
```

---

## 🤝 Contributing

Contributions, bug reports, and feature requests are welcome!

1. Fork the repository
2. Create your branch: `git checkout -b feat/my-feature`
3. Commit your changes: `git commit -m 'feat: add my feature'`
4. Push and open a Pull Request

Please follow [Conventional Commits](https://www.conventionalcommits.org/) for commit messages.

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

<div align="center">

Made with ❤️ for the Slay the Spire 2 community

</div>
