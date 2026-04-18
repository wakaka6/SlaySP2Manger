# Changelog

All notable changes to SlaySP2Manager will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.9.0] - 2026-04-19

### Added

- **Native card compendium**: Added a dedicated Slay the Spire 2 compendium page with gallery browsing, card detail inspection, upgrade-state switching, and localized card text.
- **Game-asset card rendering**: The compendium now extracts card art, frames, banners, energy icons, and title fonts from the local game install so the card presentation matches in-game assets much more closely.
- **Runtime snapshot generation**: Compendium metadata is now generated from the local game install at refresh time and cached in the app cache directory, removing the need to track a bundled `card-metadata` JSON file in the repository.

### Changed

- **Compendium browsing polish**: Added a sticky filter toolbar, collapsible filter section, back-to-top action, and a fuller light-theme treatment to make long compendium sessions easier to navigate.
- **Refresh pipeline now stays local**: Refreshing compendium resources now rebuilds metadata and native asset caches from the detected game path instead of relying on a repository snapshot.
- **Profile mod selection autosave**: Mod selection changes inside Profiles are now persisted automatically for existing profiles, reducing the need for repetitive manual saves.

### Fixed

- Fixed the compendium card shell so native frame, banner, energy, and typography alignment are materially closer to the game's own card layout.
- Fixed the compendium browsing flow for long lists by reducing filter-panel overhead while scrolling and improving recovery back to the top of the page.
- Fixed profile editing scenarios where rapid mod selection changes could otherwise lag behind the latest intended profile state.

## [0.8.2] - 2026-04-18

### Added

- **Preset and custom mod tags**: Mods can now carry localized preset tags and user-defined tags, and the same tag model is available in both the Library and the preset mod picker.
- **Animated manager lists**: Preset and manager selection now use a motion-enhanced scrolling list for a smoother, more legible browsing experience.

### Changed

- **Refined tag authoring**: Creating tags is now click-first instead of comma-separated text, preset tags include icons, custom tags use a dedicated icon, and custom tags can be renamed inline after creation.
- **Quieter filter rail**: The Library's left-side tag filters are now left-aligned, hide zero-count preset tags, collapse empty preset/custom groups, truncate overly long custom labels safely, and reduce visual noise while preserving counts.
- **Interactive UI polish**: Added restrained hover and focus feedback to Library mod cards and linked save slots so scanning mods and save relationships feels more responsive without becoming noisy.

### Fixed

- Fixed long custom tag names overflowing into adjacent content in both the mod card editor and the left filter list.
- Fixed the "Add tag" affordance appearing too eagerly in existing tag rows; it now stays contextual and only fades in on hover when a mod already has tags.

## [0.8.1] - 2026-04-11

### Changed

- **Quieter Saves UI**: Removed the top status ribbon and pairing hint banner so the page relies on card highlighting, connection lines, and only a minimal bottom-corner error signal when something actually fails.
- **Reworked loading transition**: The Saves page now uses layout-matched skeletons with a subtle staggered reveal for the cloud area, sync bar, slot cards, and backup section.

### Fixed

- Fixed the Saves page briefly flashing “no vanilla saves / no modded saves” empty states before real data finished loading.
- Fixed visible layout jumps between the loading state and real content by aligning skeleton dimensions with the final cards, actions, and backup panel.

## [0.8.0] - 2026-04-11

### Added

- **Preset bundles**: Package a preset along with all its mods into a single `.zip` bundle (containing an `.spm` manifest) and share it with friends or the community in one click.
- **Import bundles**: Click "Import Bundle" on the Presets page or drag-and-drop a bundle onto the window to preview the included mods and import them instantly. When duplicate mods are detected, a conflict resolution panel lets you choose "Skip" or "Replace" for each mod individually.
- **Save preset from Library**: A new "Save as Preset" button in the Library page captures all currently enabled mods as a new preset with a custom name and description.
- **Drag-and-drop bundle import**: Drop a `.zip` bundle file onto the app window — the app automatically detects the `.spm` manifest, navigates to Presets, and walks you through the import flow.

