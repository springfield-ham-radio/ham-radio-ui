//! Optional SSH assist for installing and running ham-radio-sniffer on a remote host.
//!
//! Auth is key/agent only (`BatchMode=yes`). Password prompts are not supported.
//! The app uploads bundled sniffer sources and builds on the remote so native
//! bindings match the host architecture.

use serde::{Deserialize, Serialize};
use std::io::Read;
use std::path::PathBuf;
use std::process::{Child, Command, Output, Stdio};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager, State};

const MINIMUM_NODE_MAJOR: u32 = 24;
const SNIFFER_RESOURCE_RELATIVE: &str = "resources/ham-radio-sniffer";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteSnifferConfig {
    pub ssh_host: String,
    pub ssh_port: u16,
    pub remote_directory: String,
    pub remote_start_command: String,
    pub local_port: u16,
    pub remote_port: u16,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteSnifferCheckResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub node_version: Option<String>,
    pub yarn_available: bool,
    pub directory_writable: bool,
    pub messages: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteSnifferStatus {
    pub running: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteSnifferCommandResult {
    pub ok: bool,
    pub message: String,
}

pub struct RemoteSnifferState {
    pub tunnel: Mutex<Option<Child>>,
}

impl Default for RemoteSnifferState {
    fn default() -> Self {
        Self {
            tunnel: Mutex::new(None),
        }
    }
}

fn quote_remote_shell_arg(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn validate_config(config: &RemoteSnifferConfig) -> Result<(), String> {
    if config.ssh_host.trim().is_empty() {
        return Err("SSH host is required".into());
    }

    if config.ssh_port == 0 {
        return Err("SSH port must be greater than 0".into());
    }

    if config.remote_directory.trim().is_empty() {
        return Err("Remote directory is required".into());
    }

    if config.remote_start_command.trim().is_empty() {
        return Err("Remote start command is required".into());
    }

    if config.local_port == 0 || config.remote_port == 0 {
        return Err("Local and remote ports must be greater than 0".into());
    }

    Ok(())
}

fn ssh_base_args(config: &RemoteSnifferConfig) -> Vec<String> {
    vec![
        "-p".into(),
        config.ssh_port.to_string(),
        "-o".into(),
        "BatchMode=yes".into(),
        "-o".into(),
        "StrictHostKeyChecking=accept-new".into(),
        "-o".into(),
        "ConnectTimeout=15".into(),
        config.ssh_host.trim().to_string(),
    ]
}

fn run_command(program: &str, args: &[String]) -> Result<Output, String> {
    Command::new(program)
        .args(args)
        .output()
        .map_err(|error| format!("Failed to run {program}: {error}"))
}

fn output_stderr_or_stdout(output: &Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !stderr.is_empty() {
        return stderr;
    }

    String::from_utf8_lossy(&output.stdout).trim().to_string()
}

fn run_ssh(config: &RemoteSnifferConfig, remote_command: &str) -> Result<Output, String> {
    let mut args = ssh_base_args(config);
    args.push(remote_command.to_string());
    run_command("ssh", &args)
}

fn require_success(label: &str, output: Output) -> Result<String, String> {
    if output.status.success() {
        return Ok(String::from_utf8_lossy(&output.stdout).trim().to_string());
    }

    let detail = output_stderr_or_stdout(&output);
    if detail.is_empty() {
        Err(format!("{label} failed"))
    } else {
        Err(format!("{label} failed: {detail}"))
    }
}

fn parse_node_major(version: &str) -> Option<u32> {
    let trimmed = version.trim().trim_start_matches('v');
    let major = trimmed.split('.').next()?;
    major.parse().ok()
}

fn bundled_sniffer_path(app: &AppHandle) -> Result<PathBuf, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| format!("Unable to resolve resource directory: {error}"))?;

    let candidates = [
        resource_dir.join(SNIFFER_RESOURCE_RELATIVE),
        resource_dir.join("ham-radio-sniffer"),
        // Dev fallback: src-tauri/resources/... relative to the crate
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(SNIFFER_RESOURCE_RELATIVE),
    ];

    for candidate in candidates {
        if candidate.join("package.json").is_file() {
            return Ok(candidate);
        }
    }

    Err(
        "Bundled sniffer sources were not found. Rebuild the desktop app so resources/ham-radio-sniffer is included."
            .into(),
    )
}

fn stop_tunnel(state: &RemoteSnifferState) -> Result<(), String> {
    let mut guard = state
        .tunnel
        .lock()
        .map_err(|_| "Remote sniffer state is locked".to_string())?;

    if let Some(mut child) = guard.take() {
        let _ = child.kill();
        let _ = child.wait();
    }

    Ok(())
}

fn is_tunnel_running(state: &RemoteSnifferState) -> Result<bool, String> {
    let mut guard = state
        .tunnel
        .lock()
        .map_err(|_| "Remote sniffer state is locked".to_string())?;

    match guard.as_mut() {
        None => Ok(false),
        Some(child) => match child.try_wait() {
            Ok(None) => Ok(true),
            Ok(Some(_)) => {
                *guard = None;
                Ok(false)
            }
            Err(error) => Err(format!("Unable to poll SSH tunnel: {error}")),
        },
    }
}

fn build_check_result(config: &RemoteSnifferConfig) -> RemoteSnifferCheckResult {
    let mut messages = Vec::new();
    let mut node_version = None;
    let mut yarn_available = false;
    let mut directory_writable = false;

    if let Err(error) = validate_config(config) {
        messages.push(error);
        return RemoteSnifferCheckResult {
            ok: false,
            node_version,
            yarn_available,
            directory_writable,
            messages,
        };
    }

    let remote_directory = config.remote_directory.trim();
    let quoted_directory = quote_remote_shell_arg(remote_directory);

    let check_script = format!(
        "bash -lc {}",
        quote_remote_shell_arg(&format!(
            r#"set +e
NODE_VERSION=$(node -v 2>/dev/null || true)
YARN_OK=0
if command -v yarn >/dev/null 2>&1; then
  YARN_OK=1
elif command -v corepack >/dev/null 2>&1; then
  YARN_OK=1
fi
PARENT=$(dirname {quoted_directory})
DIR_OK=0
if mkdir -p "$PARENT" 2>/dev/null && mkdir -p {quoted_directory} 2>/dev/null && test -w {quoted_directory}; then
  DIR_OK=1
fi
printf 'NODE=%s\n' "$NODE_VERSION"
printf 'YARN=%s\n' "$YARN_OK"
printf 'DIR=%s\n' "$DIR_OK"
"#
        ))
    );

    match run_ssh(config, &check_script) {
        Ok(output) => {
            if !output.status.success() {
                messages.push(format!(
                    "SSH connection failed: {}",
                    output_stderr_or_stdout(&output)
                ));
            } else {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for line in stdout.lines() {
                    if let Some(value) = line.strip_prefix("NODE=") {
                        let trimmed = value.trim();
                        if !trimmed.is_empty() {
                            node_version = Some(trimmed.to_string());
                        }
                    } else if let Some(value) = line.strip_prefix("YARN=") {
                        yarn_available = value.trim() == "1";
                    } else if let Some(value) = line.strip_prefix("DIR=") {
                        directory_writable = value.trim() == "1";
                    }
                }
            }
        }
        Err(error) => {
            messages.push(error);
            return RemoteSnifferCheckResult {
                ok: false,
                node_version,
                yarn_available,
                directory_writable,
                messages,
            };
        }
    }

    if messages.iter().any(|message| message.contains("SSH connection failed")) {
        return RemoteSnifferCheckResult {
            ok: false,
            node_version,
            yarn_available,
            directory_writable,
            messages,
        };
    }

    match &node_version {
        None => messages.push(format!(
            "Node.js was not found on the remote host. Install Node.js {MINIMUM_NODE_MAJOR} or newer (matching the sniffer .nvmrc), then try again. The app does not install Node automatically."
        )),
        Some(version) => match parse_node_major(version) {
            Some(major) if major >= MINIMUM_NODE_MAJOR => {
                messages.push(format!("Node.js {version} is OK."));
            }
            Some(major) => {
                messages.push(format!(
                    "Node.js {version} is too old (major {major}). Install Node.js {MINIMUM_NODE_MAJOR} or newer. The app does not upgrade Node automatically."
                ));
            }
            None => {
                messages.push(format!(
                    "Could not parse remote Node.js version ({version}). Install Node.js {MINIMUM_NODE_MAJOR} or newer."
                ));
            }
        },
    }

    if yarn_available {
        messages.push("Yarn or Corepack is available.".into());
    } else {
        messages.push(
            "Neither yarn nor corepack was found. Install Yarn (or enable Corepack with a recent Node), then try again."
                .into(),
        );
    }

    if directory_writable {
        messages.push(format!("Remote directory {remote_directory} is writable."));
    } else {
        messages.push(format!(
            "Cannot create or write to remote directory {remote_directory}."
        ));
    }

    let node_ok = node_version
        .as_deref()
        .and_then(parse_node_major)
        .is_some_and(|major| major >= MINIMUM_NODE_MAJOR);

    RemoteSnifferCheckResult {
        ok: node_ok && yarn_available && directory_writable && messages.iter().all(|m| !m.contains("SSH connection failed")),
        node_version,
        yarn_available,
        directory_writable,
        messages,
    }
}

fn upload_bundled_sniffer(app: &AppHandle, config: &RemoteSnifferConfig) -> Result<(), String> {
    let local_path = bundled_sniffer_path(app)?;
    let remote_directory = config.remote_directory.trim();
    let quoted_directory = quote_remote_shell_arg(remote_directory);

    require_success(
        "Create remote directory",
        run_ssh(
            config,
            &format!(
                "bash -lc {}",
                quote_remote_shell_arg(&format!("mkdir -p {quoted_directory}"))
            ),
        )?,
    )?;

    // Prefer rsync when available; fall back to scp -r.
    let remote_target = format!("{}:{}", config.ssh_host.trim(), remote_directory);
    let rsync_args = vec![
        "-az".into(),
        "-e".into(),
        format!("ssh -p {} -o BatchMode=yes -o StrictHostKeyChecking=accept-new", config.ssh_port),
        format!("{}/", local_path.display()),
        remote_target.clone(),
    ];

    let rsync_result = run_command("rsync", &rsync_args);
    if let Ok(output) = &rsync_result {
        if output.status.success() {
            return Ok(());
        }
    }

    let rsync_detail = match &rsync_result {
        Ok(output) => output_stderr_or_stdout(output),
        Err(error) => error.clone(),
    };

    let mut scp_args = vec![
        "-r".into(),
        "-P".into(),
        config.ssh_port.to_string(),
        "-o".into(),
        "BatchMode=yes".into(),
        "-o".into(),
        "StrictHostKeyChecking=accept-new".into(),
    ];

    // Copy contents into the remote directory.
    let entries = std::fs::read_dir(&local_path)
        .map_err(|error| format!("Unable to read bundled sniffer: {error}"))?;

    let mut sources = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        sources.push(entry.path().display().to_string());
    }

    if sources.is_empty() {
        return Err("Bundled sniffer directory is empty".into());
    }

    scp_args.extend(sources);
    scp_args.push(format!("{}:{}/", config.ssh_host.trim(), remote_directory));

    let scp_output = run_command("scp", &scp_args)?;
    if scp_output.status.success() {
        return Ok(());
    }

    let scp_detail = output_stderr_or_stdout(&scp_output);
    Err(format!(
        "Upload failed. rsync: {rsync_detail}; scp: {scp_detail}"
    ))
}

