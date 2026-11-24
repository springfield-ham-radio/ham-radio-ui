use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

const BASELINE_FILE: &str = "baseline.img";
const SESSION_FILE: &str = "session.json";

fn captures_root(app: &AppHandle) -> Result<PathBuf, String> {
    let root = app.path().app_data_dir().map_err(|error| error.to_string())?;
    let dir = root.join("menu-captures");
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir)
}

fn validate_saved_radio_id(saved_radio_id: &str) -> Result<(), String> {
    if saved_radio_id.is_empty()
        || saved_radio_id.len() > 64
        || saved_radio_id.contains('/')
        || saved_radio_id.contains('\\')
        || saved_radio_id.contains("..")
        || !saved_radio_id
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_'))
    {
        return Err("Invalid saved radio id".into());
    }

    Ok(())
}

fn validate_step_image_name(file_name: &str) -> Result<(), String> {
    if !file_name.starts_with("step-")
        || !file_name.ends_with(".img")
        || file_name.len() != "step-000.img".len()
        || file_name.contains('/')
        || file_name.contains('\\')
        || file_name.contains("..")
    {
        return Err("Invalid step image name".into());
    }

    let middle = &file_name[5..file_name.len() - 4];
    if middle.len() != 3 || !middle.chars().all(|ch| ch.is_ascii_digit()) {
        return Err("Invalid step image name".into());
    }

    Ok(())
}

fn session_dir(app: &AppHandle, saved_radio_id: &str) -> Result<PathBuf, String> {
    validate_saved_radio_id(saved_radio_id)?;
    let root = captures_root(app)?;
    let path = root.join(saved_radio_id);
    Ok(path)
}

fn contained_in(parent: &Path, child: &Path) -> Result<(), String> {
    let canonical_parent = parent.canonicalize().map_err(|error| error.to_string())?;
    let canonical_child = child.canonicalize().map_err(|error| error.to_string())?;

    if !canonical_child.starts_with(&canonical_parent) {
        return Err("Invalid menu capture path".into());
    }

    Ok(())
}

fn session_file_path(app: &AppHandle, saved_radio_id: &str) -> Result<PathBuf, String> {
    let dir = session_dir(app, saved_radio_id)?;
    let path = dir.join(SESSION_FILE);

    if dir.exists() {
        contained_in(&captures_root(app)?, &path)?;
    }

    Ok(path)
}

fn image_path(app: &AppHandle, saved_radio_id: &str, file_name: &str) -> Result<PathBuf, String> {
    if file_name != BASELINE_FILE {
        validate_step_image_name(file_name)?;
    } else if file_name.contains('/') || file_name.contains('\\') || file_name.contains("..") {
        return Err("Invalid image file name".into());
    }

    let dir = session_dir(app, saved_radio_id)?;
    let path = dir.join(file_name);
    contained_in(&captures_root(app)?, &path)?;
    Ok(path)
}

#[tauri::command]
pub fn menu_capture_load_session(app: AppHandle, saved_radio_id: String) -> Result<Option<String>, String> {
    let path = session_file_path(&app, &saved_radio_id)?;

    if !path.is_file() {
        return Ok(None);
    }

    fs::read_to_string(path).map(Some).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn menu_capture_save_session(app: AppHandle, saved_radio_id: String, contents: String) -> Result<(), String> {
    if contents.trim().is_empty() {
        return Err("The menu capture session is empty".into());
    }

    let dir = session_dir(&app, &saved_radio_id)?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let path = dir.join(SESSION_FILE);
    contained_in(&captures_root(&app)?, &path)?;
    fs::write(path, contents).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn menu_capture_save_baseline(app: AppHandle, saved_radio_id: String, contents: Vec<u8>) -> Result<(), String> {
    if contents.is_empty() {
        return Err("The baseline image is empty".into());
    }

    let dir = session_dir(&app, &saved_radio_id)?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let path = image_path(&app, &saved_radio_id, BASELINE_FILE)?;

    if path.exists() {
        return Err("This session already has a baseline image".into());
    }

    fs::write(path, contents).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn menu_capture_load_baseline(app: AppHandle, saved_radio_id: String) -> Result<Vec<u8>, String> {
    let path = image_path(&app, &saved_radio_id, BASELINE_FILE)?;

    if !path.is_file() {
        return Err("This session has no baseline image".into());
    }

    let bytes = fs::read(path).map_err(|error| error.to_string())?;

    if bytes.is_empty() {
        return Err("The baseline image is empty".into());
    }

    Ok(bytes)
}

#[tauri::command]
pub fn menu_capture_save_step_image(
    app: AppHandle,
    saved_radio_id: String,
    file_name: String,
    contents: Vec<u8>,
) -> Result<(), String> {
    if contents.is_empty() {
        return Err("The step image is empty".into());
    }

    let path = image_path(&app, &saved_radio_id, &file_name)?;
    let dir = path.parent().ok_or_else(|| "Invalid step image path".to_string())?;
    fs::create_dir_all(dir).map_err(|error| error.to_string())?;
    fs::write(path, contents).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn menu_capture_load_step_image(
    app: AppHandle,
    saved_radio_id: String,
    file_name: String,
) -> Result<Vec<u8>, String> {
    let path = image_path(&app, &saved_radio_id, &file_name)?;
    let bytes = fs::read(path).map_err(|error| error.to_string())?;

    if bytes.is_empty() {
        return Err("The step image is empty".into());
    }

    Ok(bytes)
}

#[tauri::command]
pub fn menu_capture_delete_images(app: AppHandle, saved_radio_id: String, file_names: Vec<String>) -> Result<(), String> {
    for file_name in file_names {
        let path = image_path(&app, &saved_radio_id, &file_name)?;

        if path.exists() {
            fs::remove_file(path).map_err(|error| error.to_string())?;
        }
    }

    Ok(())
}

#[tauri::command]
pub fn menu_capture_discard_session(app: AppHandle, saved_radio_id: String) -> Result<(), String> {
    let dir = session_dir(&app, &saved_radio_id)?;

    if !dir.exists() {
        return Ok(());
    }

    contained_in(&captures_root(&app)?, &dir)?;

    fs::remove_dir_all(dir).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::{validate_saved_radio_id, validate_step_image_name};

    #[test]
    fn accepts_step_image_names() {
        assert!(validate_step_image_name("step-001.img").is_ok());
        assert!(validate_step_image_name("step-123.img").is_ok());
    }

    #[test]
    fn rejects_unsafe_names() {
        assert!(validate_saved_radio_id("../radio").is_err());
        assert!(validate_step_image_name("../baseline.img").is_err());
        assert!(validate_step_image_name("step-12.img").is_err());
        assert!(validate_step_image_name("baseline.img").is_err());
    }
}