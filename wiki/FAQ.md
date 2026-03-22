# ❓ FAQ — Frequently Asked Questions

> Common questions and troubleshooting guide for **SlaySP2Manager** and Slay the Spire 2 modding.

---

## 📚 Table of Contents

- [General Questions](#-general-questions)
- [Installation & Setup](#-installation--setup)
- [Mod Management](#-mod-management)
- [Nexus Mods Integration](#-nexus-mods-integration)
- [Save Management](#-save-management)
- [Proxy & Network Issues](#-proxy--network-issues)
- [Performance & Compatibility](#-performance--compatibility)
- [Game-Specific Modding Issues](#-game-specific-modding-issues)

---

## 💬 General Questions

### Q: What is SlaySP2Manager?

**A:** SlaySP2Manager is a free, open-source desktop mod manager for Slay the Spire 2. It automates mod installation, conflict detection, save management, and more — all in a single clean interface. Built with Rust + Tauri + React.

---

### Q: Is SlaySP2Manager safe to use?

**A:** Yes! The app is fully open-source ([view the code on GitHub](https://github.com/wakaka6/SlaySP2Manger)). It doesn't modify game files directly — it manages the `mods` folder and save files. The app also automatically creates backups before any risky operation.

---

### Q: Does the app work on macOS or Linux?

**A:** Currently, SlaySP2Manager only supports **Windows 10/11 (x64)**. macOS/Linux support may be added in the future.

---

### Q: Is SlaySP2Manager affiliated with Mega Crit or Nexus Mods?

**A:** No. SlaySP2Manager is an independent community project. It is not officially endorsed by Mega Crit (the game developers) or Nexus Mods.

---

## 📥 Installation & Setup

### Q: Where do I download SlaySP2Manager?

**A:** Download the latest `.msi` installer from the [Releases page](https://github.com/wakaka6/SlaySP2Manger/releases).

---

### Q: The app can't auto-detect my game directory. What do I do?

**A:** Go to **Settings** and manually set your game path. To find it:
1. Open Steam → Library
2. Right-click **Slay the Spire 2** → Manage → Browse Local Files
3. Copy the path and paste it into SlaySP2Manager's game path setting

Common game paths:
- `C:\Program Files (x86)\Steam\steamapps\common\Slay the Spire 2`
- `D:\SteamLibrary\steamapps\common\Slay the Spire 2`

---

### Q: Windows SmartScreen blocks the installer. Is the app safe?

**A:** Yes. Because the app is not code-signed with an expensive certificate, Windows SmartScreen may show a warning. Click **"More info"** → **"Run anyway"** to proceed. The app is open-source and you can verify the code yourself.

---

### Q: The app shows errors on first launch. What should I do?

**A:** Make sure:
1. Your game path is set correctly in Settings
2. The game has been launched at least once (so the save directory exists)
3. You have a `mods` folder in the game's root directory (the app will create one if needed)
4. Run the built-in **Diagnostics** check in the Settings page

---

## 📦 Mod Management

### Q: How do I install mods with SlaySP2Manager?

**A:** There are two ways:

**Method 1 — From Nexus Mods (recommended):**
1. Go to the **Discover** tab
2. Search for a mod
3. Click **Download** — done!

**Method 2 — From a local file:**
1. Go to the **Library** tab
2. Click the **Import** button (or drag-and-drop a file)
3. Select a `.zip` or `.7z` file containing the mod
4. Confirm the installation preview

---

### Q: Can I import multiple mods at once?

**A:** Yes! You can select multiple files in the file picker, or select a folder containing multiple mod archives. SlaySP2Manager supports batch import and will process each mod individually — failures in one mod won't affect the others.

---

### Q: How do I enable or disable a mod?

**A:** In the **Library** tab, each mod has a toggle switch. Click it to enable or disable the mod. Disabled mods are moved out of the active `mods` folder and won't be loaded by the game.

---

### Q: The mod count in the sidebar doesn't update after importing mods.

**A:** This should be fixed in the latest version. If the count is stale, try:
1. Switching to another page and back
2. Restarting the app
3. Updating to the latest version from the [Releases page](https://github.com/wakaka6/SlaySP2Manger/releases)

---

### Q: What archive formats are supported?

**A:** SlaySP2Manager supports:
- ✅ **ZIP** — fully supported
- ✅ **7z** — fully supported
- ⚠️ **RAR** — limited support, may require the mod to be re-packaged as ZIP/7z
- ✅ **Folders** — you can also import extracted mod folders directly

---

### Q: I see a "conflict detected" warning. What does it mean?

**A:** A conflict occurs when two or more mods try to include files with the same name. SlaySP2Manager warns you about this before any changes are made. You can choose to:
- Remove one of the conflicting mods
- Proceed with the install (the newer mod's files will overwrite the older ones)

---

### Q: Can I revert a mod installation?

**A:** SlaySP2Manager creates backups automatically before risky operations. You can browse and restore backups from the **Save Management** section. Additionally, you can simply disable or uninstall the mod from the Library.

---

## 🔑 Nexus Mods Integration

### Q: How do I get a Nexus Mods API key?

**A:** SlaySP2Manager includes an in-app tutorial to guide you:
1. Go to **Settings**
2. Follow the **API Key Setup Guide** — it will walk you through creating a free Nexus Mods account and generating an API key
3. Paste the key into the settings field

The API key is **free** and only requires a Nexus Mods account.

---

### Q: I pasted my API key but the Discover tab shows errors.

**A:** Check the following:
1. Make sure the API key is copied completely (no extra spaces)
2. Verify your internet connection
3. If you're behind a firewall or in a region with restricted access, try configuring a **proxy** in Settings
4. The Nexus Mods API may have temporary outages — try again later

---

### Q: Can I download mods without a Nexus API key?

**A:** The **Discover** tab requires an API key to search and download mods from Nexus Mods. However, you can always:
- Download mods manually from [nexusmods.com](https://www.nexusmods.com) in your browser
- Import them into SlaySP2Manager using the local import feature

---

### Q: Downloads are very slow. What can I do?

**A:** Try:
1. Configuring a proxy in **Settings** if you have restricted network access
2. Checking your internet connection speed
3. Downloading during off-peak hours
4. The Nexus Mods free tier has download speed limits — a premium Nexus account removes these

---

## 💾 Save Management

### Q: Will installing mods corrupt my save files?

**A:** The **first time** you install any mod in STS2, there is a known risk of save data loss. SlaySP2Manager mitigates this by:
- Automatically backing up saves before any operation
- Clearly separating vanilla and modded save slots
- Providing easy backup restoration

**Always keep your saves backed up!**

---

### Q: Where are my save files located?

**A:** Default save path:
```
C:\Users\<YourName>\AppData\Roaming\SlayTheSpire2\steam\<YourSteamID>
```

SlaySP2Manager can auto-detect this path. If it can't, set it manually in Settings.

---

### Q: How does save pairing / sync work?

**A:** Save pairing lets you link a vanilla save slot with a modded save slot. When auto-sync is enabled:
- Changes are synced bidirectionally based on modification time
- Visual connection lines show the pairing relationship
- Click the × button on a connection line to unlink

This is useful for maintaining parallel vanilla and modded playthroughs.

---

### Q: I accidentally overwrote a save. Can I get it back?

**A:** Yes! SlaySP2Manager creates automatic backups before every risky operation. Go to the Save Management section and browse the **Backup List** to restore a previous version.

---

## 🌐 Proxy & Network Issues

### Q: How do I configure a proxy?

**A:** Go to **Settings** → **Proxy Settings**:
1. Enable the proxy toggle
2. Select your proxy type (HTTP, HTTPS, or SOCKS5)
3. Enter the proxy address and port
4. Optionally enter username/password for authenticated proxies
5. Click **Test Connection** to verify
6. Save the settings

---

### Q: I'm in a region with restricted internet. Can I still use SlaySP2Manager?

**A:** Yes! Configure a proxy in Settings to route network traffic through a proxy server. Alternatively, you can:
1. Download mods manually from Nexus Mods or other sources
2. Transfer the files to your machine
3. Use the local import feature to install them

---

### Q: The app can't connect to Nexus Mods at all.

**A:** Troubleshooting steps:
1. Check your internet connection
2. Try accessing [nexusmods.com](https://www.nexusmods.com) in your browser
3. Configure a proxy in Settings if needed
4. Check if a firewall or antivirus is blocking the app
5. Try the built-in **Diagnostics** check in Settings

---

## ⚡ Performance & Compatibility

### Q: The app is slow or unresponsive during mod operations.

**A:** The app prevents concurrent operations to avoid conflicting file changes. If you're importing many mods at once, the batch process may take some time. Wait for the current operation to complete before starting a new one.

---

### Q: Will using mods affect my Steam achievements?

**A:** Yes, **mods may disable Steam achievements** in Slay the Spire 2. This is a game-level restriction, not caused by SlaySP2Manager. An "Achievement Enabler" mod may become available in the future (one existed for the original game).

---

### Q: Can I use mods in co-op multiplayer?

**A:** Yes, but with restrictions:
- All players must use the **exact same game version**
- All players must have the **same mods installed** (same versions)
- Mods marked with `affects_gameplay: true` must be installed by all players
- Cosmetic-only mods may not require all players to install them

---

## 🎮 Game-Specific Modding Issues

### Q: The game crashes after installing a mod.

**A:** Try these steps:
1. Disable the most recently installed mod in SlaySP2Manager
2. Check if the mod requires **BaseLib** or other dependencies
3. Make sure the mod is compatible with your game version
4. Check for conflicts with other installed mods
5. Try disabling all mods and re-enabling them one by one

---

### Q: Where should mod files be placed?

**A:** Mod files (`.dll` and `.pck`) should be placed directly in the `mods` folder inside the game's root directory:
```
<GameDirectory>/mods/
  ├── mod_name.dll
  ├── mod_name.pck
  └── mod_manifest.json  (optional)
```

**Do NOT** create sub-folders for each mod unless the mod specifically requires it. SlaySP2Manager handles all of this automatically.

---

### Q: How do I unlock all content after mod installation causes a reset?

**A:** If mod installation resets your progress:
1. Press the **`~`** key (tilde, left of `1`) in the game's main menu to open the console
2. Type `unlockall` and press Enter
3. This unlocks all characters, cards, relics, and game modes

To enable the full console, add `"full_console": true` to your `settings.save` file.

---

### Q: How do I completely remove all mods?

**A:** Two options:
1. **Using SlaySP2Manager:** Disable or uninstall all mods from the Library tab
2. **Manually:** Delete all files in the `mods` folder inside your game directory

---

### Q: The game asks me to restart in "mod mode." Is this normal?

**A:** Yes! When STS2 detects mods in the `mods` folder, it may prompt you to restart in mod mode. This is normal behavior and means the mods are being loaded correctly.

---

## 🆘 Still Need Help?

If your issue isn't covered here:

1. 🐛 [Open a GitHub Issue](https://github.com/wakaka6/SlaySP2Manger/issues/new) with a detailed description
2. 💬 Join the [Discussions](https://github.com/wakaka6/SlaySP2Manger/discussions) to ask the community
3. 📖 Check the [README](https://github.com/wakaka6/SlaySP2Manger#readme) for the latest information

---

**[← Back to Home](Home)**
