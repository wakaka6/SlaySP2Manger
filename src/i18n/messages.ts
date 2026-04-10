export type Locale = "zh-CN" | "en-US";

export type MessageKey =
  | "nav.library"
  | "nav.discover"
  | "nav.profiles"
  | "nav.saves"
  | "nav.settings"
  | "nav.system"
  | "nav.launchGame"
  | "nav.currentProfile"
  | "settings.title"
  | "settings.description"
  | "settings.gameDirectory"
  | "settings.gameRoot"
  | "settings.disabledFolder"
  | "settings.autoDetect"
  | "settings.saveDirectory"
  | "settings.nexus"
  | "settings.apiKey"
  | "settings.saveCredentials"
  | "settings.language"
  | "settings.languageHelp"
  | "settings.languageZh"
  | "settings.languageEn"
  | "settings.theme"
  | "settings.themeHelp"
  | "settings.themeLight"
  | "settings.themeDark"
  | "settings.themeSystem"
  | "settings.themeApplied"
  | "settings.currentAppearance"
  | "settings.currentAppearanceLight"
  | "settings.currentAppearanceDark"
  | "settings.savedGameDirectory"
  | "settings.clearedGameDirectory"
  | "settings.detectedGameDirectory"
  | "settings.gameNotFound"
  | "settings.savedLanguage"
  | "settings.preferences"
  | "settings.nexusIntegration"
  | "settings.apiKeyPlaceholder"
  | "settings.apiKeyHidden"
  | "settings.apiKeyVisible"
  | "settings.paste"
  | "settings.saveNexusAuth"
  | "settings.apiKeySaved"
  | "settings.apiKeyPrivacy"
  | "settings.nexusAccount"
  | "settings.howToGetKey"
  | "settings.tutorialTitle"
  | "settings.tutorialStep1"
  | "settings.tutorialStep2"
  | "settings.tutorialStep3"
  | "settings.tutorialStep4"
  | "settings.tutorialStep5"
  | "settings.tutorialStep6"
  | "settings.tutorialCollapse"
  | "settings.tutorialLinkSite"
  | "settings.tutorialLinkApi"
  | "settings.proxy"
  | "settings.proxyUrl"
  | "settings.proxyPlaceholder"
  | "settings.proxyHelp"
  | "settings.proxySave"
  | "settings.proxySaved"
  | "settings.proxyTest"
  | "settings.proxyTestSuccess"
  | "settings.proxyTestFail"
  | "settings.proxyCleared"
  | "settings.autoBackupTitle"
  | "settings.autoBackupHelp"
  | "settings.autoBackupSaved"
  | "welcome.title"
  | "welcome.subtitle"
  | "welcome.step1"
  | "welcome.step2"
  | "welcome.step3"
  | "welcome.placeholder"
  | "welcome.submit"
  | "welcome.browse"
  | "welcome.error"
  | "updater.available"
  | "updater.body"
  | "updater.downloading"
  | "updater.install"
  | "updater.later"
  | "updater.restarting"
  | "updater.newVersion"
  | "updater.upToDate"
  | "updater.checkNow"
  | "settings.aboutTitle"
  | "profiles.title"
  | "profiles.description"
  | "profiles.new"
  | "profiles.savedProfiles"
  | "profiles.profileDetails"
  | "profiles.newProfile"
  | "profiles.noProfiles"
  | "profiles.noProfilesHelp"
  | "profiles.active"
  | "profiles.modsCount"
  | "profiles.name"
  | "profiles.descriptionLabel"
  | "profiles.namePlaceholder"
  | "profiles.descriptionPlaceholder"
  | "profiles.selectedCount"
  | "profiles.installedCount"
  | "profiles.useCurrentEnabled"
  | "profiles.save"
  | "profiles.apply"
  | "profiles.export"
  | "profiles.delete"
  | "profiles.modSelection"
  | "profiles.modSelectionHelp"
  | "profiles.noMods"
  | "profiles.noModsHelp"
  | "profiles.included"
  | "profiles.excluded"
  | "profiles.unknownAuthor"
  | "profiles.noDescription"
  | "profiles.loading"
  | "profiles.creating"
  | "profiles.selected"
  | "profiles.synced"
  | "profiles.nameRequired"
  | "profiles.created"
  | "profiles.saved"
  | "profiles.saveFailed"
  | "profiles.applyNeedSave"
  | "profiles.applied"
  | "profiles.applyFailed"
  | "profiles.exportNeedSave"
  | "profiles.exported"
  | "profiles.exportCancelled"
  | "profiles.exportFailed"
  | "profiles.deleted"
  | "profiles.deleteFailed"
  | "profiles.confirmDelete"
  | "profiles.statusEnabled"
  | "profiles.statusDisabled"
  | "profiles.statusMissing"
  | "profiles.savedCount"
  | "profiles.modCountBadge"
  | "profiles.liveBadge"
  | "profiles.eyebrowNew"
  | "profiles.eyebrowDetail"
  | "profiles.applyTitle"
  | "profiles.applySub"
  | "discover.title"
  | "discover.description"
  | "discover.searchPlaceholder"
  | "discover.statusLoading"
  | "discover.statusFound"
  | "discover.statusEmpty"
  | "discover.statusFailed"
  | "discover.apiKeyMissing"
  | "discover.apiKeyMissingHelp"
  | "discover.configureApiKey"
  | "discover.apiKeyInvalid"
  | "discover.noResults"
  | "discover.noResultsHelp"
  | "discover.preview"
  | "discover.openNexus"
  | "discover.searchRelated"
  | "discover.unknownAuthor"
  | "discover.latestVersion"
  | "discover.noSummary"
  | "discover.previewEmpty"
  | "discover.filterPopular"
  | "discover.filterNewest"
  | "discover.filterLatestUpdated"
  | "discover.filterQol"
  | "discover.filterUi"
  | "discover.filterBalance"
  | "discover.filterTools"
  | "discover.resultCount"
  | "discover.downloads"
  | "discover.translating"
  | "discover.translated"
  | "discover.translateBtn"
  | "discover.installBtn"
  | "discover.downloadingBtn"
  | "discover.totalCount"
  | "discover.pageInfo"
  | "discover.loadMore"
  | "discover.noMore"
  | "discover.filterDownloads"
  | "discover.filterUpdates"
  | "discover.updatesLoading"
  | "discover.updateAvailable"
  | "discover.localVersion"
  | "discover.noUpdates"
  | "discover.updatesCount"
  | "discover.premiumHint"
  | "discover.manualStep1"
  | "discover.manualStep2"
  | "discover.manualStep3"
  | "discover.goToLibrary"
  | "download.title"
  | "download.clear"
  | "download.fetchingFiles"
  | "download.downloading"
  | "download.installing"
  | "download.done"
  | "download.failed"
  | "download.noFiles"
  | "download.premiumRequired"
  | "library.title"
  | "library.description"
  | "library.importZip"
  | "library.ready"
  | "library.enabled"
  | "library.disabled"
  | "library.activity"
  | "library.emptyEnabled"
  | "library.emptyEnabledHelp"
  | "library.conflictReplace"
  | "library.conflictRename"
  | "library.emptyDisabled"
  | "library.emptyDisabledHelp"
  | "library.noActivity"
  | "library.noActivityHelp"
  | "library.enable"
  | "library.disable"
  | "library.uninstall"
  | "library.unknownVersion"
  | "library.generatedPreview"
  | "library.importFailed"
  | "library.importCancelled"
  | "library.imported"
  | "library.enabledStatus"
  | "library.disabledStatus"
  | "library.updateAvailable"
  | "library.needsAttention"
  | "library.unknownStatus"
  | "library.installPreviewTitle"
  | "library.installPreviewSafe"
  | "library.installPreviewConflict"
  | "library.startInstall"
  | "library.confirmUninstallTitle"
  | "library.confirmUninstallBody"
  | "library.enableAfterImport"
  | "library.installOnly"
  | "library.installAndEnable"
  | "library.dropHint"
  | "library.dropHintTooltip"
  | "library.noSearchResults"
  | "library.searchPlaceholder"
  | "library.openFolder"
  | "library.unknownAuthor"
  | "library.dropTitle"
  | "library.dropSubtitle"
  | "library.importFiles"
  | "library.importFolder"
  | "library.scanning"
  | "library.batchPreviewTitle"
  | "library.batchPreviewDesc"
  | "library.batchInstallSelected"
  | "library.batchInstalling"
  | "library.batchResultTitle"
  | "library.batchResultSummary"
  | "library.batchSource"
  | "library.batchSourceFolder"
  | "library.batchSourceArchive"
  | "library.batchStatusReady"
  | "library.batchStatusConflict"
  | "library.batchStatusUnsupported"
  | "library.batchStatusError"
  | "library.batchAllSuccess"
  | "library.saveGuardSynced"
  | "library.saveGuardBackedUp"
  | "library.saveGuardWarnTitle"
  | "library.saveGuardWarnBody"
  | "library.saveGuardGoToPair"
  | "library.saveGuardContinue"
  | "library.notePlaceholder"
  | "library.noteTooltip"
  | "library.noteClear"
  | "library.noteSaved"
  | "library.multiplayerAffected"
  | "library.filters"
  | "library.clearFilters"
  | "library.noFilterResults"
  | "error.gameNotFound"
  | "error.modNotFound"
  | "error.modConflict"
  | "error.invalidArchive"
  | "error.ioPermission"
  | "error.ioGeneral"
  | "error.localSaveNotFound"
  | "error.cloudSaveNotFound"
  | "error.activeUserNotFound"
  | "error.closeSteamAndGameBeforeCloudSync"
  | "error.closeGameBeforeCloudSync"
  | "error.steamRunningBeforeCloudSync"
  | "saves.title"
  | "saves.description"
  | "saves.ready"
  | "saves.noVanilla"
  | "saves.noVanillaHelp"
  | "saves.noModded"
  | "saves.noModdedHelp"
  | "saves.vanilla"
  | "saves.modded"
  | "saves.vanillaTitle"
  | "saves.moddedTitle"
  | "saves.backup"
  | "saves.restore"
  | "saves.backups"
  | "saves.noBackups"
  | "saves.noBackupsHelp"
  | "saves.copyToModded"
  | "saves.copyToVanilla"
  | "saves.files"
  | "saves.noModified"
  | "saves.slotLabel"
  | "saves.backupLabel"
  | "saves.previewCreated"
  | "saves.previewFailed"
  | "saves.transferDone"
  | "saves.transferDoneWithBackup"
  | "saves.transferFailed"
  | "saves.backupDone"
  | "saves.backupFailed"
  | "saves.restoreDone"
  | "saves.restoreFailed"
  | "saves.transferMissing"
  | "saves.confirmTransfer"
  | "saves.transferTitle"
  | "saves.transferLinkedWarning"
  | "saves.confirmRestore"
  | "saves.source"
  | "saves.target"
  | "saves.transferDesc"
  | "saves.transferBackupNote"
  | "saves.confirmRestoreDesc"
  | "saves.slotLabelShort"
  | "saves.stateData"
  | "saves.stateEmpty"
  | "saves.deleteBackupDone"
  | "saves.deleteBackupFailed"
  | "saves.openFolder"
  | "saves.delete"
  | "saves.autoSyncLabel"
  | "saves.syncNow"
  | "saves.syncDone"
  | "saves.syncUpToDate"
  | "saves.syncFailed"
  | "saves.syncNoPairs"
  | "saves.pairCount"
  | "saves.pairNone"
  | "saves.linkHint"
  | "saves.linkSelectModded"
  | "saves.linkCreated"
  | "saves.linkRemoved"
  | "saves.reasonManual"
  | "saves.reasonAutoTransfer"
  | "saves.reasonAutoSync"
  | "saves.reasonAutoPathSwitch"
  | "saves.reasonUnknown"
  | "saves.timeJustNow"
  | "saves.timeMinutesAgo"
  | "saves.timeHoursAgo"
  | "saves.timeHoursAgo"
  | "saves.timeDaysAgo"
  | "saves.cloudSanctuary"
  | "saves.cloudDetected"
  | "saves.cloudInSync"
  | "saves.cloudMismatch"
  | "saves.cloudMismatchSummary"
  | "saves.cloudNotFound"
  | "saves.cloudScanning"
  | "saves.cloudDescend"
  | "saves.cloudAscend"
  | "saves.cloudAscending"
  | "saves.cloudDescending"
  | "saves.cloudAscendDone"
  | "saves.cloudDescendDone"
  | "saves.cloudAscendPreparedWithWarnings"
  | "saves.cloudDescendPreparedWithWarnings"
  | "saves.cloudAscendFailed"
  | "saves.cloudDescendFailed"
  | "saves.cloudSteamRunningTitle"
  | "saves.cloudSteamRunningBody"
  | "saves.cloudSteamRunningHint"
  | "saves.cloudSteamRunningContinue"
  | "saves.cloudSteamRunningReview"
  | "saves.cloudReviewBeforeLaunch"
  | "saves.cloudReviewDiff"
  | "saves.cloudDiffWorkbenchTitle"
  | "saves.cloudDiffWorkbenchBody"
  | "saves.cloudDiffRefresh"
  | "saves.cloudDiffHideBackups"
  | "saves.cloudDiffShowBackups"
  | "saves.cloudDiffNoItems"
  | "saves.cloudDiffNoSelection"
  | "saves.cloudDiffDifferent"
  | "saves.cloudDiffLocalOnly"
  | "saves.cloudDiffCloudOnly"
  | "saves.cloudDiffInSync"
  | "saves.cloudDiffLocal"
  | "saves.cloudDiffCloud"
  | "saves.cloudDiffUseLocal"
  | "saves.cloudDiffUseCloud"
  | "saves.cloudDiffEditLocal"
  | "saves.cloudDiffEditCloud"
  | "saves.cloudDiffEditing"
  | "saves.cloudDiffEditingBody"
  | "saves.cloudDiffCancelEdit"
  | "saves.cloudDiffSaveEdit"
  | "saves.cloudDiffTextUnsupported"
  | "saves.cloudDiffTextUnsupportedBody"
  | "saves.cloudDiffUnchangedFold"
  | "saves.cloudDiffStickyNote"
  | "saves.cloudDiffNoiseNote"
  | "saves.cloudDiffCleanBackups"
  | "saves.cloudDiffCleanBackupsConfirmTitle"
  | "saves.cloudDiffCleanBackupsConfirmBody"
  | "saves.cloudDiffCleanBackupsConfirmAction"
  | "saves.cloudDiffCleanBackupsHint"
  | "saves.cloudDiffCleanBackupsDone"
  | "saves.cloudLaunchMismatchTitle"
  | "saves.cloudLaunchMismatchBody"
  | "saves.reviewInSaves"
  | "saves.launchAnyway"
  | "saves.timeFragments"
  | "common.cancel"
  | "common.confirm";

