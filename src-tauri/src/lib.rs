pub mod app;
pub mod domain;
pub mod integrations;
pub mod repositories;
pub mod services;
pub mod utils;
pub mod workflows;

use app::commands::{
    apply_profile,
    create_profile,
    create_save_backup,
    delete_profile,
    detect_game_install,
    disable_mod,
    enable_mod,
    export_profile,
    get_app_bootstrap,
    install_archive,
    list_activity_logs,
    list_disabled_mods,
    list_installed_mods,
    list_profiles,
    list_save_backups,
    list_save_slots,
    pick_archive_file,
    pick_archive_files,
    pick_import_folder,
    process_import_targets,
    batch_install_mods,
    preview_install_archive,
    preview_save_transfer,
    restore_save_backup,
    search_remote_mods,
    transfer_save,
    uninstall_mod,
    update_app_locale,
    update_profile,
    update_game_root_dir,
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
    update_proxy_url,
    test_proxy,
};
use app::state::AppState;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            get_app_bootstrap,
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
            test_proxy
        ])
        .run(tauri::generate_context!())
        .expect("failed to run tauri application");
}
