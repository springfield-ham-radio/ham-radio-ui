mod radio_modules;
mod sniffer_ssh;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::Emitter;
use tauri_plugin_sql::{Migration, MigrationKind};

fn build_menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<Menu<R>> {
    let preferences = MenuItem::with_id(app, "preferences", "Settings...", true, Some("CmdOrCtrl+,"))?;
    let check_updates = MenuItem::with_id(app, "check-for-updates", "Check for Updates...", true, None::<&str>)?;
    let open_memory = MenuItem::with_id(app, "open-memory", "Open Memory...", true, Some("CmdOrCtrl+O"))?;
    let save_memory = MenuItem::with_id(app, "save-memory", "Save", true, Some("CmdOrCtrl+S"))?;
    let save_memory_as = MenuItem::with_id(app, "save-memory-as", "Save As...", true, Some("CmdOrCtrl+Shift+S"))?;
    let import_from_radio = MenuItem::with_id(app, "import-from-radio", "Import from Radio...", true, None::<&str>)?;
    let write_to_radio = MenuItem::with_id(app, "write-to-radio", "Write to Radio...", true, None::<&str>)?;

    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;

    #[cfg(target_os = "macos")]
    {
        let app_menu = Submenu::with_items(
            app,
            "HamBench",
            true,
            &[
                &PredefinedMenuItem::about(app, None, None)?,
                &PredefinedMenuItem::separator(app)?,
                &preferences,
                &check_updates,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::hide(app, None)?,
                &PredefinedMenuItem::hide_others(app, None)?,
                &PredefinedMenuItem::show_all(app, None)?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::quit(app, None)?,
            ],
        )?;

        let file_menu = Submenu::with_items(
            app,
            "File",
            true,
            &[
                &open_memory,
                &save_memory,
                &save_memory_as,
                &PredefinedMenuItem::separator(app)?,
                &import_from_radio,
                &write_to_radio,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::close_window(app, None)?,
            ],
        )?;

        let window_menu = Submenu::with_items(
            app,
            "Window",
            true,
            &[
                &PredefinedMenuItem::minimize(app, None)?,
                &PredefinedMenuItem::maximize(app, None)?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::close_window(app, None)?,
            ],
        )?;

        Menu::with_items(app, &[&app_menu, &file_menu, &edit_menu, &window_menu])
    }

    #[cfg(not(target_os = "macos"))]
    {
        let file_menu = Submenu::with_items(
            app,
            "File",
            true,
            &[
                &open_memory,
                &save_memory,
                &save_memory_as,
                &PredefinedMenuItem::separator(app)?,
                &import_from_radio,
                &write_to_radio,
                &PredefinedMenuItem::separator(app)?,
                &preferences,
                &check_updates,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::quit(app, None)?,
            ],
        )?;

        Menu::with_items(app, &[&file_menu, &edit_menu])
    }
}

fn emit_menu_event(app: &tauri::AppHandle, event_name: &str) {
    if let Err(error) = app.emit(event_name, ()) {
        log::error!("Failed to emit {event_name}: {error}");
    }
}

#[tauri::command]
fn save_text_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|error| error.to_string())
}

#[tauri::command]
fn load_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_saved_channels",
            sql: r#"
CREATE TABLE saved_channels (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT,
  transmit_frequency INTEGER NOT NULL,
  receive_frequency INTEGER NOT NULL,
  transmit_tone INTEGER NOT NULL,
  transmit_tone_type TEXT NOT NULL,
  receive_tone INTEGER NOT NULL,
  receive_tone_type TEXT NOT NULL,
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_saved_channels_name ON saved_channels(name);
CREATE INDEX idx_saved_channels_rx ON saved_channels(receive_frequency);
"#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create_radio_models",
            sql: r#"
CREATE TABLE radio_models (
  model_id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  manufacturer TEXT NOT NULL,
  version TEXT NOT NULL,
  description TEXT NOT NULL,
  capabilities TEXT NOT NULL,
  source TEXT NOT NULL,
  source_path TEXT,
  config_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_radio_models_manufacturer ON radio_models(manufacturer);
"#,
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .manage(sniffer_ssh::RemoteSnifferState::default())
        .plugin(tauri_plugin_serialplugin::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:ham-radio.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            save_text_file,
            load_text_file,
            radio_modules::download_and_install_radio_module,
            radio_modules::install_radio_module_from_zip,
            radio_modules::list_installed_radio_module_configs,
            radio_modules::uninstall_radio_module,
            sniffer_ssh::check_remote_sniffer_host,
            sniffer_ssh::install_remote_sniffer,
            sniffer_ssh::start_remote_sniffer,
            sniffer_ssh::stop_remote_sniffer,
            sniffer_ssh::remote_sniffer_status,
        ])
        .menu(build_menu)
        .on_menu_event(|app, event| {
            match event.id().as_ref() {
                "preferences" => emit_menu_event(app, "open-preferences"),
                "check-for-updates" => emit_menu_event(app, "check-for-updates"),
                "open-memory" => emit_menu_event(app, "open-memory"),
                "save-memory" => emit_menu_event(app, "save-memory"),
                "save-memory-as" => emit_menu_event(app, "save-memory-as"),
                "import-from-radio" => emit_menu_event(app, "import-from-radio"),
                "write-to-radio" => emit_menu_event(app, "write-to-radio"),
                _ => {}
            }
        })
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                app.handle().plugin(tauri_plugin_mcp_bridge::init())?;
            }

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