fn remote_install_and_build(config: &RemoteSnifferConfig) -> Result<(), String> {
    let remote_directory = config.remote_directory.trim();
    let quoted_directory = quote_remote_shell_arg(remote_directory);
    let script = format!(
        "bash -lc {}",
        quote_remote_shell_arg(&format!(
            "set -euo pipefail; cd {quoted_directory}; if command -v corepack >/dev/null 2>&1; then corepack enable; fi; HUSKY=0 yarn install; yarn build"
        ))
    );

    require_success("Remote yarn install/build", run_ssh(config, &script)?)?;
    Ok(())
}

#[tauri::command]
pub fn check_remote_sniffer_host(config: RemoteSnifferConfig) -> Result<RemoteSnifferCheckResult, String> {
    Ok(build_check_result(&config))
}

#[tauri::command]
pub fn install_remote_sniffer(
    app: AppHandle,
    config: RemoteSnifferConfig,
) -> Result<RemoteSnifferCommandResult, String> {
    let check = build_check_result(&config);
    if !check.ok {
        return Ok(RemoteSnifferCommandResult {
            ok: false,
            message: check
                .messages
                .into_iter()
                .filter(|message| {
                    !message.ends_with(" is OK.")
                        && !message.contains("is available")
                        && !message.contains("is writable")
                })
                .collect::<Vec<_>>()
                .join(" "),
        });
    }

    upload_bundled_sniffer(&app, &config)?;
    remote_install_and_build(&config)?;

    Ok(RemoteSnifferCommandResult {
        ok: true,
        message: format!(
            "Uploaded bundled sniffer to {} and finished yarn install/build.",
            config.remote_directory.trim()
        ),
    })
}

