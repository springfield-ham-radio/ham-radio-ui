use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::UNIX_EPOCH;

use tauri::{AppHandle, Manager};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RadioImageBackupEntry {
    file_name: String,
    modified_at_ms: u64,
}

fn backups_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let root = app.path().app_data_dir().map_err(|error| error.to_string())?;
    let dir = root.join("backups");
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir)
}

fn validate_backup_file_name(file_name: &str) -> Result<(), String> {
    if file_name.len() > 180
        || !file_name.ends_with(".img")
        || file_name.contains('/')
        || file_name.contains('\\')
        || file_name.contains("..")
        || !file_name
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-' | '+'))
    {
        return Err("Invalid backup file name".into());
    }

    Ok(())
}

fn backup_file_path(app: &AppHandle, file_name: &str) -> Result<PathBuf, String> {
    validate_backup_file_name(file_name)?;
    let dir = backups_dir(app)?;
    let path = dir.join(file_name);
    let parent = path.parent().ok_or_else(|| "Invalid backup path".to_string())?;
    let canonical_dir = dir.canonicalize().map_err(|error| error.to_string())?;
    let canonical_parent = parent.canonicalize().map_err(|error| error.to_string())?;

    if canonical_parent != canonical_dir {
        return Err("Invalid backup path".into());
    }

    Ok(path)
}

fn modified_at_ms(path: &Path) -> Result<u64, String> {
    let modified = fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .map_err(|error| error.to_string())?;
    let millis = modified
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis();

    u64::try_from(millis).map_err(|_| "Backup timestamp is out of range".to_string())
}

#[tauri::command]
pub fn radio_image_backups_directory(app: AppHandle) -> Result<String, String> {
    backups_dir(&app).map(|path| path.to_string_lossy().to_string())
}

/// Open the backup folder in the system file manager.
///
/// The directory is owned by this app, so this uses the platform open command
/// instead of the opener plugin scope.
#[tauri::command]
pub fn open_radio_image_backups_directory(app: AppHandle) -> Result<(), String> {
    let dir = backups_dir(&app)?;
    open_directory(&dir)
}

fn open_directory(path: &Path) -> Result<(), String> {
    let mut command = if cfg!(target_os = "windows") {
        let mut command = Command::new("explorer");
        command.arg(path);
        command
    } else if cfg!(target_os = "macos") {
        let mut command = Command::new("open");
        command.arg(path);
        command
    } else {
        let mut command = Command::new("xdg-open");
        command.arg(path);
        command
    };

    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| error.to_string())?;

    std::thread::spawn(move || {
        let _ = child.wait();
    });

    Ok(())
}

#[tauri::command]
pub fn list_radio_image_backups(app: AppHandle) -> Result<Vec<RadioImageBackupEntry>, String> {
    let dir = backups_dir(&app)?;
    let mut entries = Vec::new();

    for item in fs::read_dir(&dir).map_err(|error| error.to_string())? {
        let item = item.map_err(|error| error.to_string())?;
        let path = item.path();

        if !path.is_file() {
            continue;
        }

        let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };

        if validate_backup_file_name(file_name).is_err() {
            continue;
        }

        entries.push(RadioImageBackupEntry {
            file_name: file_name.to_string(),
            modified_at_ms: modified_at_ms(&path)?,
        });
    }

    Ok(entries)
}

#[tauri::command]
pub fn save_radio_image_backup(app: AppHandle, file_name: String, contents: Vec<u8>) -> Result<(), String> {
    if contents.is_empty() {
        return Err("The radio image is empty".into());
    }

    let path = backup_file_path(&app, &file_name)?;
    fs::write(path, contents).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn load_radio_image_backup(app: AppHandle, file_name: String) -> Result<Vec<u8>, String> {
    let path = backup_file_path(&app, &file_name)?;
    let bytes = fs::read(path).map_err(|error| error.to_string())?;

    if bytes.is_empty() {
        return Err("The backup image is empty".into());
    }

    Ok(bytes)
}

#[tauri::command]
pub fn delete_radio_image_backups(app: AppHandle, file_names: Vec<String>) -> Result<(), String> {
    for file_name in file_names {
        let path = backup_file_path(&app, &file_name)?;

        if path.exists() {
            fs::remove_file(path).map_err(|error| error.to_string())?;
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::validate_backup_file_name;

    #[test]
    fn accepts_timestamped_backup_names() {
        assert!(validate_backup_file_name("Baofeng_UV-5R_20261003-171455_read.img").is_ok());
        assert!(validate_backup_file_name("Baofeng_UV-5R_20261003-171455-2_prewrite.img").is_ok());
    }

    #[test]
    fn rejects_names_that_leave_the_backup_folder() {
        assert!(validate_backup_file_name("../secrets.img").is_err());
        assert!(validate_backup_file_name("nested/file.img").is_err());
        assert!(validate_backup_file_name("notes.txt").is_err());
    }
}
