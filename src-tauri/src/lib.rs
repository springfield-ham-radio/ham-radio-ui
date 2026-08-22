use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::Emitter;

fn build_menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<Menu<R>> {
    let preferences = MenuItem::with_id(app, "preferences", "Settings...", true, Some("CmdOrCtrl+,"))?;
    let open_memory = MenuItem::with_id(app, "open-memory", "Open Memory...", true, Some("CmdOrCtrl+O"))?;
    let save_memory = MenuItem::with_id(app, "save-memory", "Save", true, Some("CmdOrCtrl+S"))?;
    let save_memory_as = MenuItem::with_id(app, "save-memory-as", "Save As...", true, Some("CmdOrCtrl+Shift+S"))?;
    let import_from_radio = MenuItem::with_id(app, "import-from-radio", "Import from Radio...", true, None::<&str>)?;

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
            "Ham Radio",
            true,
            &[
                &PredefinedMenuItem::about(app, None, None)?,
                &PredefinedMenuItem::separator(app)?,
                &preferences,
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
                &PredefinedMenuItem::separator(app)?,
                &preferences,
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
    tauri::Builder::default()
        .plugin(tauri_plugin_serialplugin::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![save_text_file, load_text_file])
        .menu(build_menu)
        .on_menu_event(|app, event| {
            match event.id().as_ref() {
                "preferences" => emit_menu_event(app, "open-preferences"),
                "open-memory" => emit_menu_event(app, "open-memory"),
                "save-memory" => emit_menu_event(app, "save-memory"),
                "save-memory-as" => emit_menu_event(app, "save-memory-as"),
                "import-from-radio" => emit_menu_event(app, "import-from-radio"),
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
