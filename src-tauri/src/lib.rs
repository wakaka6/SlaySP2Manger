pub mod app;
pub mod domain;
pub mod integrations;
pub mod repositories;
pub mod services;
pub mod utils;
pub mod workflows;

use app::commands::{
    apply_profile, ascend_to_cloud_full, batch_install_mods, cleanup_backup_artifacts,
    confirm_import_preset_bundle, copy_cloud_save_diff_side, create_profile, create_save_backup,
    delete_profile, delete_save_backup, descend_from_cloud_full, detect_game_install, disable_mod,
    download_and_install_mod, enable_mod, export_preset_bundle, export_profile, get_app_bootstrap,
    get_backup_artifact_status, get_cloud_save_diff_detail, get_cloud_save_status,
    get_compendium_index, get_download_link, get_mod_files, install_archive, launch_game,
    list_activity_logs, list_cloud_save_diff_entries, list_disabled_mods, list_installed_mods,
    list_profiles, list_save_backups, list_save_slots, open_mod_folder, open_mods_directory,
    open_path_in_explorer, open_url_in_browser, pick_archive_file, pick_archive_files,
    pick_import_folder, pick_preset_bundle, preview_install_archive, preview_preset_bundle,
    preview_save_transfer, process_import_targets, restore_save_backup,
    save_cloud_save_diff_content, search_remote_mods, sync_saves, test_proxy,
    toggle_save_auto_sync, transfer_save, uninstall_mod, update_app_locale,
    update_auto_backup_keep_count, update_game_root_dir, update_nexus_api_key, update_profile,
    update_proxy_url, update_save_sync_pairs,
};
use app::state::AppState;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            get_app_bootstrap,
            get_compendium_index,
            detect_game_install,
            list_installed_mods,
            list_disabled_mods,
            list_activity_logs,
            enable_mod,
            disable_mod,
            uninstall_mod,
            install_archive,
            preview_install_archive,
            pick_archive_file,
            update_game_root_dir,
            update_app_locale,
            list_save_slots,
            preview_save_transfer,
            transfer_save,
            create_save_backup,
            list_save_backups,
            restore_save_backup,
            search_remote_mods,
            list_profiles,
            create_profile,
            update_profile,
            delete_profile,
            apply_profile,
            export_profile,
            open_mods_directory,
            open_mod_folder,
            open_path_in_explorer,
            delete_save_backup,
            toggle_save_auto_sync,
            update_save_sync_pairs,
            sync_saves,
            launch_game,
            update_nexus_api_key,
            get_mod_files,
            get_download_link,
            download_and_install_mod,
            open_url_in_browser,
            pick_archive_files,
            pick_import_folder,
            process_import_targets,
            batch_install_mods,
            update_proxy_url,
            update_auto_backup_keep_count,
            test_proxy,
            get_cloud_save_status,
            list_cloud_save_diff_entries,
            get_cloud_save_diff_detail,
            save_cloud_save_diff_content,
            copy_cloud_save_diff_side,
            get_backup_artifact_status,
            cleanup_backup_artifacts,
            ascend_to_cloud_full,
            descend_from_cloud_full,
            export_preset_bundle,
            preview_preset_bundle,
            confirm_import_preset_bundle,
            pick_preset_bundle
        ])
        .run(tauri::generate_context!())
        .expect("failed to run tauri application");
}
