use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Manager};

const ALLOWED_DOWNLOAD_HOSTS: &[&str] = &[
    "github.com",
    "objects.githubusercontent.com",
    "release-assets.githubusercontent.com",
    "springfield-ham-radio.github.io",
];

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledRadioModule {
    pub module_id: String,
    pub version: String,
    pub install_path: String,
    pub config_paths: Vec<String>,
}

fn is_allowed_download_url(url: &str) -> Result<(), String> {
    let parsed = url::Url::parse(url).map_err(|error| error.to_string())?;

    if parsed.scheme() != "https" {
        return Err("Download URL must use https".into());
    }

    let host = parsed.host_str().ok_or_else(|| "Download URL is missing a host".to_string())?;

    if ALLOWED_DOWNLOAD_HOSTS.iter().any(|allowed| *allowed == host) {
        Ok(())
    } else {
        Err(format!("Download host is not allowlisted: {host}"))
    }
}

fn parse_sha256_integrity(integrity: &str) -> Result<String, String> {
    let trimmed = integrity.trim().to_lowercase();
    let hex = trimmed
        .strip_prefix("sha256:")
        .ok_or_else(|| "Integrity must start with sha256:".to_string())?;

    if hex.len() != 64 || !hex.chars().all(|ch| ch.is_ascii_hexdigit()) {
        return Err("Integrity must be sha256 followed by 64 hex characters".into());
    }

    Ok(hex.to_string())
}

fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn radio_modules_root(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    Ok(app_data.join("radio-modules"))
}

fn safe_install_segment(value: &str) -> Result<(), String> {
    if value.is_empty() || value != value.trim() {
        return Err("module_id and version are required".into());
    }

    if value.contains(['/', '\\', ':', '\0']) || value.contains("..") {
        return Err("Invalid module_id or version".into());
    }

    let path = Path::new(value);
    let mut components = path.components();

    match (components.next(), components.next()) {
        (Some(Component::Normal(segment)), None) if segment.to_str() == Some(value) => Ok(()),
        _ => Err("Invalid module_id or version".into()),
    }
}

fn install_directory(app: &AppHandle, module_id: &str, version: &str) -> Result<PathBuf, String> {
    safe_install_segment(module_id)?;
    safe_install_segment(version)?;

    let root = radio_modules_root(app)?;
    let install_path = root.join(module_id).join(version);

    if !install_path.starts_with(&root) {
        return Err("Invalid module_id or version".into());
    }

    Ok(install_path)
}

/// `configs/<file>.json` at the zip root, not a nested JSON file and not another `configs` directory.
fn is_direct_configs_json(name: &str) -> bool {
    if !is_safe_zip_entry(name) {
        return false;
    }

    let path = Path::new(name);
    let parts: Vec<_> = path
        .components()
        .filter(|component| !matches!(component, Component::CurDir))
        .collect();

    if parts.len() != 2 {
        return false;
    }

    match (parts.first(), parts.get(1)) {
        (Some(Component::Normal(directory)), Some(Component::Normal(file))) => {
            directory.to_str() == Some("configs")
                && file
                    .to_str()
                    .is_some_and(|name| name.to_ascii_lowercase().ends_with(".json"))
        }
        _ => false,
    }
}

fn is_safe_zip_entry(name: &str) -> bool {
    let path = Path::new(name);

    if path.is_absolute() {
        return false;
    }

    for component in path.components() {
        match component {
            Component::Normal(_) | Component::CurDir => {}
            _ => return false,
        }
    }

    name.ends_with(".json")
}

fn extract_json_zip(zip_bytes: &[u8], destination: &Path) -> Result<Vec<String>, String> {
    if destination.exists() {
        fs::remove_dir_all(destination).map_err(|error| error.to_string())?;
    }

    fs::create_dir_all(destination).map_err(|error| error.to_string())?;

    let cursor = std::io::Cursor::new(zip_bytes);
    let mut archive = zip::ZipArchive::new(cursor).map_err(|error| error.to_string())?;
    let mut extracted = Vec::new();

    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|error| error.to_string())?;
        let name = entry.name().to_string();

        if name.ends_with('/') {
            continue;
        }

        if !is_safe_zip_entry(&name) {
            return Err(format!(
                "Refusing to extract non-JSON or unsafe path from module zip: {name}"
            ));
        }

        let output_path = destination.join(&name);
        if let Some(parent) = output_path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }

        let mut output = File::create(&output_path).map_err(|error| error.to_string())?;
        let mut buffer = Vec::new();
        entry
            .read_to_end(&mut buffer)
            .map_err(|error| error.to_string())?;
        output
            .write_all(&buffer)
            .map_err(|error| error.to_string())?;
        extracted.push(output_path.to_string_lossy().to_string());
    }

    if extracted.is_empty() {
        return Err("Module zip did not contain any JSON files".into());
    }

    Ok(extracted)
}