type Dictionary = Record<MessageKey, string>;

export const MESSAGES: Record<Locale, Dictionary> = {
  "en-US": {
    "nav.library": "Library",
    "nav.discover": "Discover",
    "nav.profiles": "Profiles",
    "nav.saves": "Saves",
    "nav.settings": "Settings",
    "nav.system": "System",
    "nav.launchGame": "Launch Game",
    "nav.currentProfile": "Current Profile",
    "settings.title": "Settings",
    "settings.description": "Configure the game directory, disabled mods folder, Nexus credentials, and application language.",
    "settings.gameDirectory": "Game Directory",
    "settings.gameRoot": "Slay the Spire 2 Root Directory",
    "settings.disabledFolder": "Disabled Mods Folder Name",
    "settings.autoDetect": "Auto Detect",
    "settings.saveDirectory": "Save Directory",
    "settings.nexus": "Nexus Mods",
    "settings.apiKey": "Personal API Key",
    "settings.saveCredentials": "Save Credentials",
    "settings.language": "Language",
    "settings.languageHelp": "Switching language will take effect immediately.",
    "settings.languageZh": "Chinese",
    "settings.languageEn": "English",
    "settings.theme": "Appearance",
    "settings.themeHelp": "Select light, dark or follow system theme.",
    "settings.themeLight": "Light",
    "settings.themeDark": "Dark",
    "settings.themeSystem": "System",
    "settings.themeApplied": "Theme updated.",
    "settings.currentAppearance": "Current effective appearance",
    "settings.currentAppearanceLight": "Light",
    "settings.currentAppearanceDark": "Dark",
    "settings.savedGameDirectory": "Game directory saved.",
    "settings.clearedGameDirectory": "Game directory configuration cleared.",
    "settings.detectedGameDirectory": "Game directory automatically located and saved.",
    "settings.gameNotFound": "Could not find game installation directory.",
    "settings.savedLanguage": "Language updated.",
    "settings.preferences": "Preferences",
    "settings.nexusIntegration": "Nexus Integration",
    "settings.apiKeyPlaceholder": "Paste your personal API Key here",
    "settings.apiKeyHidden": "Hide",
    "settings.apiKeyVisible": "Show",
    "settings.paste": "Paste",
    "settings.saveNexusAuth": "Save Nexus Auth",
    "settings.apiKeySaved": "Saved",
    "settings.apiKeyPrivacy": "Your API Key is stored locally only and never uploaded to any server.",
    "settings.nexusAccount": "Nexus Mods Account",
    "settings.howToGetKey": "Don't know how to get one?",
    "settings.tutorialTitle": "How to Get Your API Key",
    "settings.tutorialStep1": "Open NexusMods website (nexusmods.com)",
    "settings.tutorialStep2": "Log in to your Nexus account",
    "settings.tutorialStep3": "Go to your account details page \u2192 API tab",
    "settings.tutorialStep4": "Scroll to the bottom of the page",
    "settings.tutorialStep5": "Copy the text inside the \"Personal API Key\" box",
    "settings.tutorialStep6": "Come back here and paste it in the field above",
    "settings.tutorialCollapse": "Hide Instructions",
    "settings.tutorialLinkSite": "Nexus Mods",
    "settings.tutorialLinkApi": "API Access Page",

    "settings.proxy": "Proxy",
    "settings.proxyUrl": "Proxy URL",
    "settings.proxyPlaceholder": "e.g., http://127.0.0.1:7890 or socks5://127.0.0.1:1080",
    "settings.proxyHelp": "Supports HTTP, HTTPS, and SOCKS5 proxies for all network requests.",
    "settings.proxySave": "Save Proxy",
    "settings.proxySaved": "Proxy settings saved.",
    "settings.proxyTest": "Test",
    "settings.proxyTestSuccess": "Proxy connection successful!",
    "settings.proxyTestFail": "Proxy test failed: {error}",
    "settings.proxyCleared": "Proxy settings cleared.",
    "settings.autoBackupTitle": "Auto-Backup Limit",
    "settings.autoBackupHelp": "Maximum auto-backups to keep per save slot. Manual backups are always kept.",
    "settings.autoBackupSaved": "Auto-backup limit saved.",

    "welcome.title": "Welcome to SlaySP2Manager",
    "welcome.subtitle": "To get started, please locate your Slay the Spire 2 installation folder.",
    "welcome.step1": "Open Steam, right-click Slay the Spire 2 in your library and select Manage.",
    "welcome.step2": "Select Browse local files. This will open your game directory.",
    "welcome.step3": "Copy the folder path from the address bar and paste it below.",
    "welcome.placeholder": "e.g., C:\\Program Files (x86)\\Steam\\steamapps\\common\\Slay the Spire 2",
    "welcome.submit": "Save and Continue",
    "welcome.browse": "Browse...",
    "welcome.error": "Invalid game directory. SlayTheSpire2.exe not found.",

    "updater.available": "New Version Available",
    "updater.body": "Version {version} is ready. Would you like to update now?",
    "updater.downloading": "Downloading update…",
    "updater.install": "Update Now",
    "updater.later": "Later",
    "updater.restarting": "Restarting…",
    "updater.newVersion": "New version available",
    "updater.upToDate": "You're up to date",
    "updater.checkNow": "Check for Updates",
    "settings.aboutTitle": "About",

    "profiles.title": "Profiles",
    "profiles.description": "Save a set of mod states as a reusable configuration and apply it to the game.",
    "profiles.new": "New Profile",
    "profiles.savedProfiles": "Saved Profiles",
    "profiles.profileDetails": "Profile Details",
    "profiles.newProfile": "New Profile",
    "profiles.noProfiles": "No saved profiles yet.",
    "profiles.noProfilesHelp": "Click the new button in the top right to start selecting mods.",
    "profiles.active": "Active",
    "profiles.modsCount": "{count} mods",
    "profiles.name": "Profile Name",
    "profiles.descriptionLabel": "Description",
    "profiles.namePlaceholder": "e.g., Lightweight QoL",
    "profiles.descriptionPlaceholder": "Describe what this profile is for.",
    "profiles.selectedCount": "Selected {count}",
    "profiles.installedCount": "Installed {count}",
    "profiles.useCurrentEnabled": "Sync from Current Enabled",
    "profiles.save": "Save",
    "profiles.apply": "Apply",
    "profiles.export": "Export",
    "profiles.delete": "Delete",
    "profiles.modSelection": "Mod Selection",
    "profiles.modSelectionHelp": "Click to add or remove from current profile.",
    "profiles.noMods": "No available mods.",
    "profiles.noModsHelp": "Please import or install mods first before creating a profile.",
    "profiles.included": "Included",
    "profiles.excluded": "Excluded",
    "profiles.unknownAuthor": "Unknown Author",
    "profiles.noDescription": "No description.",
    "profiles.loading": "Loading profiles...",
    "profiles.creating": "Creating new profile.",
    "profiles.selected": "Selected profile: {name}",
    "profiles.synced": "Synced profile list from current enabled mods.",
    "profiles.nameRequired": "Profile name cannot be empty.",
    "profiles.created": "Created profile: {name}",
    "profiles.saved": "Saved profile: {name}",
    "profiles.saveFailed": "Failed to save profile.",
    "profiles.applyNeedSave": "Please save the profile before applying.",
    "profiles.applied": "Applied profile {name}: {summary}.",
    "profiles.applyFailed": "Failed to apply profile.",
    "profiles.exportNeedSave": "Please save the profile before exporting.",
    "profiles.exported": "Exported to {path}",
    "profiles.exportCancelled": "Export cancelled.",
    "profiles.exportFailed": "Failed to export profile.",
    "profiles.deleted": "Deleted profile: {name}",
    "profiles.deleteFailed": "Failed to delete profile.",
    "profiles.confirmDelete": "Confirm deletion of profile \"{name}\"?",
    "profiles.statusEnabled": "Enabled {count}",
    "profiles.statusDisabled": "Disabled {count}",
    "profiles.statusMissing": "Missing {count}",
    "profiles.savedCount": "Saved \u00b7 {count} profiles",
    "profiles.modCountBadge": "{count} mods",
    "profiles.liveBadge": "Live",
    "profiles.eyebrowNew": "\u2726 New Profile",
    "profiles.eyebrowDetail": "Profile Details",
    "profiles.applyTitle": "Apply this Profile",
    "profiles.applySub": "Switch game mod loading environment",
    "discover.title": "Discover",
    "discover.description": "Search for mods for Slay the Spire 2 and view details on Nexus.",
    "discover.searchPlaceholder": "Search mod name, author or category...",
    "discover.statusLoading": "Loading recommendations...",
    "discover.statusFound": "Found {count} results",
    "discover.statusEmpty": "No results found.",
    "discover.statusFailed": "Search failed.",
    "discover.apiKeyMissing": "API Key Required",
    "discover.apiKeyMissingHelp": "Please fill in your Nexus Mods API key in Settings to use the Discover feature.",
    "discover.configureApiKey": "Go to Settings",
    "discover.apiKeyInvalid": "Invalid API Key, please reconfigure in Settings.",
    "discover.noResults": "No results matching your query.",
    "discover.noResultsHelp": "Try different keywords or check Nexus directly.",
    "discover.preview": "Detail Preview",
    "discover.openNexus": "Open Nexus Page",
    "discover.searchRelated": "Search related keywords",
    "discover.unknownAuthor": "Unknown Author",
    "discover.latestVersion": "Latest Version",
    "discover.noSummary": "No summary available.",
    "discover.previewEmpty": "Select a mod from the list to see details here.",
    "discover.filterPopular": "Trending",
    "discover.filterNewest": "Latest Added",
    "discover.filterLatestUpdated": "Latest Updated",
    "discover.filterQol": "QoL",
    "discover.filterUi": "UI",
    "discover.filterBalance": "Balance",
    "discover.filterTools": "Tools",
    "discover.resultCount": "{count} results",
    "discover.downloads": "Downloads",
    "discover.translating": "Translating...",
    "discover.translated": "Translated",
    "discover.translateBtn": "Translate",
    "discover.installBtn": "Install",
    "discover.downloadingBtn": "Downloading...",
    "discover.totalCount": "{total} mods available",
    "discover.pageInfo": "Showing {from}-{to} of {total}",
    "discover.loadMore": "Load More",
    "discover.noMore": "All loaded",
    "discover.filterDownloads": "Most Downloaded",
    "discover.filterUpdates": "Has Updates",
    "discover.updatesLoading": "Checking for updates...",
    "discover.updateAvailable": "Update available",
    "discover.localVersion": "Local: v{version}",
    "discover.noUpdates": "All installed mods are up to date.",
    "discover.updatesCount": "{count} updates available",
    "discover.premiumHint": "Nexus Premium required for direct download. You can download manually:",
    "discover.manualStep1": "Click \"Open Nexus Page\" to visit the mod page",
    "discover.manualStep2": "Download the zip file from Nexus manually",
    "discover.manualStep3": "Simply drag and drop the ZIP file into this window to install",
    "discover.goToLibrary": "Go to Library",
    "download.title": "Downloads",
    "download.clear": "Clear",
    "download.fetchingFiles": "Fetching files...",
    "download.downloading": "Downloading...",
    "download.installing": "Installing...",
    "download.done": "Done",
    "download.failed": "Failed",
    "download.noFiles": "No files found",
    "download.premiumRequired": "Premium required",
    "library.title": "Mod Library",
    "library.description": "Manage your installed mods, enable/disable them, or install new ones.",
    "library.importZip": "Import Archive (.zip)",
    "library.ready": "Ready",
    "library.enabled": "Enabled",
    "library.disabled": "Disabled",
    "library.activity": "Activity",
    "library.emptyEnabled": "No enabled mods.",
    "library.emptyEnabledHelp": "Get started by browsing Discover, or simply drag and drop a ZIP file here.",
    "library.conflictReplace": "Override existing mod",
    "library.conflictRename": "Install with new ID (auto-rename)",
    "library.emptyDisabled": "No disabled mods.",
    "library.emptyDisabledHelp": "Mods you disable will appear here.",
    "library.noActivity": "No recent activity.",
    "library.noActivityHelp": "Installing, enabling or disabling mods will show up here.",
    "library.enable": "Enable",
    "library.disable": "Disable",
    "library.uninstall": "Uninstall",
    "library.unknownVersion": "Unknown Version",
    "library.generatedPreview": "Preview generated.",
    "library.importFailed": "Import failed.",
    "library.importCancelled": "Import cancelled.",
    "library.imported": "Successfully imported {count} mods.",
    "library.enabledStatus": "Enabled",
    "library.disabledStatus": "Disabled",
    "library.updateAvailable": "Update Available",
    "library.needsAttention": "Needs Attention",
    "library.unknownStatus": "Unknown",
    "library.installPreviewTitle": "Install Preview",
    "library.installPreviewSafe": "This mod looks safe to install.",
    "library.installPreviewConflict": "Warning: This mod has file conflicts with existing mods.",
    "library.startInstall": "Start Install",
    "library.confirmUninstallTitle": "Confirm Uninstall",
    "library.confirmUninstallBody": "Are you sure you want to uninstall \"{name}\"? This will permanently delete its files.",
    "library.enableAfterImport": "Would you like to enable this mod right after installation?",
    "library.installOnly": "Install Only",
    "library.installAndEnable": "Install & Enable",
    "library.dropHint": "Drag & Drop Supported",
    "library.dropHintTooltip": "Or drag a ZIP file anywhere to install",
    "library.noSearchResults": "No mods matching your search.",
    "library.searchPlaceholder": "Search mods...",
    "library.openFolder": "Open Folder",
    "library.unknownAuthor": "Unknown Author",
    "library.dropTitle": "Drop to Import",
    "library.dropSubtitle": "Release the file to start installing the mod archive.",
    "library.importFiles": "Import Multiple Files",
    "library.importFolder": "Import Folder (Auto-scan)",
    "library.scanning": "Scanning...",
    "library.batchPreviewTitle": "Batch Import Preview",
    "library.batchPreviewDesc": "Scanned {archives} archive(s), discovered {mods} mod(s). Check the ones you want to install.",
    "library.batchInstallSelected": "Install Selected ({count})",
    "library.batchInstalling": "Installing {current}/{total}: {name}",
    "library.batchResultTitle": "Import Results",
    "library.batchResultSummary": "{success} mod(s) installed successfully, {fail} failed.",
    "library.batchSource": "Source",
    "library.batchSourceFolder": "Folder",
    "library.batchSourceArchive": "Archive",
    "library.batchStatusReady": "Ready",
    "library.batchStatusConflict": "Conflict (will overwrite)",
    "library.batchStatusUnsupported": "Unsupported format",
    "library.batchStatusError": "Error",
    "library.batchAllSuccess": "All {count} mod(s) imported successfully! ✨",
    "library.saveGuardSynced": "🛡️ Saves auto-protected: backed up {backups} slot(s), synced {synced} slot(s)",
    "library.saveGuardBackedUp": "🛡️ Saves backed up ({backups} slot(s)) — no sync pairs configured",
    "library.saveGuardWarnTitle": "Save Path Will Change",
    "library.saveGuardWarnBody": "This will switch the game from {from} to {to} saves. You have no sync pairs configured, so progress cannot be auto-synced. Your saves have been backed up.",
    "library.saveGuardGoToPair": "Set Up Pairing",
    "library.saveGuardContinue": "OK",
    "library.notePlaceholder": "Add a note / alias...",
    "library.noteTooltip": "Click to add a note or alias for this mod",
    "library.noteClear": "Clear note",
    "library.noteSaved": "Note saved",
    "library.multiplayerAffected": "Affects Co-op",
    "library.filters": "Filters",
    "library.clearFilters": "Clear filters",
    "library.noFilterResults": "No mods match the active filters.",
    "error.gameNotFound": "Game directory not found. Please check your settings.",
    "error.modNotFound": "Mod could not be found.",
    "error.modConflict": "Installation failed because the folder '{name}' already exists in your mods directory. Please delete the old version first.",
    "error.invalidArchive": "This ZIP archive is invalid or corrupted. It might be missing the Mod data or manifest.",
    "error.ioPermission": "Permission denied. The app cannot read/write files. Please try running as Administrator.",
    "error.ioGeneral": "Failed to read/write files: {detail}",
    "error.localSaveNotFound": "Local save directory not found. Please launch the game at least once.",
    "error.cloudSaveNotFound": "Could not locate Steam cloud save directory. Is Steam currently running?",
    "error.activeUserNotFound": "Could not locate active Steam Account.",
    "error.closeSteamAndGameBeforeCloudSync": "Close Steam and Slay the Spire 2 before running a cloud sync. Steam cache metadata can overwrite externally copied files while either process is running.",
    "error.closeGameBeforeCloudSync": "Close Slay the Spire 2 before running a cloud sync.",
    "error.steamRunningBeforeCloudSync": "Steam is still running. Continuing may let Steam overwrite externally prepared cloud cache files.",
    "saves.title": "Save Management",
    "saves.description": "Back up, restore or sync your save files between vanilla and modded environments.",
    "saves.ready": "Ready",
    "saves.noVanilla": "Vanilla save not found.",
    "saves.noVanillaHelp": "Play the game once without mods to initialize your vanilla save.",
    "saves.noModded": "Modded save not found.",
    "saves.noModdedHelp": "Launch the game with mods to create an isolated save environment.",
    "saves.vanilla": "Vanilla",
    "saves.modded": "Modded",
    "saves.vanillaTitle": "Vanilla Saves",
    "saves.moddedTitle": "Modded Saves",
    "saves.backup": "Backup",
    "saves.restore": "Restore",
    "saves.backups": "Save History",
    "saves.noBackups": "No history yet.",
    "saves.noBackupsHelp": "Your save snapshots will appear here — we'll keep them safe for you.",
    "saves.copyToModded": "Copy to Modded",
    "saves.copyToVanilla": "Copy to Vanilla",
    "saves.files": "Files: {count}",
    "saves.noModified": "No modification record",
    "saves.slotLabel": "Slot {slot} - {state}",
    "saves.backupLabel": "{kind} Slot {slot}",
    "saves.previewCreated": "Copy preview generated.",
    "saves.previewFailed": "Failed to generate preview.",
    "saves.transferDone": "Copy successful.",
    "saves.transferDoneWithBackup": "Copy successful; target slot was automatically backed up.",
    "saves.transferFailed": "Copy failed.",
    "saves.backupDone": "Backup created: {label}",
    "saves.backupFailed": "Backup failed.",
    "saves.restoreDone": "Backup restored.",
    "saves.restoreFailed": "Restore failed.",
    "saves.transferMissing": "No valid source or target slot was found.",
    "saves.confirmTransfer": "Confirm Save Copy",
    "saves.transferTitle": "Copy Save: {source} ➔ {target}",
    "saves.transferLinkedWarning": "⚠️ These slots are synced. This will overwrite the target.",
    "saves.confirmRestore": "Confirm Restore",
    "saves.source": "From",
    "saves.target": "To",
    "saves.transferDesc": "Your save data will be copied to the target slot.",
    "saves.transferBackupNote": "The target slot has existing data — it will be backed up automatically before overwriting. 🛡️",
    "saves.confirmRestoreDesc": "This will restore the backup to {kind} Slot {slot}. Current data will be backed up automatically.",
    "saves.slotLabelShort": "Slot {slot}",
    "saves.stateData": "data",
    "saves.stateEmpty": "empty",
    "saves.deleteBackupDone": "Backup deleted.",
    "saves.deleteBackupFailed": "Failed to delete backup.",
    "saves.openFolder": "Open Folder",
    "saves.delete": "Delete",
    "saves.autoSyncLabel": "Auto-sync vanilla ↔ modded saves",
    "saves.syncNow": "Sync now",
    "saves.syncDone": "Synced {count} save slot(s)",
    "saves.syncUpToDate": "All saves are up to date",
    "saves.syncFailed": "Sync failed",
    "saves.syncNoPairs": "No sync pairs configured. Click a vanilla card to link.",
    "saves.pairCount": "{count} pair(s) linked",
    "saves.pairNone": "Click a vanilla card to link with a modded card",
    "saves.linkHint": "Linking vanilla slot {slot} — click a modded card to pair",
    "saves.linkSelectModded": "Select a modded card to pair with",
    "saves.linkCreated": "Linked vanilla slot {v} ↔ modded slot {m}",
    "saves.linkRemoved": "Link removed",
    "saves.reasonManual": "Saved by you",
    "saves.reasonAutoTransfer": "Auto-saved before copying",
    "saves.reasonAutoSync": "Auto-saved before syncing",
    "saves.reasonAutoPathSwitch": "Auto-saved before switching mods",
    "saves.reasonUnknown": "Auto-saved",
    "saves.timeJustNow": "Just now",
    "saves.timeMinutesAgo": "{count}m ago",
    "saves.timeHoursAgo": "{count}h ago",
    "saves.timeDaysAgo": "{count}d ago",
    "saves.cloudSanctuary": "Steam Cloud Save",
    "saves.cloudDetected": "Cloud state detected. Full mirroring active.",
    "saves.cloudInSync": "Local saves and Steam Cloud cache are in sync.",
    "saves.cloudMismatch": "Local saves and Steam Cloud cache do not fully match.",
    "saves.cloudMismatchSummary": "Local-only: {localOnly}, cloud-only: {cloudOnly}, different: {different}.",
    "saves.cloudNotFound": "Steam Cloud save not found. Is Steam running?",
    "saves.cloudScanning": "Scanning connection...",
    "saves.cloudDescend": "Download (Cloud \u2192 Local)",
    "saves.cloudAscend": "Upload (Local \u2192 Cloud)",
    "saves.cloudAscending": "Uploading local saves to Steam Cloud...",
    "saves.cloudDescending": "Downloading saves from Steam Cloud...",
    "saves.cloudAscendDone": "Cloud upload completed. Local state is synchronized.",
    "saves.cloudDescendDone": "Cloud download completed. Local state is synchronized.",
    "saves.cloudAscendPreparedWithWarnings": "Steam Cloud cache was updated, but differences still remain. Review the mismatch summary before launch.",
    "saves.cloudDescendPreparedWithWarnings": "Local saves were refreshed from the cloud cache, but differences still remain. Review the mismatch summary before launch.",
    "saves.cloudAscendFailed": "Failed to upload Steam Cloud data.",
    "saves.cloudDescendFailed": "Failed to download Steam Cloud data.",
    "saves.cloudSteamRunningTitle": "Steam is still running",
    "saves.cloudSteamRunningBody": "The manager can continue, but Steam may immediately rewrite the local cloud cache while it is open.",
    "saves.cloudSteamRunningHint": "Recommended: close Steam first for the safest cloud sync. Continue only if you accept the overwrite risk.",
    "saves.cloudSteamRunningContinue": "Continue Anyway",
    "saves.cloudSteamRunningReview": "Steam is still running. Review the risk before continuing.",
    "saves.cloudReviewBeforeLaunch": "Review the mismatch in Saves before launching.",
    "saves.cloudReviewDiff": "Review Diff",
    "saves.cloudDiffWorkbenchTitle": "Cloud Diff Workbench",
    "saves.cloudDiffWorkbenchBody": "Inspect the real mismatch set, hide backup noise, compare both sides, and edit the exact file before launch.",
    "saves.cloudDiffRefresh": "Refresh",
    "saves.cloudDiffHideBackups": "Hide backup files",
    "saves.cloudDiffShowBackups": "Show backup files ({count})",
    "saves.cloudDiffNoItems": "No mismatched files remain.",
    "saves.cloudDiffNoSelection": "Select a file to inspect.",
    "saves.cloudDiffDifferent": "Different",
    "saves.cloudDiffLocalOnly": "Local only",
    "saves.cloudDiffCloudOnly": "Cloud only",
    "saves.cloudDiffInSync": "In sync",
    "saves.cloudDiffLocal": "Local",
    "saves.cloudDiffCloud": "Cloud cache",
    "saves.cloudDiffUseLocal": "Use local version",
    "saves.cloudDiffUseCloud": "Use cloud version",
    "saves.cloudDiffEditLocal": "Edit local",
    "saves.cloudDiffEditCloud": "Edit cloud",
    "saves.cloudDiffEditing": "Editing {side}",
    "saves.cloudDiffEditingBody": "Write the exact file content you want, then apply it back into the selected side.",
    "saves.cloudDiffCancelEdit": "Cancel edit",
    "saves.cloudDiffSaveEdit": "Save edit",
    "saves.cloudDiffTextUnsupported": "Inline editing is unavailable for this file.",
    "saves.cloudDiffTextUnsupportedBody": "This side is not valid UTF-8 text or is too large for the inline editor. You can still inspect the path or adopt the opposite side.",
    "saves.cloudDiffUnchangedFold": "{count} unchanged lines",
    "saves.cloudDiffStickyNote": "Editing the cloud side changes Steam's local cache view. It does not mean the server already accepted the new version.",
    "saves.cloudDiffNoiseNote": "Backup artifacts are hidden by default so long-term progression files stay in focus.",
    "saves.cloudDiffCleanBackups": "Clean backup noise (local {local} / cloud {cloud})",
    "saves.cloudDiffCleanBackupsConfirmTitle": "Delete backup noise files",
    "saves.cloudDiffCleanBackupsConfirmBody": "This will remove *.backup artifacts from the active local save directory and the Steam cloud cache. Local: {local}, cloud: {cloud}.",
    "saves.cloudDiffCleanBackupsConfirmAction": "Clean both sides",
    "saves.cloudDiffCleanBackupsHint": "This does not touch SlaySP2Manager's own snapshot backups under AppData/SlaySP2Manager/backups.",
    "saves.cloudDiffCleanBackupsDone": "Removed backup artifacts: local {local}, cloud {cloud}.",
    "saves.cloudLaunchMismatchTitle": "Cloud cache differs from local saves",
    "saves.cloudLaunchMismatchBody": "The Steam Cloud local cache and the local save directory are not identical. Launching now may let Steam overwrite one side with the other.",
    "saves.reviewInSaves": "Review in Saves",
    "saves.launchAnyway": "Launch Anyway",
    "saves.timeFragments": "Save Backups",
    "common.cancel": "Cancel",
    "common.confirm": "Confirm",
  },
  "zh-CN": {
    "nav.library": "模组库",
    "nav.discover": "发现",
    "nav.profiles": "预设",
    "nav.saves": "存档",
    "nav.settings": "设置",
    "nav.system": "系统",
    "nav.launchGame": "启动游戏",
    "nav.currentProfile": "当前预设",
    "settings.title": "设置",
    "settings.description": "配置游戏目录、禁用模组目录、Nexus 凭证及应用语言。",
    "settings.gameDirectory": "游戏目录",
    "settings.gameRoot": "Slay the Spire 2 根目录",
    "settings.disabledFolder": "禁用模组目录名",
    "settings.autoDetect": "自动检测",
    "settings.saveDirectory": "保存目录",
    "settings.nexus": "Nexus Mods",
    "settings.apiKey": "个人 API Key",
    "settings.saveCredentials": "保存凭证",
    "settings.language": "语言",
    "settings.languageHelp": "切换语言会立即生效。",
    "settings.languageZh": "中文",
    "settings.languageEn": "英语",
    "settings.theme": "外观",
    "settings.themeHelp": "可选浅色、深色或跟随系统，切换后会立即生效。",
    "settings.themeLight": "浅色",
    "settings.themeDark": "深色",
    "settings.themeSystem": "跟随系统",
    "settings.themeApplied": "外观已更新。",
    "settings.currentAppearance": "当前生效外观",
    "settings.currentAppearanceLight": "浅色",
    "settings.currentAppearanceDark": "深色",
    "settings.savedGameDirectory": "游戏目录已保存。",
    "settings.clearedGameDirectory": "已清空游戏目录配置。",
    "settings.detectedGameDirectory": "已自动定位并保存游戏目录。",
    "settings.gameNotFound": "未找到游戏安装目录。",
    "settings.savedLanguage": "语言已更新。",
    "settings.preferences": "应用偏好",
    "settings.nexusIntegration": "Nexus 集成",
    "settings.apiKeyPlaceholder": "贴入你的个人 API Key",
    "settings.apiKeyHidden": "隐藏",
    "settings.apiKeyVisible": "显示",
    "settings.paste": "粘贴",
    "settings.saveNexusAuth": "保存授权",
    "settings.apiKeySaved": "已保存",
    "settings.apiKeyPrivacy": "API Key 仅保存在本地，不会上传到任何服务器。",
    "settings.nexusAccount": "Nexus Mods 个人账户",
    "settings.howToGetKey": "不知道如何获取？",
    "settings.tutorialTitle": "如何获取 API Key",
    "settings.tutorialStep1": "打开 NexusMods 网站 (nexusmods.com)",
    "settings.tutorialStep2": "登录你的 Nexus 账号",
    "settings.tutorialStep3": "进入账号详情页 → API 标签页",
    "settings.tutorialStep4": "滚动到网页底部",
    "settings.tutorialStep5": "复制 \"Personal API Key\" 框内的文本",
    "settings.tutorialStep6": "回到这里，粘贴到上方的输入框中",
    "settings.tutorialCollapse": "收起说明",
    "settings.tutorialLinkSite": "Nexus Mods 官网",
    "settings.tutorialLinkApi": "API 访问页面",

    "settings.proxy": "代理",
    "settings.proxyUrl": "代理地址",
    "settings.proxyPlaceholder": "例如: http://127.0.0.1:7890 或 socks5://127.0.0.1:1080",
    "settings.proxyHelp": "支持 HTTP、HTTPS 和 SOCKS5 代理，应用于所有网络请求。",
    "settings.proxySave": "保存代理",
    "settings.proxySaved": "代理设置已保存。",
    "settings.proxyTest": "测试",
    "settings.proxyTestSuccess": "代理连接成功！",
    "settings.proxyTestFail": "代理测试失败: {error}",
    "settings.proxyCleared": "代理设置已清除。",
    "settings.autoBackupTitle": "自动备份数量",
    "settings.autoBackupHelp": "每个存档槽位最多保留的自动备份数。手动备份不受限制。",
    "settings.autoBackupSaved": "自动备份数量已保存。",

    "welcome.title": "欢迎使用 SlaySP2Manager",
    "welcome.subtitle": "初次使用请先配置《杀戮尖塔 2》的游戏安装目录。",
    "welcome.step1": "打开 Steam，在库中右键点击 Slay the Spire 2，选择“管理”。",
    "welcome.step2": "选择“浏览本地文件”，会自动打开游戏目录。",
    "welcome.step3": "从打开的文件夹地址栏中复制路径，并粘贴到下方。",
    "welcome.placeholder": "例如: D:\\SteamLibrary\\steamapps\\common\\Slay the Spire 2",
    "welcome.submit": "保存并继续",
    "welcome.browse": "浏览...",
    "welcome.error": "无效的游戏目录。未找到 SlayTheSpire2.exe。",

    "updater.available": "发现新版本",
    "updater.body": "版本 {version} 已就绪，是否立即更新？",
    "updater.downloading": "正在下载更新…",
    "updater.install": "立即更新",
    "updater.later": "稍后再说",
    "updater.restarting": "正在重启…",
    "updater.newVersion": "发现新版本",
    "updater.upToDate": "已是最新版本",
    "updater.checkNow": "检查更新",
    "settings.aboutTitle": "关于",

    "profiles.title": "模组预设",
    "profiles.description": "把一组模组状态保存成可复用预设，并一键应用到当前游戏目录。",
    "profiles.new": "新建预设",
    "profiles.savedProfiles": "已保存预设",
    "profiles.profileDetails": "预设详情",
    "profiles.newProfile": "新预设",
    "profiles.noProfiles": "还没有保存的预设。",
    "profiles.noProfilesHelp": "点击右上角新建按钮，开始选择模组。",
    "profiles.active": "当前生效",
    "profiles.modsCount": "{count} 个模组",
    "profiles.name": "预设名称",
    "profiles.descriptionLabel": "预设描述",
    "profiles.namePlaceholder": "例如：轻量 QoL",
    "profiles.descriptionPlaceholder": "描述这套预设适合什么场景。",
    "profiles.selectedCount": "已选 {count} 个",
    "profiles.installedCount": "已安装 {count} 个",
    "profiles.useCurrentEnabled": "同步当前启用",
    "profiles.save": "保存",
    "profiles.apply": "应用",
    "profiles.export": "导出",
    "profiles.delete": "删除",
    "profiles.modSelection": "模组选择",
    "profiles.modSelectionHelp": "点击即可加入或移出当前预设。",
    "profiles.noMods": "还没有可用模组。",
    "profiles.noModsHelp": "请先导入或安装模组，再回来创建预设。",
    "profiles.included": "已加入",
    "profiles.excluded": "未加入",
    "profiles.unknownAuthor": "未知作者",
    "profiles.noDescription": "暂无描述。",
    "profiles.loading": "加载预设中...",
    "profiles.creating": "正在创建新预设。",
    "profiles.selected": "已选择预设：{name}",
    "profiles.synced": "已从当前启用模组同步预设列表。",
    "profiles.nameRequired": "预设名称不能为空。",
    "profiles.created": "已创建预设：{name}",
    "profiles.saved": "已保存预设：{name}",
    "profiles.saveFailed": "保存预设失败。",
    "profiles.applyNeedSave": "请先保存预设，再应用。",
    "profiles.applied": "已应用预设 {name}：{summary}。",
    "profiles.applyFailed": "应用预设失败。",
    "profiles.exportNeedSave": "请先保存预设，再导出。",
    "profiles.exported": "已导出到 {path}",
    "profiles.exportCancelled": "已取消导出。",
    "profiles.exportFailed": "导出预设失败。",
    "profiles.deleted": "已删除预设：{name}",
    "profiles.deleteFailed": "删除预设失败。",
    "profiles.confirmDelete": "确认删除预设“{name}”？",
    "profiles.statusEnabled": "启用 {count} 个",
    "profiles.statusDisabled": "禁用 {count} 个",
    "profiles.statusMissing": "缺失 {count} 个",
    "profiles.savedCount": "已保存 · {count} 个预设",
    "profiles.modCountBadge": "{count} 个",
    "profiles.liveBadge": "生效中",
    "profiles.eyebrowNew": "✦ 新建预设",
    "profiles.eyebrowDetail": "预设详情",
    "profiles.applyTitle": "应用此预设",
    "profiles.applySub": "切换游戏 mod 加载环境",
    "discover.title": "发现",
    "discover.description": "搜索适合 Slay the Spire 2 的模组，并跳转到 Nexus 查看详情。",
    "discover.searchPlaceholder": "搜索模组名、作者或功能关键词",
    "discover.statusLoading": "正在加载推荐源...",
    "discover.statusFound": "找到 {count} 个结果",
    "discover.statusEmpty": "没有找到匹配结果",
    "discover.statusFailed": "搜索失败",
    "discover.apiKeyMissing": "需要配置 API Key",
    "discover.apiKeyMissingHelp": "请先在设置中填写 Nexus Mods 的个人 API Key 才能使用发现功能。",
    "discover.configureApiKey": "前往设置",
    "discover.apiKeyInvalid": "API Key 无效，请在设置中重新配置。",
    "discover.noResults": "暂无可展示结果。",
    "discover.noResultsHelp": "可以换一个关键词，或直接查看 Nexus 页面。",
    "discover.preview": "详情预览",
    "discover.openNexus": "打开 Nexus 页面",
    "discover.searchRelated": "搜索同类关键词",
    "discover.unknownAuthor": "未知作者",
    "discover.latestVersion": "最新版本",
    "discover.noSummary": "暂无简介。",
    "discover.previewEmpty": "选择列表中的模组后，这里会显示详情。",
    "discover.filterPopular": "热门",
    "discover.filterNewest": "新上架",
    "discover.filterLatestUpdated": "最新更新",
    "discover.filterQol": "QoL",
    "discover.filterUi": "UI",
    "discover.filterBalance": "平衡",
    "discover.filterTools": "工具",
    "discover.resultCount": "{count} 个结果",
    "discover.downloads": "下载",
    "discover.translating": "正在翻译...",
    "discover.translated": "翻译",
    "discover.translateBtn": "翻译描述",
    "discover.installBtn": "一键安装",
    "discover.downloadingBtn": "下载中...",
    "discover.totalCount": "共 {total} 个模组",
    "discover.pageInfo": "显示 {from}-{to}，共 {total} 个",
    "discover.loadMore": "加载更多",
    "discover.noMore": "已全部加载",
    "discover.filterDownloads": "下载最多",
    "discover.filterUpdates": "待更新",
    "discover.updatesLoading": "正在检查更新...",
    "discover.updateAvailable": "可更新",
    "discover.localVersion": "本地: v{version}",
    "discover.noUpdates": "所有已安装模组均为最新版本。",
    "discover.updatesCount": "有 {count} 个可更新",
    "discover.premiumHint": "一键安装需要 Nexus Premium 会员，你可以手动下载：",
    "discover.manualStep1": "点击「打开 Nexus 页面」前往模组页面",
    "discover.manualStep2": "在 Nexus 网站手动下载 zip 文件",
    "discover.manualStep3": "直接将下载好的 zip 文件拖进窗口即可！",
    "discover.goToLibrary": "前往模组库",
    "download.title": "下载",
    "download.clear": "清除",
    "download.fetchingFiles": "获取信息...",
    "download.downloading": "下载中...",
    "download.installing": "安装中...",
    "download.done": "完成",
    "download.failed": "失败",
    "download.noFiles": "未找到文件",
    "download.premiumRequired": "需要会员",
    "library.title": "模组库",
    "library.description": "管理已安装的模组，或安装新模组。",
    "library.importZip": "导入 ZIP",
    "library.ready": "就绪",
    "library.enabled": "已启用",
    "library.disabled": "已禁用",
    "library.activity": "动态",
    "library.emptyEnabled": "暂无启用模组",
    "library.emptyEnabledHelp": "去「发现」页找找，或直接把 ZIP 文件拖进窗口即可。",
    "library.conflictReplace": "覆盖已有 mod",
    "library.conflictRename": "重命名安装（自动生成新 ID）",
    "library.emptyDisabled": "暂无禁用模组",
    "library.emptyDisabledHelp": "你禁用的模组会在这里。",
    "library.noActivity": "暂无动态",
    "library.noActivityHelp": "模组的安装、启用、禁用会显示在这。",
    "library.enable": "启用",
    "library.disable": "禁用",
    "library.uninstall": "卸载",
    "library.unknownVersion": "未知版本",
    "library.generatedPreview": "预览已生成",
    "library.importFailed": "导入失败",
    "library.importCancelled": "已取消导入",
    "library.imported": "成功安装 {count} 个模组",
    "library.enabledStatus": "已启用",
    "library.disabledStatus": "已禁用",
    "library.updateAvailable": "有更新",
    "library.needsAttention": "需要注意",
    "library.unknownStatus": "未知",
    "library.installPreviewTitle": "安装预览",
    "library.installPreviewSafe": "此模组可以安全安装。",
    "library.installPreviewConflict": "此模组与现有模组产生文件冲突。",
    "library.startInstall": "开始安装",
    "library.confirmUninstallTitle": "确认卸载",
    "library.confirmUninstallBody": "你确定要卸载 “{name}” 吗？这会永久删除它的文件。",
    "library.enableAfterImport": "安装完成后，是否立即启用此模组？",
    "library.installOnly": "仅安装",
    "library.installAndEnable": "安装并启用",
    "library.dropHint": "支持拖拽",
    "library.dropHintTooltip": "也可以把 ZIP 文件拖进来安装",
    "library.noSearchResults": "没有找到匹配的模组。",
    "library.searchPlaceholder": "搜索模组...",
    "library.openFolder": "打开文件夹",
    "library.unknownAuthor": "未知作者",
    "library.dropTitle": "拖放导入",
    "library.dropSubtitle": "松开文件即可开始安装模组包。",
    "library.importFiles": "批量导入文件",
    "library.importFolder": "导入文件夹 (自动扫描)",
    "library.scanning": "正在扫描...",
    "library.batchPreviewTitle": "批量导入预览",
    "library.batchPreviewDesc": "已扫描 {archives} 个压缩包，发现 {mods} 个模组。勾选要安装的模组：",
    "library.batchInstallSelected": "安装选中的 ({count})",
    "library.batchInstalling": "正在安装第 {current}/{total} 个: {name}",
    "library.batchResultTitle": "导入结果",
    "library.batchResultSummary": "成功安装 {success} 个模组，{fail} 个失败。",
    "library.batchSource": "来源",
    "library.batchSourceFolder": "已解压文件夹",
    "library.batchSourceArchive": "压缩包",
    "library.batchStatusReady": "就绪",
    "library.batchStatusConflict": "冲突 (将覆盖)",
    "library.batchStatusUnsupported": "不支持的格式",
    "library.batchStatusError": "错误",
    "library.batchAllSuccess": "全部 {count} 个模组导入成功！✨",
    "library.saveGuardSynced": "🛡️ 存档已自动保护：备份了 {backups} 个槽位，同步了 {synced} 个槽位",
    "library.saveGuardBackedUp": "🛡️ 已备份存档（{backups} 个槽位）— 未配置存档配对",
    "library.saveGuardWarnTitle": "存档路径即将切换",
    "library.saveGuardWarnBody": "此操作将使游戏从 {from} 存档切换到 {to} 存档。你尚未配置存档配对，无法自动同步进度。存档已自动备份。",
    "library.saveGuardGoToPair": "前往配对设置",
    "library.saveGuardContinue": "好的",
    "library.notePlaceholder": "添加备注 / 别名...",
    "library.noteTooltip": "点击为此模组添加备注或别名",
    "library.noteClear": "清除备注",
    "library.noteSaved": "备注已保存",
    "library.multiplayerAffected": "影响多人",
    "error.gameNotFound": "找不到游戏目录，请在设置中指定。",
    "error.modNotFound": "指定的模组文件找不到了。",
    "error.modConflict": "安装中止！模组文件夹「{name}」已存在，请先删除旧版。",
    "error.invalidArchive": "提供的 ZIP 压缩包格式错误或已损坏，可能缺少模组数据或 Manifest 文件。",
    "error.ioPermission": "权限被拒绝，应用无法写入游戏目录。如果失败请尝试以管理员身份运行应用。",
    "error.ioGeneral": "文件读写异常: {detail}",
    "error.localSaveNotFound": "未找到本地存档目录，请至少运行一次游戏以生成初始存档。",
    "error.cloudSaveNotFound": "未找到 Steam 云存档目录，请确认 Steam 是否处于运行状态。",
    "error.activeUserNotFound": "未能检测到当前激活的 Steam 账号。",
    "error.closeSteamAndGameBeforeCloudSync": "执行云同步前请先关闭 Steam 和 Slay the Spire 2。任一进程运行时，Steam 的缓存元数据都可能把外部复制进去的文件再次覆盖掉。",
    "error.closeGameBeforeCloudSync": "执行云同步前请先关闭 Slay the Spire 2。",
    "error.steamRunningBeforeCloudSync": "Steam 仍在运行。继续执行时，Steam 可能会立刻改写你刚准备好的云缓存文件。",
    "saves.title": "存档管理",
    "saves.description": "在原版与模组环境之间备份、恢复或同步存档。",
    "saves.ready": "就绪",
    "saves.noVanilla": "未找到原版存档。",
    "saves.noVanillaHelp": "请先在不带模组的情况下进入游戏。",
    "saves.noModded": "未找到模组存档。",
    "saves.noModdedHelp": "请先带模组进入游戏。",
    "saves.vanilla": "原版存档",
    "saves.modded": "独立模组环境",
    "saves.vanillaTitle": "原版存档 (Vanilla)",
    "saves.moddedTitle": "独立模组环境 (Modded)",
    "saves.backup": "备份",
    "saves.restore": "恢复",
    "saves.backups": "存档历史",
    "saves.noBackups": "还没有历史记录",
    "saves.noBackupsHelp": "你的存档快照会安全地保留在这里。",
    "saves.copyToModded": "复制到模组存档",
    "saves.copyToVanilla": "复制到原版存档",
    "saves.files": "文件 {count} 个",
    "saves.noModified": "暂无修改",
    "saves.slotLabel": "槽位 {slot} - {state}",
    "saves.backupLabel": "{kind} 槽位 {slot}",
    "saves.previewCreated": "预览已生成",
    "saves.previewFailed": "产生预览失败",
    "saves.transferDone": "复制成功",
    "saves.transferDoneWithBackup": "复制成功，目标槽位已自动备份",
    "saves.transferFailed": "复制失败",
    "saves.backupDone": "备份成功：{label}",
    "saves.backupFailed": "备份失败",
    "saves.restoreDone": "恢复成功",
    "saves.restoreFailed": "恢复失败",
    "saves.transferMissing": "未找到源槽位或目标槽位",
    "saves.confirmTransfer": "确认复制存档",
    "saves.transferTitle": "复制存档：{source} ➔ {target}",
    "saves.transferLinkedWarning": "⚠️ 这些槽位已绑定同步，即将覆盖目标并触发备份。",
    "saves.confirmRestore": "确认恢复",
    "saves.source": "从",
    "saves.target": "到",
    "saves.transferDesc": "存档数据将被复制到目标槽位。",
    "saves.transferBackupNote": "目标槽位已有数据，我们会先自动备份，不用担心 🛡️",
    "saves.confirmRestoreDesc": "这将把备份恢复到 {kind} 槽位 {slot}，当前数据会自动备份。",
    "saves.slotLabelShort": "槽位 {slot}",
    "saves.stateData": "有数据",
    "saves.stateEmpty": "空",
    "saves.deleteBackupDone": "已删除",
    "saves.deleteBackupFailed": "删除失败",
    "saves.openFolder": "打开文件夹",
    "saves.delete": "删除",
    "saves.autoSyncLabel": "自动同步原版 ↔ 模组存档",
    "saves.syncNow": "立即同步",
    "saves.syncDone": "已同步 {count} 个存档槽位",
    "saves.syncUpToDate": "所有存档已是最新",
    "saves.syncFailed": "同步失败",
    "saves.syncNoPairs": "未配置同步配对，点击原版卡片开始关联",
    "saves.pairCount": "已关联 {count} 对",
    "saves.pairNone": "点击原版卡片与模组卡片建立关联",
    "saves.linkHint": "正在关联原版槽位 {slot} — 点击模组卡片完成配对",
    "saves.linkSelectModded": "选择一个模组卡片进行配对",
    "saves.linkCreated": "已关联原版槽位 {v} ↔ 模组槽位 {m}",
    "saves.linkRemoved": "已取消关联",
    "saves.reasonManual": "你手动保存的",
    "saves.reasonAutoTransfer": "复制存档时自动保存",
    "saves.reasonAutoSync": "同步时自动保存",
    "saves.reasonAutoPathSwitch": "切换模组时自动保存",
    "saves.reasonUnknown": "自动保存",
    "saves.timeJustNow": "刚刚",
    "saves.timeMinutesAgo": "{count}分钟前",
    "saves.timeHoursAgo": "{count}小时前",
    "saves.timeDaysAgo": "{count}天前",
    "saves.cloudSanctuary": "Steam 云存档",
    "saves.cloudDetected": "已侦测到云端存档，全量同步待命中。",
    "saves.cloudInSync": "本地存档与 Steam Cloud 缓存一致。",
    "saves.cloudMismatch": "本地存档与 Steam Cloud 缓存不一致。",
    "saves.cloudMismatchSummary": "仅本地 {localOnly} 项，仅云端 {cloudOnly} 项，内容不同 {different} 项。",
    "saves.cloudNotFound": "未找到 Steam 云存档，请确认 Steam 是否运行。",
    "saves.cloudScanning": "正在扫描连接...",
    "saves.cloudDescend": "下载至本地 (云端 \u2192 本地)",
    "saves.cloudAscend": "上传至云端 (本地 \u2192 云端)",
    "saves.cloudAscending": "正在将本地存档上传至 Steam Cloud...",
    "saves.cloudDescending": "正在从 Steam Cloud 下载存档...",
    "saves.cloudAscendDone": "上传完成，本地存档已同步至云端。",
    "saves.cloudDescendDone": "下载完成，世界线已同步至本地。",
    "saves.cloudAscendPreparedWithWarnings": "已更新 Steam Cloud 本地缓存，但仍存在差异。启动前请先检查。",
    "saves.cloudDescendPreparedWithWarnings": "已用云缓存刷新本地存档，但仍存在差异。启动前请先检查。",
    "saves.cloudAscendFailed": "上传至 Steam Cloud 失败。",
    "saves.cloudDescendFailed": "从 Steam Cloud 下载失败。",
    "saves.cloudSteamRunningTitle": "Steam 仍在运行",
    "saves.cloudSteamRunningBody": "管理器可以继续执行，但只要 Steam 还开着，它就可能立刻把本地云缓存重新改写。",
    "saves.cloudSteamRunningHint": "建议先关闭 Steam 再同步，这是更稳妥的做法。只有在你接受覆盖风险时才继续。",
    "saves.cloudSteamRunningContinue": "仍然继续",
    "saves.cloudSteamRunningReview": "Steam 仍在运行，请先确认风险。",
    "saves.cloudReviewBeforeLaunch": "启动前建议先到“存档”页检查差异。",
    "saves.cloudReviewDiff": "审阅差异",
    "saves.cloudDiffWorkbenchTitle": "云端差异工作台",
    "saves.cloudDiffWorkbenchBody": "查看真实差异集合，默认隐藏 backup 噪音，对比本地与云缓存两侧内容，并在启动前直接编辑目标文件。",
    "saves.cloudDiffRefresh": "刷新",
    "saves.cloudDiffHideBackups": "隐藏 backup 文件",
    "saves.cloudDiffShowBackups": "显示 backup 文件（{count}）",
    "saves.cloudDiffNoItems": "已经没有待处理的差异文件。",
    "saves.cloudDiffNoSelection": "先从左侧选择一个文件。",
    "saves.cloudDiffDifferent": "内容不同",
    "saves.cloudDiffLocalOnly": "仅本地",
    "saves.cloudDiffCloudOnly": "仅云缓存",
    "saves.cloudDiffInSync": "已一致",
    "saves.cloudDiffLocal": "本地",
    "saves.cloudDiffCloud": "云缓存",
    "saves.cloudDiffUseLocal": "采用本地版本",
    "saves.cloudDiffUseCloud": "采用云缓存版本",
    "saves.cloudDiffEditLocal": "编辑本地",
    "saves.cloudDiffEditCloud": "编辑云缓存",
    "saves.cloudDiffEditing": "正在编辑 {side}",
    "saves.cloudDiffEditingBody": "直接写入你想要的文件内容，确认后会回写到当前选中的一侧。",
    "saves.cloudDiffCancelEdit": "取消编辑",
    "saves.cloudDiffSaveEdit": "保存改动",
    "saves.cloudDiffTextUnsupported": "这个文件暂不支持内联编辑。",
    "saves.cloudDiffTextUnsupportedBody": "这一侧不是有效 UTF-8 文本，或者文件过大，不适合直接在工作台里编辑。你仍然可以打开路径，或者直接采用另一侧版本。",
    "saves.cloudDiffUnchangedFold": "收起了 {count} 行未变化内容",
    "saves.cloudDiffStickyNote": "编辑云缓存侧只会改本机 Steam cache 视图，不代表服务器已经接受了这个版本。",
    "saves.cloudDiffNoiseNote": "backup 文件默认隐藏，避免把真正影响长期进度的主文件淹没掉。",
    "saves.cloudDiffCleanBackups": "清理 backup 噪音（本地 {local} / 云缓存 {cloud}）",
    "saves.cloudDiffCleanBackupsConfirmTitle": "删除 backup 噪音文件",
    "saves.cloudDiffCleanBackupsConfirmBody": "这会删除当前活动本地存档目录和 Steam 云缓存中的 *.backup 文件。本地 {local} 个，云缓存 {cloud} 个。",
    "saves.cloudDiffCleanBackupsConfirmAction": "清理两边",
    "saves.cloudDiffCleanBackupsHint": "不会删除 SlaySP2Manager 自己保存在 AppData/SlaySP2Manager/backups 下的快照备份。",
    "saves.cloudDiffCleanBackupsDone": "已清理 backup 噪音：本地 {local} 个，云缓存 {cloud} 个。",
    "saves.cloudLaunchMismatchTitle": "云缓存与本地存档不一致",
    "saves.cloudLaunchMismatchBody": "Steam Cloud 本地缓存与本地存档并不完全一致，现在启动游戏可能会让 Steam 继续用其中一侧覆盖另一侧。",
    "saves.reviewInSaves": "去存档页查看",
    "saves.launchAnyway": "仍然启动",
    "saves.timeFragments": "存档备份",
    "common.cancel": "取消",
    "common.confirm": "确认",
    "library.filters": "筛选",
    "library.clearFilters": "清除筛选",
    "library.noFilterResults": "没有模组符合当前筛选条件。",
  },
};
