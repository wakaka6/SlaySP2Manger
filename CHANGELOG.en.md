# Changelog

All notable changes to SlaySP2Manager will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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