fn list_config_paths(install_path: &Path) -> Result<Vec<String>, String> {
    let configs_dir = install_path.join("configs");
    if !configs_dir.is_dir() {
        return Err("Installed module is missing a configs directory".into());
    }

    let mut paths = Vec::new();

    for entry in fs::read_dir(&configs_dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();

        if path.is_file()
            && path
                .extension()
                .and_then(|ext| ext.to_str())
                .is_some_and(|ext| ext.eq_ignore_ascii_case("json"))
        {
            paths.push(path.to_string_lossy().to_string());
        }
    }

    paths.sort();

    if paths.len() != 1 {
        return Err(format!(
            "Installed module must contain exactly one config JSON file under configs/, found {}",
            paths.len()
        ));
    }

    Ok(paths)
}

fn config_json_count_in_zip(zip_bytes: &[u8]) -> Result<usize, String> {
    let cursor = std::io::Cursor::new(zip_bytes);
    let mut archive = zip::ZipArchive::new(cursor).map_err(|error| error.to_string())?;
    let mut count = 0usize;

    for index in 0..archive.len() {
        let entry = archive.by_index(index).map_err(|error| error.to_string())?;
        let name = entry.name();

        if name.ends_with('/') {
            continue;
        }

        if !is_safe_zip_entry(name) {
            return Err(format!(
                "Refusing to extract non-JSON or unsafe path from module zip: {name}"
            ));
        }

        if is_direct_configs_json(name) {
            count += 1;
        }
    }

    Ok(count)
}

const LEGACY_MANUFACTURER_MODULE_IDS: &[&str] = &["kenwood", "baofeng"];

#[tauri::command]
pub fn migrate_legacy_manufacturer_radio_modules(app: AppHandle) -> Result<Vec<String>, String> {
    let root = radio_modules_root(&app)?;
    let mut legacy_directories = Vec::new();

    for module_id in LEGACY_MANUFACTURER_MODULE_IDS {
        let legacy_dir = root.join(module_id);
        legacy_directories.push(legacy_dir.to_string_lossy().to_string());

        if legacy_dir.is_dir() {
            fs::remove_dir_all(&legacy_dir).map_err(|error| error.to_string())?;
        }
    }

    Ok(legacy_directories)
}

fn finalize_install(
    app: &AppHandle,
    module_id: &str,
    version: &str,
    zip_bytes: &[u8],
    expected_integrity: Option<&str>,
) -> Result<InstalledRadioModule, String> {
    if let Some(integrity) = expected_integrity {
        let expected = parse_sha256_integrity(integrity)?;
        let actual = sha256_hex(zip_bytes);

        if actual != expected {
            return Err(format!(
                "Module integrity mismatch: expected sha256:{expected}, got sha256:{actual}"
            ));
        }
    }

    let config_count = config_json_count_in_zip(zip_bytes)?;

    if config_count != 1 {
        return Err(format!(
            "Module zip must contain exactly one configs/*.json file, found {config_count}"
        ));
    }

    let install_path = install_directory(app, module_id, version)?;

    if let Err(error) = extract_json_zip(zip_bytes, &install_path) {
        let _ = fs::remove_dir_all(&install_path);
        return Err(error);
    }

    let config_paths = match list_config_paths(&install_path) {
        Ok(paths) => paths,
        Err(error) => {
            let _ = fs::remove_dir_all(&install_path);
            return Err(error);
        }
    };

    Ok(InstalledRadioModule {
        module_id: module_id.to_string(),
        version: version.to_string(),
        install_path: install_path.to_string_lossy().to_string(),
        config_paths,
    })
}