#[tauri::command]
pub fn start_remote_sniffer(
    state: State<'_, RemoteSnifferState>,
    config: RemoteSnifferConfig,
) -> Result<RemoteSnifferCommandResult, String> {
    validate_config(&config)?;

    if is_tunnel_running(&state)? {
        return Ok(RemoteSnifferCommandResult {
            ok: true,
            message: "Remote sniffer SSH session is already running.".into(),
        });
    }

    let check = build_check_result(&config);
    if !check.ok {
        return Ok(RemoteSnifferCommandResult {
            ok: false,
            message: check.messages.join(" "),
        });
    }

    stop_tunnel(&state)?;

    let remote_directory = config.remote_directory.trim();
    let quoted_directory = quote_remote_shell_arg(remote_directory);
    let start_command = config.remote_start_command.trim();
    let remote_script = format!(
        "bash -lc {}",
        quote_remote_shell_arg(&format!(
            "set -euo pipefail; cd {quoted_directory}; exec {start_command}"
        ))
    );

    let forward = format!(
        "{}:127.0.0.1:{}",
        config.local_port, config.remote_port
    );

    let mut child = Command::new("ssh")
        .arg("-p")
        .arg(config.ssh_port.to_string())
        .arg("-o")
        .arg("BatchMode=yes")
        .arg("-o")
        .arg("StrictHostKeyChecking=accept-new")
        .arg("-o")
        .arg("ExitOnForwardFailure=yes")
        .arg("-o")
        .arg("ServerAliveInterval=30")
        .arg("-L")
        .arg(&forward)
        .arg(config.ssh_host.trim())
        .arg(&remote_script)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Failed to start SSH session: {error}"))?;

    // Give the tunnel a moment to fail fast (auth / bind / remote exec).
    std::thread::sleep(Duration::from_millis(800));

    match child.try_wait() {
        Ok(Some(status)) => {
            let mut stderr = String::new();
            if let Some(mut pipe) = child.stderr.take() {
                let _ = pipe.read_to_string(&mut stderr);
            }
            let detail = stderr.trim();
            return Err(if detail.is_empty() {
                format!("SSH session exited immediately ({status})")
            } else {
                format!("SSH session exited immediately: {detail}")
            });
        }
        Ok(None) => {}
        Err(error) => return Err(format!("Unable to poll SSH session: {error}")),
    }

    let mut guard = state
        .tunnel
        .lock()
        .map_err(|_| "Remote sniffer state is locked".to_string())?;
    *guard = Some(child);

    Ok(RemoteSnifferCommandResult {
        ok: true,
        message: format!(
            "Started remote sniffer with local forward 127.0.0.1:{} -> remote :{}. Point Sniffer URL at http://127.0.0.1:{}.",
            config.local_port, config.remote_port, config.local_port
        ),
    })
}

