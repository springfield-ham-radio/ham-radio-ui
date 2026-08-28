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

fn install_directory(app: &AppHandle, module_id: &str, version: &str) -> Result<PathBuf, String> {
    if module_id.trim().is_empty() || version.trim().is_empty() {
        return Err("module_id and version are required".into());
    }

    if module_id.contains("..") || version.contains("..") || module_id.contains('/') || version.contains('/') {
        return Err("Invalid module_id or version".into());
    }

    Ok(radio_modules_root(app)?.join(module_id).join(version))
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

        if path.is_file() && path.extension().and_then(|ext| ext.to_str()) == Some("json") {
            paths.push(path.to_string_lossy().to_string());
        }
    }

    paths.sort();

    if paths.is_empty() {
        return Err("Installed module has no config JSON files".into());
    }

    Ok(paths)
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

    let install_path = install_directory(app, module_id, version)?;
    extract_json_zip(zip_bytes, &install_path)?;
    let config_paths = list_config_paths(&install_path)?;

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