#[tauri::command]
pub async fn download_and_install_radio_module(
    app: AppHandle,
    url: String,
    integrity: String,
    module_id: String,
    version: String,
) -> Result<InstalledRadioModule, String> {
    is_allowed_download_url(&url)?;

    let response = reqwest::get(&url)
        .await
        .map_err(|error| error.to_string())?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to download radio module: HTTP {}",
            response.status()
        ));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|error| error.to_string())?
        .to_vec();

    finalize_install(&app, &module_id, &version, &bytes, Some(&integrity))
}

#[tauri::command]
pub fn install_radio_module_from_zip(
    app: AppHandle,
    zip_path: String,
    module_id: String,
    version: String,
    integrity: Option<String>,
) -> Result<InstalledRadioModule, String> {
    let bytes = fs::read(&zip_path).map_err(|error| error.to_string())?;
    finalize_install(
        &app,
        &module_id,
        &version,
        &bytes,
        integrity.as_deref(),
    )
}

#[tauri::command]
pub fn list_installed_radio_module_configs(
    app: AppHandle,
    module_id: String,
    version: String,
) -> Result<Vec<String>, String> {
    let install_path = install_directory(&app, &module_id, &version)?;
    list_config_paths(&install_path)
}

#[tauri::command]
pub fn uninstall_radio_module(
    app: AppHandle,
    module_id: String,
    version: String,
) -> Result<(), String> {
    let install_path = install_directory(&app, &module_id, &version)?;

    if !install_path.exists() {
        return Ok(());
    }

    fs::remove_dir_all(&install_path).map_err(|error| error.to_string())?;

    if let Some(module_dir) = install_path.parent() {
        if module_dir
            .read_dir()
            .map(|mut entries| entries.next().is_none())
            .unwrap_or(false)
        {
            let _ = fs::remove_dir(module_dir);
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{config_json_count_in_zip, is_direct_configs_json, safe_install_segment};
    use std::io::{Cursor, Write};
    use zip::write::SimpleFileOptions;
    use zip::ZipWriter;

    fn zip_with(files: &[(&str, &str)]) -> Vec<u8> {
        let mut cursor = Cursor::new(Vec::new());
        {
            let mut archive = ZipWriter::new(&mut cursor);
            let options = SimpleFileOptions::default();

            for (name, body) in files {
                archive.start_file(*name, options).expect("start zip entry");
                archive.write_all(body.as_bytes()).expect("write zip entry");
            }

            archive.finish().expect("finish zip");
        }

        cursor.into_inner()
    }

    #[test]
    fn rejects_install_segments_that_leave_the_module_directory() {
        assert!(safe_install_segment("kenwood-th-f6").is_ok());
        assert!(safe_install_segment("1.11.0").is_ok());
        assert!(safe_install_segment("..").is_err());
        assert!(safe_install_segment("../secrets").is_err());
        assert!(safe_install_segment("kenwood/th-f6").is_err());
        assert!(safe_install_segment("kenwood\\th-f6").is_err());
        assert!(safe_install_segment("C:kenwood").is_err());
        assert!(safe_install_segment(".").is_err());
        assert!(safe_install_segment("").is_err());
        assert!(safe_install_segment(" 1.11.0").is_err());
    }

    #[test]
    fn counts_only_a_direct_configs_json() {
        assert!(is_direct_configs_json("configs/kenwood-th-f6.json"));
        assert!(!is_direct_configs_json("configs/nested/kenwood-th-f6.json"));
        assert!(!is_direct_configs_json("src/shared/schemas/channel-schema.json"));

        let one = zip_with(&[
            ("configs/kenwood-th-f6.json", "{}"),
            ("src/shared/schemas/channel-schema.json", "{}"),
        ]);
        assert_eq!(config_json_count_in_zip(&one).expect("one config"), 1);

        let two = zip_with(&[("configs/a.json", "{}"), ("configs/b.json", "{}")]);
        assert_eq!(config_json_count_in_zip(&two).expect("two configs"), 2);

        let none = zip_with(&[("src/shared/schemas/channel-schema.json", "{}")]);
        assert_eq!(config_json_count_in_zip(&none).expect("no config"), 0);

        let escaped = zip_with(&[("configs/../secrets.json", "{}")]);
        assert!(config_json_count_in_zip(&escaped).is_err());
    }
}