### Changed

- **Removed legacy JSON export**: The old "Export" action (JSON-only) has been removed from Presets. "Share Bundle" is now the single export path, ensuring recipients get both configuration and mod files.
- **In-app delete confirmation**: Preset deletion now uses the app's `ConfirmDialog` component instead of the native `window.confirm`, keeping the experience visually consistent.
- **Pill-toggle conflict resolution**: The per-mod "Skip / Replace" selector in the conflict dialog has been changed from a dropdown to a segmented pill toggle for faster, more intuitive interaction.
- **Sidebar preset list live refresh**: The sidebar preset picker now updates immediately after importing or deleting a preset.

### Fixed

- Fixed preset bundle export including empty mod directories (no actual files); empty directories are now silently skipped.
- Fixed UI freeze when batch-checking mod updates in the Library by switching to async incremental result streaming.
- Fixed i18n template placeholders (`{count}`, `{path}`) not rendering correctly in bundle-related messages.

## [0.7.1] - 2026-04-07

### Fixed

- **Updater proxy support**: The in-app update flow now reuses the proxy configured in Settings, so both update checks and update downloads follow the same HTTP / HTTPS / SOCKS5 proxy path as the rest of the app.
- **Desktop shortcut preference preserved on updates**: Windows MSI upgrades now keep the original desktop shortcut choice. If the previous install did not enable a desktop shortcut, the updater removes the newly created shortcut and its registry marker after upgrade.

## [0.7.0] - 2026-04-07

### Added

- **Nexus artwork previews**: Discover now shows mod artwork previews so you can evaluate results faster without opening each detail page first.
- **Multiplayer impact metadata**: The Library and the Profiles mod picker now show a restrained "Affects Co-op" tag for mods whose manifests declare `affects_gameplay = true`.

### Changed

- **Dark by default**: First launch now defaults to dark mode whenever no local theme preference has been stored yet.
- **Library and shell polish**: Refined the Library filter rail, collapsed sidebar treatment, and version badge presentation for a cleaner, more stable visual hierarchy.
- **Save slot alignment**: Saves now keeps vanilla and modded slots in a fixed 1:1 vertical order so cross-environment relationships remain easy to read.

### Fixed

- Fixed manifest parsing for mod JSON files encoded with UTF-8 BOM or UTF-16 so metadata can still be detected correctly.
- Fixed Profiles so preset mod choices refresh after Library changes and the left preset rail stays pinned below the page header while scrolling.
- Fixed Saves connection lines after window resizing so links no longer drift across cards or imply the wrong slot pairing.

## [0.6.1] - 2026-04-05

### Added

- **Cloud diff workbench**: Added a dedicated review workspace for real local-vs-cloud mismatches with delta-style diff, exact file metadata, inline text editing, and one-click copy between local and Steam cloud cache.
- **Steam cloud sync documentation**: Added `docs/steam-cloud-sync-notes.md`, `docs/remotecache-vdf-reference.md`, and `docs/save-file-reference.md` to document Steam Cloud cache behavior, `remotecache.vdf`, and long-term save/progress fields.

### Changed

- Cloud cache preparation now aligns file mtimes and rebuilds `remotecache.vdf` after cloud-side writes so Steam sees a self-consistent cache snapshot on next launch.
- The pre-launch cloud mismatch guard can now jump directly into Saves and auto-open the cloud diff workbench.
- Backup artifacts are hidden by default in the cloud diff workbench so long-term progress files stay visible first during review.

### Fixed

- Fixed a startup crash caused by removing `history/*.run.backup` files that Slay the Spire 2 still expects during Steam cloud sync. The unsafe backup-cleanup path is now disabled.
- Fixed the review dialog being visually trapped behind higher-level shell overlays and title/drag layers.
- Fixed cloud-side mutations while Steam or the game is still running by blocking those writes until both processes are closed.

