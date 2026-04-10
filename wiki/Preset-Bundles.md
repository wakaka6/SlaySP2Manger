# 📦 Preset Bundles

> **New in v0.8.0** — Package a preset with all its mods and share it. Friends import the bundle and start playing instantly.

---

## What Is a Preset Bundle?

A preset bundle is a `.zip` archive containing:

| Content | Description |
|---------|-------------|
| `preset.spm` | Manifest file recording the preset name, description, and included mod list |
| `mods/ModA/` | Complete mod folder (DLL, PCK, manifest, etc.) |
| `mods/ModB/` | … |

The recipient simply drops the bundle onto the SlaySP2Manager window — mods are installed and the preset is created automatically. No manual searching or downloading required.

---

## Exporting (Sharing) a Bundle

1. Go to the **Presets** page
2. Select the preset you want to share on the left panel
3. Click the **Share Bundle** button (📤) in the toolbar
4. Choose a save location in the file dialog
5. Wait for packaging to finish — the app writes the preset configuration and all associated mods into a `.zip` file

> **💡 Tip:** If a mod's install directory is empty (no actual files), it will be silently skipped and not included in the bundle.

---

## Importing a Bundle

### Method 1: Drag & Drop (recommended)

1. Drag the `.zip` bundle file directly onto the SlaySP2Manager window
2. The app automatically detects whether the file contains an `.spm` manifest
3. If it's a bundle, the app navigates to the **Presets** page and starts the import flow

### Method 2: Manual Import

1. Go to the **Presets** page
2. Click the **Import Bundle** button in the top-right corner
3. Select the `.zip` file in the file picker

---

## Conflict Resolution

When importing a bundle, the app checks whether any bundled mods share a name with locally installed mods:

- **No conflicts**: All mods are new — they are installed automatically and the preset is created with no extra steps.
- **Conflicts detected**: A conflict resolution panel appears showing:
  - 🆕 **New mods**: Not present locally — will be installed automatically
  - ⚠️ **Conflicting mods**: Share a name with an existing local mod — you decide what to do

For each conflicting mod, use the segmented toggle to choose:

| Option | Behavior |
|--------|----------|
| **Skip** | Keep your local version; do not install the bundled version |
| **Replace** | Overwrite the local version with the one from the bundle |

After confirming, the app installs the mods and creates a new preset. If the preset name already exists, a numeric suffix is appended automatically (e.g. `My Preset (2)`).

---

## Save Preset from Library

In addition to creating presets manually on the Presets page, you can:

1. Go to the **Library** page
2. Click the **Save as Preset** (🔖) button in the top-right corner
3. Enter a name and description
4. Confirm — all currently enabled mods are saved as a new preset

---

## FAQ

### Q: How large is a bundle file?

**A:** It depends on the number and size of the included mods. Since bundles are ZIP-compressed, the file is typically 20–40% smaller than the raw total of all mod files.

### Q: Where are imported mod files stored?

**A:** In the game's `mods/` directory, same as any other installed mod. Bundle import simply automates the installation process.

### Q: Can I share a bundle with someone who doesn't use SlaySP2Manager?

**A:** Bundles are standard ZIP files. The recipient can manually extract the `mods/` folders into their game directory. However, using SlaySP2Manager gives them conflict detection and preset management out of the box.

---

**[← Back to Home](Home)**