#[tauri::command]
pub fn stop_remote_sniffer(
    state: State<'_, RemoteSnifferState>,
) -> Result<RemoteSnifferCommandResult, String> {
    if !is_tunnel_running(&state)? {
        return Ok(RemoteSnifferCommandResult {
            ok: true,
            message: "Remote sniffer SSH session is not running.".into(),
        });
    }

    stop_tunnel(&state)?;

    Ok(RemoteSnifferCommandResult {
        ok: true,
        message: "Stopped remote sniffer SSH session.".into(),
    })
}

#[tauri::command]
pub fn remote_sniffer_status(
    state: State<'_, RemoteSnifferState>,
) -> Result<RemoteSnifferStatus, String> {
    Ok(RemoteSnifferStatus {
        running: is_tunnel_running(&state)?,
    })
}

#[cfg(test)]
mod tests {
    use super::{parse_node_major, quote_remote_shell_arg};

    #[test]
    fn quotes_single_quotes_for_bash() {
        assert_eq!(
            quote_remote_shell_arg("/tmp/o'sniffer"),
            "'/tmp/o'\\''sniffer'"
        );
    }

    #[test]
    fn parses_node_major_versions() {
        assert_eq!(parse_node_major("v24.12.0"), Some(24));
        assert_eq!(parse_node_major("20.11.1"), Some(20));
        assert_eq!(parse_node_major("missing"), None);
    }
}