## [0.5.0] - 2026-03-27

### Added

- **Mod notes / alias** (#2): Add custom notes or aliases to any installed mod for easier identification. Notes are displayed as accent-colored badges on mod cards, and can be searched in the library search bar. Data is stored locally in localStorage.
- **Commit search on Enter**: Library and Discover search now only trigger after pressing the Enter key to prevent unnecessary flashing and resource consumption while typing. An "Enter ↵" hint badge is displayed inside the input field when typing.

## [0.4.2] - 2026-03-24

### Added

- **Version display & update UX**: App version pill in sidebar footer; green dot indicator when update is available; click to navigate to Settings
- **About section in Settings**: Displays current version, update status badge, and "Check for Updates" / "Update Now" buttons
- **Shared update context** (`UpdateContext.tsx`): Centralized update state management (checking, available, downloading, restarting, error) consumed by sidebar, settings, and modal
- **Configurable auto-backup retention**: New setting to control how many auto-backups to keep per slot (1–50, default 5); manual backups are always preserved
- **Profile directory-level sync**: Save operations (backup, sync, restore) now handle the entire profile directory including `replay/` subfolder
- **Sticky glassmorphism page headers**: Page titles on Settings, Saves, and Profiles pages now stick to the top with a frosted-glass backdrop when scrolling
- **Open folder button**: Each save slot card now has a folder icon to open its directory in the system file explorer

### Changed

- Save history groups are now **collapsed by default** for a cleaner initial view
- Refactored `UpdateChecker.tsx` to consume the shared `UpdateContext` instead of managing its own state
- Improved save transfer dialog with visual slot picker and clearer backup explanations
- Backup history displayed as a chronological timeline grouped by slot and kind

### Fixed

- Save sync now copies all files in the profile directory, preventing data loss from missing `replay/` folder
- Auto-backup pruning respects configured limit and runs after every sync and save-guard cycle
- Version pill repositioned below "Launch Game" button to avoid visual clutter
- Profiles page header no longer overlaps with window control buttons

## [0.4.1] - 2026-03-22

### Fixed

- Added window control permissions (`window:allow-minimize`, `window:allow-maximize`, `window:allow-close`)
- Reordered window buttons to standard min/max/close layout

## [0.4.0] - 2026-03-22

### Added

- macOS-style frameless window with custom title bar and drag region
- Collapsible sidebar with animated toggle
- Proxy settings (HTTP / HTTPS / SOCKS5) with test connectivity button
- First-launch setup wizard with browser-based folder picker
- Auto-updater with `.sig` signature verification in CI release workflow

## [0.3.0] - 2026-03-21

### Added

- Batch mod import: select multiple files/folders at once
- Import preview dialog with file list and selection controls
- Multi-format archive support (ZIP, 7z) with graceful RAR fallback
- Per-import error handling — individual failures no longer block the batch

## [0.2.1] - 2026-03-21

### Fixed

- Paste API Key button now uses `navigator.clipboard.readText()` instead of deprecated `document.execCommand`
- API Key auto-saves on change

## [0.2.0] - 2026-03-21

### Added

- Improved drag-and-drop UX with visual drop zone overlay
- Refined import status dialogs with clear success/error states

## [0.1.1] - 2026-03-21

### Fixed

- Hide console window in release builds

### Changed

- Documentation improvements: demo video, Nexus mod translation feature description

## [0.1.0] - 2026-03-21

### Added

- Initial release of SlaySP2Manager
- Mod library: install, enable/disable, and remove mods
- Nexus Mods integration with API key authentication and one-click download (premium)
- Manual download guide for non-premium Nexus users
- Mod profiles: save/load/export sets of enabled mods
- Save management: backup, restore, and sync saves between vanilla and modded environments
- Save pairing and cross-environment synchronization
- Bilingual UI (English / 简体中文)
