<div align="center">

<img src="src-tauri/icons/icon.ico" width="100" height="100" alt="SlaySP2Manager Logo" />

# SlaySP2Manager

**A desktop mod manager for Slay the Spire 2**  
Built with Rust + Tauri + React to keep mod installs, presets, saves, and card references inside one stable desktop app.

[![GitHub release](https://img.shields.io/github/v/release/wakaka6/SlaySP2Manger?style=flat-square&color=C9A84C)](https://github.com/wakaka6/SlaySP2Manger/releases)
[![Build Status](https://img.shields.io/github/actions/workflow/status/wakaka6/SlaySP2Manger/release.yml?style=flat-square&label=Build)](https://github.com/wakaka6/SlaySP2Manger/actions)
[![GitHub stars](https://img.shields.io/github/stars/wakaka6/SlaySP2Manger?style=flat-square&color=F1C40F)](https://github.com/wakaka6/SlaySP2Manger/stargazers)
[![License](https://img.shields.io/github/license/wakaka6/SlaySP2Manger?style=flat-square&color=95A5A6)](LICENSE)

[中文文档](./README.md) | **Current version: `0.9.0`**

</div>

---

## Demo

<div align="center">
  <video src="https://github.com/user-attachments/assets/4eddda81-022d-4ac5-9ad8-38529399b653" width="100%" autoplay loop muted playsinline></video>
</div>

---

## What this project solves

Managing Slay the Spire 2 mods usually means dealing with several annoying workflows:

- hunting for the correct game, mods, and save directories
- bouncing between Nexus, the browser, and local folders
- getting no warning when two mods collide
- risking vanilla saves while trying a modded run
- lacking a clean place to manage presets, backups, and cloud sync
- relying on external card databases that may not match the user's installed game version or language

`SlaySP2Manager` is meant to turn that into one desktop workflow.

---

## Highlights in 0.9.0

- Added a **native card compendium** page with browsing, filtering, upgrade-state toggles, and card detail inspection.
- Compendium metadata is now **generated from the local game install at runtime** instead of relying on a tracked static `card-metadata` file.
- Card rendering can extract **in-game art, frames, banners, energy icons, and title fonts** from local game assets.
- Compendium browsing now includes a **sticky toolbar, collapsible filters, back-to-top action**, and fuller light-theme support.
- The Profiles page now **autosaves mod selection changes** for existing profiles.

---

## Features

### Mod Library

- Scan and display locally installed mods.
- Enable, disable, and uninstall with one click.
- Import from `.zip` with preview and conflict detection before writing.
- Keep an activity log for installs, updates, and removals.

### Discover

- Search Slay the Spire 2 mods on Nexus Mods inside the app.
- View authors, versions, tags, descriptions, and artwork.
- Jump to the Nexus page when needed.
- Manage API key setup and download flow in-app.

### Presets / Profiles

- Save multiple local mod presets.
- Capture the current enabled mod set as a preset in one click.
- Export, import, and share preset bundles.
- Autosave mod selection changes while editing an existing profile.

### Compendium

- Dedicated card compendium page.
- Filter by character, type, and rarity.
- Toggle between base and upgraded states.
- Extract card art and native card-frame assets from the local game install.
- Rebuild metadata and native asset caches from the detected game path when the user refreshes resources.

### Save Management

- Separate vanilla and modded save slots.
- Support two-way copy, slot pairing, and visual connections.
- Create backups before risky actions.
- Browse and restore save backups.

### Steam Cloud Sync

- Auto-detect the current Steam account's cloud save directory.
- One-click local-to-cloud and cloud-to-local sync.
- Full backup before cloud operations.
- Cloud diff inspection and workbench support.

### Settings & Diagnostics

- Auto-detect the game directory.
- Configure Nexus API key, proxy, and download-related settings.
- Inspect game path, mods directory, and save state health.

---

## Compendium data source

Starting from `0.9.0`, the compendium uses a local runtime pipeline:

- metadata is derived from the local `sts2.dll` and `SlayTheSpire2.pck`
- refreshing resources regenerates the compendium snapshot locally
- generated snapshot data and extracted assets are cached in the app cache directory
- the repository no longer needs to track static `card-metadata.*.json` snapshots

This keeps the compendium closer to the user's actual installed game version and localization data.

---

## Download and install

1. Open the [Releases page](https://github.com/wakaka6/SlaySP2Manger/releases)
2. Download the latest `.msi`
3. Run the installer
4. Launch `SlaySP2Manager`
5. Confirm or auto-detect the game directory on first use

Requirements:

- Windows 10/11 x64

---

## Local development

### Prerequisites

| Tool | Version |
| --- | --- |
| Node.js | 18+ |
| Rust | stable |
| Windows | 10/11 |

### Start in dev mode

```bash
npm install
npm run tauri:dev
```

### Build a release package

```bash
npm run tauri:build
```

Output:

```text
src-tauri/target/release/bundle/msi/
```

---

## Contributing

Bug reports, improvement ideas, and pull requests are welcome.

1. Fork the repository
2. Create a branch: `git checkout -b feat/my-feature`
3. Commit your changes: `git commit -m "feat: add my feature"`
4. Open a pull request

Please follow [Conventional Commits](https://www.conventionalcommits.org/).

---

## License

[MIT](LICENSE)

---

<div align="center">

Maintained for the Slay the Spire 2 community.

</div>
