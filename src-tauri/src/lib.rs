mod radio_modules;
mod sniffer_ssh;
mod zoom;

#[cfg(target_os = "macos")]
use tauri::menu::{AboutMetadata, WINDOW_SUBMENU_ID};
use tauri::menu::{CheckMenuItem, Menu, MenuItem, MenuItemKind, PredefinedMenuItem, Submenu};
use tauri::Emitter;
use tauri_plugin_sql::{Migration, MigrationKind};

fn find_check_in_items<R: tauri::Runtime>(
    items: &[MenuItemKind<R>],
    id: &str,
) -> Option<CheckMenuItem<R>> {
    for item in items {
        match item {
            MenuItemKind::Check(check) if check.id().as_ref() == id => {
                return Some(check.clone());
            }
            MenuItemKind::Submenu(submenu) => {
                if let Ok(children) = submenu.items() {
                    if let Some(found) = find_check_in_items(&children, id) {
                        return Some(found);
                    }
                }
            }
            _ => {}
        }
    }

    None
}

fn find_check_item<R: tauri::Runtime>(menu: &Menu<R>, id: &str) -> Option<CheckMenuItem<R>> {
    let items = menu.items().ok()?;
    find_check_in_items(&items, id)
}

fn emit_developer_mode(app: &tauri::AppHandle) {
    let checked = app
        .menu()
        .as_ref()
        .and_then(|menu| find_check_item(menu, "developer-mode"))
        .and_then(|item| item.is_checked().ok())
        .unwrap_or(false);

    if let Err(error) = app.emit("developer-mode-changed", checked) {
        log::error!("Failed to emit developer-mode-changed: {error}");
    }
}

fn build_menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<Menu<R>> {
    let preferences =
        MenuItem::with_id(app, "preferences", "Settings...", true, Some("CmdOrCtrl+,"))?;
    let check_updates = MenuItem::with_id(
        app,
        "check-for-updates",
        "Check for Updates...",
        true,
        None::<&str>,
    )?;
    let open_memory = MenuItem::with_id(
        app,
        "open-memory",
        "Open Memory...",
        true,
        Some("CmdOrCtrl+O"),
    )?;
    let save_memory = MenuItem::with_id(app, "save-memory", "Save", true, Some("CmdOrCtrl+S"))?;
    let save_memory_as = MenuItem::with_id(
        app,
        "save-memory-as",
        "Save As...",
        true,
        Some("CmdOrCtrl+Shift+S"),
    )?;
    let import_from_radio = MenuItem::with_id(
        app,
        "import-from-radio",
        "Import from Radio...",
        true,
        None::<&str>,
    )?;
    let write_to_radio = MenuItem::with_id(
        app,
        "write-to-radio",
        "Write to Radio...",
        true,
        None::<&str>,
    )?;

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

    let zoom_in = MenuItem::with_id(app, "zoom-in", "Zoom In", true, Some("CmdOrCtrl+="))?;
    let zoom_out = MenuItem::with_id(app, "zoom-out", "Zoom Out", true, Some("CmdOrCtrl+-"))?;
    let zoom_reset =
        MenuItem::with_id(app, "zoom-reset", "Zoom to 100%", true, Some("CmdOrCtrl+0"))?;
    let developer_mode = CheckMenuItem::with_id(
        app,
        "developer-mode",
        "Developer Mode",
        true,
        false,
        None::<&str>,
    )?;
    let view_menu = Submenu::with_items(
        app,
        "View",
        true,
        &[
            &zoom_in,
            &zoom_out,
            &zoom_reset,
            &PredefinedMenuItem::separator(app)?,
            &developer_mode,
        ],
    )?;

    #[cfg(target_os = "macos")]
    {
        let app_menu = Submenu::with_items(
            app,
            "HamBench",
            true,
            &[
                &PredefinedMenuItem::about(
                    app,
                    None,
                    Some(AboutMetadata {
                        credits: Some("By KF5UFJ".into()),
                        ..Default::default()
                    }),
                )?,
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

        let window_menu = Submenu::with_id_and_items(
            app,
            WINDOW_SUBMENU_ID,
            "Window",
            true,
            &[
                &PredefinedMenuItem::minimize(app, None)?,
                &PredefinedMenuItem::maximize(app, None)?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::close_window(app, None)?,
            ],
        )?;

        Menu::with_items(
            app,
            &[&app_menu, &file_menu, &edit_menu, &view_menu, &window_menu],
        )
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

        Menu::with_items(app, &[&file_menu, &edit_menu, &view_menu])
    }
}

fn emit_menu_event(app: &tauri::AppHandle, event_name: &str) {
    if let Err(error) = app.emit(event_name, ()) {
        log::error!("Failed to emit {event_name}: {error}");
    }
}

#[tauri::command]
fn set_developer_mode(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    let menu = app
        .menu()
        .ok_or_else(|| "Application menu is not available".to_string())?;
    let item = find_check_item(&menu, "developer-mode")
        .ok_or_else(|| "Developer Mode menu item is missing".to_string())?;
    item.set_checked(enabled).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_text_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|error| error.to_string())
}

#[tauri::command]
fn load_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|error| error.to_string())
}

#[tauri::command]
async fn fetch_repeaterbook_search(url: String) -> Result<String, String> {
    let parsed = url::Url::parse(&url).map_err(|error| error.to_string())?;

    if parsed.scheme() != "https" || parsed.host_str() != Some("www.repeaterbook.com") {
        return Err("RepeaterBook lookup URL is not allowed".into());
    }

    if parsed.path() != "/repeaters/location_search.php" {
        return Err("RepeaterBook lookup URL is not allowed".into());
    }

    let response = reqwest::get(parsed)
        .await
        .map_err(|error| error.to_string())?;

    if !response.status().is_success() {
        return Err(format!(
            "RepeaterBook lookup failed: HTTP {}",
            response.status()
        ));
    }

    let bytes = response.bytes().await.map_err(|error| error.to_string())?;
    String::from_utf8(bytes.to_vec()).map_err(|error| error.to_string())
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
        Migration {
            version: 3,
            description: "create_station_log_qsos",
            sql: r#"
CREATE TABLE station_log_qsos (
  id TEXT PRIMARY KEY NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  their_callsign TEXT NOT NULL,
  frequency_hz INTEGER,
  band TEXT,
  mode TEXT NOT NULL,
  submode TEXT,
  rst_sent TEXT,
  rst_received TEXT,
  their_name TEXT,
  their_qth TEXT,
  their_gridsquare TEXT,
  tx_power_watts REAL,
  comment TEXT,
  operator_callsign TEXT,
  station_callsign TEXT,
  my_gridsquare TEXT,
  adif_extra TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_station_log_qsos_started_at ON station_log_qsos(started_at DESC);
CREATE INDEX idx_station_log_qsos_callsign ON station_log_qsos(their_callsign);
"#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "create_imported_repeaters",
            sql: r#"
CREATE TABLE imported_repeaters (
  id TEXT PRIMARY KEY NOT NULL,
  source_key TEXT NOT NULL UNIQUE,
  source_format TEXT NOT NULL,
  callsign TEXT NOT NULL,
  city TEXT,
  county TEXT,
  state TEXT,
  country TEXT,
  landmark TEXT,
  receive_frequency INTEGER NOT NULL,
  transmit_frequency INTEGER NOT NULL,
  transmit_tone INTEGER NOT NULL,
  transmit_tone_type TEXT NOT NULL,
  receive_tone INTEGER NOT NULL,
  receive_tone_type TEXT NOT NULL,
  use_type TEXT,
  operational_status TEXT,
  modes TEXT,
  notes TEXT,
  latitude REAL,
  longitude REAL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_imported_repeaters_callsign ON imported_repeaters(callsign);
CREATE INDEX idx_imported_repeaters_rx ON imported_repeaters(receive_frequency);
"#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "add_saved_channels_kind",
            sql: r#"
ALTER TABLE saved_channels ADD COLUMN kind TEXT NOT NULL DEFAULT 'channel';
CREATE INDEX idx_saved_channels_kind ON saved_channels(kind);
DROP TABLE IF EXISTS imported_repeaters;
"#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "create_channel_groups",
            sql: r#"
CREATE TABLE channel_groups (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_channel_groups_name ON channel_groups(name COLLATE NOCASE);
CREATE TABLE channel_group_members (
  group_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  PRIMARY KEY (group_id, channel_id)
);
CREATE INDEX idx_channel_group_members_channel ON channel_group_members(channel_id);
"#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "add_saved_channels_repeater_status",
            sql: r#"
ALTER TABLE saved_channels ADD COLUMN use_type TEXT;
ALTER TABLE saved_channels ADD COLUMN on_air INTEGER;
"#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "add_saved_channels_callsign",
            sql: "ALTER TABLE saved_channels ADD COLUMN callsign TEXT;",
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
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
        .manage(zoom::ZoomState::default())
        .invoke_handler(tauri::generate_handler![
            set_developer_mode,
            zoom::zoom_in_command,
            zoom::zoom_out_command,
            zoom::zoom_reset_command,
            zoom::zoom_by_command,
            save_text_file,
            load_text_file,
            fetch_repeaterbook_search,
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
        .on_menu_event(|app, event| match event.id().as_ref() {
            "preferences" => emit_menu_event(app, "open-preferences"),
            "check-for-updates" => emit_menu_event(app, "check-for-updates"),
            "open-memory" => emit_menu_event(app, "open-memory"),
            "save-memory" => emit_menu_event(app, "save-memory"),
            "save-memory-as" => emit_menu_event(app, "save-memory-as"),
            "import-from-radio" => emit_menu_event(app, "import-from-radio"),
            "write-to-radio" => emit_menu_event(app, "write-to-radio"),
            "developer-mode" => emit_developer_mode(app),
            "zoom-in" => {
                if let Err(error) = zoom::zoom_in(app) {
                    log::error!("Failed to zoom in: {error}");
                }
            }
            "zoom-out" => {
                if let Err(error) = zoom::zoom_out(app) {
                    log::error!("Failed to zoom out: {error}");
                }
            }
            "zoom-reset" => {
                if let Err(error) = zoom::zoom_reset(app) {
                    log::error!("Failed to reset zoom: {error}");
                }
            }
            _ => {}
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
