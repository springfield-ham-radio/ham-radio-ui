//! Optional assist for installing and running ham-radio-sniffer locally or over SSH.
//!
//! SSH auth is key/agent only (`BatchMode=yes`). Password prompts are not supported.
//! The app copies bundled sniffer sources and builds on the target so native
//! bindings match that machine’s architecture.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use tauri::{AppHandle, Manager};

const MINIMUM_NODE_MAJOR: u32 = 26;
const SNIFFER_RESOURCE_RELATIVE: &str = "resources/ham-radio-sniffer";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteSnifferConfig {
    #[serde(default)]
    pub ssh_enabled: bool,
    pub ssh_host: String,
    pub ssh_port: u16,
    pub remote_directory: String,
    pub remote_start_command: String,
    pub port: u16,
    #[serde(default = "default_bind_host")]
    pub bind_host: String,
}

fn default_bind_host() -> String {
    "0.0.0.0".into()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteSnifferCheckResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub node_version: Option<String>,
    pub yarn_available: bool,
    pub directory_writable: bool,
    /// `package.json` is present in the remote directory.
    pub sources_present: bool,
    /// Built Nitro output is present (`.output/server/index.mjs`).
    pub build_present: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub installed_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expected_version: Option<String>,
    /// True when a version check is not applicable, or installed matches bundled.
    pub version_match: bool,
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

fn quote_remote_shell_arg(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn escape_double_quoted(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('$', "\\$")
        .replace('`', "\\`")
}

/// RHS for `DIR=<expr>` on the remote host.
///
/// Leading `~` must become `"$HOME"` / `"$HOME/…"` because a single-quoted
/// `~/path` does not expand and creates a literal `~` directory
/// (e.g. `/home/user/~/path`).
fn remote_directory_assignment_rhs(remote_directory: &str) -> String {
    let trimmed = remote_directory.trim();

    if trimmed == "~" {
        return "\"$HOME\"".to_string();
    }

    if let Some(rest) = trimmed.strip_prefix("~/") {
        return format!("\"$HOME/{}\"", escape_double_quoted(rest));
    }

    quote_remote_shell_arg(trimmed)
}

fn validate_config(config: &RemoteSnifferConfig) -> Result<(), String> {
    if config.ssh_enabled {
        if config.ssh_host.trim().is_empty() {
            return Err("SSH host is required when Control over SSH is enabled".into());
        }

        if config.ssh_port == 0 {
            return Err("SSH port must be greater than 0".into());
        }
    }

    if config.remote_directory.trim().is_empty() {
        return Err("Install directory is required".into());
    }

    if config.remote_start_command.trim().is_empty() {
        return Err("Start command is required".into());
    }

    if config.port == 0 {
        return Err("Listen port must be greater than 0".into());
    }

    Ok(())
}

fn bind_host(config: &RemoteSnifferConfig) -> &str {
    let trimmed = config.bind_host.trim();
    if trimmed.is_empty() {
        "0.0.0.0"
    } else {
        trimmed
    }
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
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    match (stdout.is_empty(), stderr.is_empty()) {
        (true, true) => String::new(),
        (false, true) => stdout,
        (true, false) => stderr,
        (false, false) => format!("{stderr}\n{stdout}"),
    }
}

fn run_ssh(config: &RemoteSnifferConfig, remote_command: &str) -> Result<Output, String> {
    let mut args = ssh_base_args(config);
    args.push(remote_command.to_string());
    run_command("ssh", &args)
}

fn run_host_command(config: &RemoteSnifferConfig, command: &str) -> Result<Output, String> {
    if config.ssh_enabled {
        run_ssh(config, command)
    } else {
        run_command("bash", &["-c".into(), command.to_string()])
    }
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

fn suggested_sniffer_url(config: &RemoteSnifferConfig) -> String {
    if config.ssh_enabled {
        let host = config.ssh_host.trim();
        let hostname = host.rsplit_once('@').map(|(_, rest)| rest).unwrap_or(host);
        if !hostname.is_empty() {
            return format!("http://{hostname}:{}", config.port);
        }
    }

    let host = if bind_host(config) == "0.0.0.0" {
        "127.0.0.1"
    } else {
        bind_host(config)
    };
    format!("http://{host}:{}", config.port)
}

fn remote_launch_command(start_command: &str) -> &str {
    // `yarn start` historically hardcoded HOST=127.0.0.1, which would hide the
    // process from the LAN even after we export HOST=0.0.0.0. Launch Nitro
    // directly so listen address/port always come from the environment.
    if start_command == "yarn start" {
        "\"$NODE_BIN\" .output/server/index.mjs"
    } else {
        start_command
    }
}

fn remote_start_script(config: &RemoteSnifferConfig) -> String {
    let directory_rhs = remote_directory_assignment_rhs(config.remote_directory.trim());
    let start_command = remote_launch_command(config.remote_start_command.trim());
    let port = config.port;
    let host = bind_host(config);
    format!(
        "bash -lc {}",
        quote_remote_shell_arg(&format!(
            r#"set -euo pipefail
DIR={directory_rhs}
echo "Starting sniffer in $DIR on {host}:{port}"
cd "$DIR"
NODE_BIN=$(command -v node || true)
if [ -z "$NODE_BIN" ]; then
  echo "node was not found on PATH."
  exit 1
fi
export HOST={host} PORT={port} NITRO_HOST={host} NITRO_PORT={port}
export SNIFFER_HEALTH_URL=http://127.0.0.1:{port}/api/health
if test -f "$DIR/sniffer.pid"; then
  OLD_PID=$(cat "$DIR/sniffer.pid" || true)
  if [ -n "$OLD_PID" ]; then
    kill "$OLD_PID" >/dev/null 2>&1 || true
  fi
  rm -f "$DIR/sniffer.pid"
fi
if command -v fuser >/dev/null 2>&1; then fuser -k "${{PORT}}/tcp" >/dev/null 2>&1 || true; fi
sleep 0.4
: >"$DIR/sniffer.log"
nohup {start_command} >>"$DIR/sniffer.log" 2>&1 &
SNIFFER_PID=$!
disown "$SNIFFER_PID" >/dev/null 2>&1 || true
echo "$SNIFFER_PID" > "$DIR/sniffer.pid"
echo "Spawned pid $SNIFFER_PID"
i=0
while [ "$i" -lt 60 ]; do
  if "$NODE_BIN" -e "fetch(process.env.SNIFFER_HEALTH_URL).then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
            echo "Sniffer is ready on $SNIFFER_HEALTH_URL"
            set +e
            trap - EXIT ERR
            exit 0
  fi
  if ! kill -0 "$SNIFFER_PID" 2>/dev/null; then
    echo "Sniffer process $SNIFFER_PID exited before $SNIFFER_HEALTH_URL responded."
    if test -f "$DIR/sniffer.log"; then
      echo "Last lines of sniffer.log:"
      tail -n 40 "$DIR/sniffer.log" || true
    fi
    exit 1
  fi
  i=$((i + 1))
  sleep 0.5
done
echo "Sniffer did not become ready on $SNIFFER_HEALTH_URL within 30s."
if test -f "$DIR/sniffer.log"; then
  echo "Last lines of sniffer.log:"
  tail -n 40 "$DIR/sniffer.log" || true
fi
exit 1"#
        ))
    )
}

fn remote_stop_script(config: &RemoteSnifferConfig) -> String {
    let directory_rhs = remote_directory_assignment_rhs(config.remote_directory.trim());
    let port = config.port;
    format!(
        "bash -lc {}",
        quote_remote_shell_arg(&format!(
            r#"DIR={directory_rhs}
export PORT={port}
if test -f "$DIR/sniffer.pid"; then
  kill "$(cat "$DIR/sniffer.pid")" >/dev/null 2>&1 || true
  rm -f "$DIR/sniffer.pid"
fi
if command -v fuser >/dev/null 2>&1; then fuser -k "${{PORT}}/tcp" >/dev/null 2>&1 || true; fi"#
        ))
    )
}

fn remote_status_script(config: &RemoteSnifferConfig) -> String {
    let directory_rhs = remote_directory_assignment_rhs(config.remote_directory.trim());
    format!(
        "bash -lc {}",
        quote_remote_shell_arg(&format!(
            r#"DIR={directory_rhs}
RUNNING=0
if test -f "$DIR/sniffer.pid" && kill -0 "$(cat "$DIR/sniffer.pid")" 2>/dev/null; then
  RUNNING=1
fi
printf 'RUNNING=%s\n' "$RUNNING""#
        ))
    )
}

fn remote_log_tail_script(config: &RemoteSnifferConfig) -> String {
    let directory_rhs = remote_directory_assignment_rhs(config.remote_directory.trim());
    format!(
        "bash -lc {}",
        quote_remote_shell_arg(&format!(
            r#"DIR={directory_rhs}
if test -f "$DIR/sniffer.log"; then
  echo "Last lines of sniffer.log:"
  tail -n 40 "$DIR/sniffer.log" || true
else
  echo "sniffer.log was not created."
fi"#
        ))
    )
}

fn sniffer_log_tail(config: &RemoteSnifferConfig) -> String {
    match run_host_command(config, &remote_log_tail_script(config)) {
        Ok(output) => output_stderr_or_stdout(&output),
        Err(error) => error,
    }
}

fn with_sniffer_log(config: &RemoteSnifferConfig, message: String) -> String {
    let tail = sniffer_log_tail(config);
    if tail.is_empty() || message.contains(&tail) {
        message
    } else {
        format!("{message}\n{tail}")
    }
}

fn is_remote_sniffer_running(config: &RemoteSnifferConfig) -> Result<bool, String> {
    let output = run_host_command(config, &remote_status_script(config))?;
    if !output.status.success() {
        return Err(format!(
            "Unable to check remote sniffer status: {}",
            output_stderr_or_stdout(&output)
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout.lines().any(|line| line.trim() == "RUNNING=1"))
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

fn empty_check_result(messages: Vec<String>) -> RemoteSnifferCheckResult {
    RemoteSnifferCheckResult {
        ok: false,
        node_version: None,
        yarn_available: false,
        directory_writable: false,
        sources_present: false,
        build_present: false,
        installed_version: None,
        expected_version: None,
        version_match: true,
        messages,
    }
}

fn sniffer_version_matches(
    installed: Option<&str>,
    expected: Option<&str>,
    sources_present: bool,
    build_present: bool,
) -> bool {
    if !sources_present || !build_present {
        return true;
    }

    match (installed, expected) {
        (Some(installed), Some(expected)) => installed == expected,
        (None, Some(_)) => false,
        _ => true,
    }
}

fn read_package_json_version(path: &Path) -> Option<String> {
    let text = std::fs::read_to_string(path).ok()?;
    let value: serde_json::Value = serde_json::from_str(&text).ok()?;
    let version = value.get("version")?.as_str()?.trim();

    if version.is_empty() {
        None
    } else {
        Some(version.to_string())
    }
}

fn bundled_sniffer_version(app: &AppHandle) -> Option<String> {
    let root = bundled_sniffer_path(app).ok()?;
    read_package_json_version(&root.join("package.json"))
}

fn build_check_result(
    config: &RemoteSnifferConfig,
    expected_version: Option<String>,
) -> RemoteSnifferCheckResult {
    let mut messages = Vec::new();
    let mut node_version = None;
    let mut yarn_available = false;
    let mut directory_writable = false;
    let mut sources_present = false;
    let mut build_present = false;
    let mut installed_version = None;

    if let Err(error) = validate_config(config) {
        return empty_check_result(vec![error]);
    }

    let remote_directory = config.remote_directory.trim();
    let directory_rhs = remote_directory_assignment_rhs(remote_directory);

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
DIR={directory_rhs}
PARENT=$(dirname "$DIR")
DIR_OK=0
if mkdir -p "$PARENT" 2>/dev/null && mkdir -p "$DIR" 2>/dev/null && test -w "$DIR"; then
  DIR_OK=1
fi
SOURCES_OK=0
BUILD_OK=0
VERSION=
if test -f "$DIR/package.json"; then
  SOURCES_OK=1
  VERSION=$(node -p "require(process.argv[1]).version" "$DIR/package.json" 2>/dev/null || true)
fi
if test -f "$DIR/.output/server/index.mjs"; then
  BUILD_OK=1
fi
printf 'NODE=%s\n' "$NODE_VERSION"
printf 'YARN=%s\n' "$YARN_OK"
printf 'DIR=%s\n' "$DIR_OK"
printf 'SOURCES=%s\n' "$SOURCES_OK"
printf 'BUILD=%s\n' "$BUILD_OK"
printf 'VERSION=%s\n' "$VERSION"
"#
        ))
    );

    match run_host_command(config, &check_script) {
        Ok(output) => {
            if !output.status.success() {
                messages.push(format!(
                    "Host check failed: {}",
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
                    } else if let Some(value) = line.strip_prefix("SOURCES=") {
                        sources_present = value.trim() == "1";
                    } else if let Some(value) = line.strip_prefix("BUILD=") {
                        build_present = value.trim() == "1";
                    } else if let Some(value) = line.strip_prefix("VERSION=") {
                        let trimmed = value.trim();
                        if !trimmed.is_empty() {
                            installed_version = Some(trimmed.to_string());
                        }
                    }
                }
            }
        }
        Err(error) => {
            return empty_check_result(vec![error]);
        }
    }

    if messages.iter().any(|message| message.contains("Host check failed")) {
        return RemoteSnifferCheckResult {
            ok: false,
            node_version,
            yarn_available,
            directory_writable,
            sources_present,
            build_present,
            installed_version: installed_version.clone(),
            expected_version: expected_version.clone(),
            version_match: sniffer_version_matches(
                installed_version.as_deref(),
                expected_version.as_deref(),
                sources_present,
                build_present,
            ),
            messages,
        };
    }

    match &node_version {
        None => messages.push(format!(
            "Node.js was not found on the host. Install Node.js {MINIMUM_NODE_MAJOR} or newer (matching the sniffer .nvmrc), then try again. The app does not install Node automatically."
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
                    "Could not parse Node.js version ({version}). Install Node.js {MINIMUM_NODE_MAJOR} or newer."
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
        messages.push(format!("Install directory {remote_directory} is writable."));
    } else {
        messages.push(format!(
            "Cannot create or write to install directory {remote_directory}."
        ));
    }

    let version_match = sniffer_version_matches(
        installed_version.as_deref(),
        expected_version.as_deref(),
        sources_present,
        build_present,
    );

    if sources_present && build_present {
        match (&installed_version, &expected_version) {
            (Some(installed), Some(expected)) if installed == expected => {
                messages.push(format!("Sniffer {installed} is installed and built."));
            }
            (Some(installed), Some(expected)) => {
                messages.push(format!(
                    "Sniffer {installed} is installed; this app ships {expected}. Run Install to update."
                ));
            }
            (None, Some(expected)) => {
                messages.push(format!(
                    "Sniffer is installed but its version could not be read. This app ships {expected}. Run Install to update."
                ));
            }
            (Some(installed), None) => {
                messages.push(format!("Sniffer {installed} is installed and built."));
            }
            _ => {
                messages.push("Sniffer is installed and built.".into());
            }
        }
    } else if sources_present {
        messages.push(
            "Sniffer sources are present, but the build output is missing. Run Install / update."
                .into(),
        );
    } else {
        messages.push("Sniffer is not installed in that directory yet.".into());
    }

    let node_ok = node_version
        .as_deref()
        .and_then(parse_node_major)
        .is_some_and(|major| major >= MINIMUM_NODE_MAJOR);

    RemoteSnifferCheckResult {
        ok: node_ok && yarn_available && directory_writable && messages.iter().all(|m| !m.contains("Host check failed")),
        node_version,
        yarn_available,
        directory_writable,
        sources_present,
        build_present,
        installed_version,
        expected_version,
        version_match,
        messages,
    }
}

fn expand_install_path(directory: &str) -> PathBuf {
    let trimmed = directory.trim();
    let home = std::env::var("HOME").unwrap_or_default();

    if trimmed == "~" {
        return PathBuf::from(home);
    }

    if let Some(rest) = trimmed.strip_prefix("~/") {
        return PathBuf::from(home).join(rest);
    }

    PathBuf::from(trimmed)
}

fn should_skip_install_entry(name: &str) -> bool {
    matches!(
        name,
        "node_modules" | ".output" | ".git" | ".DS_Store" | "sniffer.pid" | "sniffer.log"
    )
}

fn copy_dir_all(src: &Path, dst: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dst).map_err(|error| format!("Unable to create {}: {error}", dst.display()))?;

    let entries = std::fs::read_dir(src).map_err(|error| format!("Unable to read {}: {error}", src.display()))?;

    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        let name = entry.file_name();
        let name_str = name.to_string_lossy();

        if should_skip_install_entry(&name_str) {
            continue;
        }

        let from = entry.path();
        let to = dst.join(&name);
        let file_type = entry
            .file_type()
            .map_err(|error| format!("Unable to stat {}: {error}", from.display()))?;

        if file_type.is_dir() {
            copy_dir_all(&from, &to)?;
        } else {
            std::fs::copy(&from, &to)
                .map_err(|error| format!("Unable to copy {} to {}: {error}", from.display(), to.display()))?;
        }
    }

    Ok(())
}

fn upload_bundled_sniffer(app: &AppHandle, config: &RemoteSnifferConfig) -> Result<(), String> {
    let local_path = bundled_sniffer_path(app)?;
    let install_directory = config.remote_directory.trim();
    let directory_rhs = remote_directory_assignment_rhs(install_directory);

    require_success(
        "Create install directory",
        run_host_command(
            config,
            &format!(
                "bash -lc {}",
                quote_remote_shell_arg(&format!("DIR={directory_rhs}; mkdir -p \"$DIR\""))
            ),
        )?,
    )?;

    if !config.ssh_enabled {
        return copy_dir_all(&local_path, &expand_install_path(install_directory));
    }

    // Prefer rsync when available; fall back to scp -r.
    // OpenSSH expands a leading ~ in scp/rsync destinations; keep that form.
    let remote_target = format!("{}:{}", config.ssh_host.trim(), install_directory);
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
    scp_args.push(format!("{}:{}/", config.ssh_host.trim(), install_directory));

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
    let directory_rhs = remote_directory_assignment_rhs(config.remote_directory.trim());
    let script = format!(
        "bash -lc {}",
        quote_remote_shell_arg(&format!(
            "set -euo pipefail; DIR={directory_rhs}; cd \"$DIR\"; if command -v corepack >/dev/null 2>&1; then corepack enable; fi; HUSKY=0 yarn install; yarn build"
        ))
    );

    require_success("yarn install/build", run_host_command(config, &script)?)?;
    Ok(())
}

fn install_remote_sniffer_inner(
    app: &AppHandle,
    config: &RemoteSnifferConfig,
) -> Result<RemoteSnifferCommandResult, String> {
    let check = build_check_result(config, bundled_sniffer_version(app));
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

    upload_bundled_sniffer(app, config)?;
    remote_install_and_build(config)?;

    Ok(RemoteSnifferCommandResult {
        ok: true,
        message: format!(
            "Copied bundled sniffer to {} and finished yarn install/build.",
            config.remote_directory.trim()
        ),
    })
}

fn start_script_reported_ready(output: &Output) -> bool {
    output_stderr_or_stdout(output).contains("Sniffer is ready")
}

fn started_sniffer_message(config: &RemoteSnifferConfig) -> String {
    format!(
        "Started sniffer on {}:{}. Radio → Sniffer uses {}.",
        bind_host(config),
        config.port,
        suggested_sniffer_url(config)
    )
}

fn start_remote_sniffer_inner(config: RemoteSnifferConfig) -> Result<RemoteSnifferCommandResult, String> {
    validate_config(&config)?;

    if is_remote_sniffer_running(&config)? {
        return Ok(RemoteSnifferCommandResult {
            ok: true,
            message: "Sniffer is already running.".into(),
        });
    }

    let check = build_check_result(&config, None);
    if !check.ok {
        return Ok(RemoteSnifferCommandResult {
            ok: false,
            message: check.messages.join(" "),
        });
    }

    let output = run_host_command(&config, &remote_start_script(&config))?;
    let running = is_remote_sniffer_running(&config).unwrap_or(false);

    if output.status.success() || start_script_reported_ready(&output) || running {
        return Ok(RemoteSnifferCommandResult {
            ok: true,
            message: started_sniffer_message(&config),
        });
    }

    let detail = output_stderr_or_stdout(&output);
    let message = if detail.is_empty() {
        "Start sniffer failed".to_string()
    } else {
        format!("Start sniffer failed: {detail}")
    };
    let message = with_sniffer_log(&config, message);
    let _ = run_host_command(&config, &remote_stop_script(&config));
    Ok(RemoteSnifferCommandResult {
        ok: false,
        message,
    })
}

fn stop_remote_sniffer_inner(config: RemoteSnifferConfig) -> Result<RemoteSnifferCommandResult, String> {
    validate_config(&config)?;
    let was_running = is_remote_sniffer_running(&config).unwrap_or(false);
    let _ = run_host_command(&config, &remote_stop_script(&config));

    Ok(RemoteSnifferCommandResult {
        ok: true,
        message: if was_running {
            "Stopped sniffer.".into()
        } else {
            "Sniffer is not running.".into()
        },
    })
}

#[tauri::command]
pub async fn check_remote_sniffer_host(
    app: AppHandle,
    config: RemoteSnifferConfig,
) -> Result<RemoteSnifferCheckResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let expected = bundled_sniffer_version(&app);
        build_check_result(&config, expected)
    })
        .await
        .map_err(|error| format!("Host check task failed: {error}"))
}

#[tauri::command]
pub async fn install_remote_sniffer(
    app: AppHandle,
    config: RemoteSnifferConfig,
) -> Result<RemoteSnifferCommandResult, String> {
    tauri::async_runtime::spawn_blocking(move || install_remote_sniffer_inner(&app, &config))
        .await
        .map_err(|error| format!("Install task failed: {error}"))?
}

#[tauri::command]
pub async fn start_remote_sniffer(
    config: RemoteSnifferConfig,
) -> Result<RemoteSnifferCommandResult, String> {
    tauri::async_runtime::spawn_blocking(move || start_remote_sniffer_inner(config))
        .await
        .map_err(|error| format!("Start task failed: {error}"))?
}

#[tauri::command]
pub async fn stop_remote_sniffer(
    config: RemoteSnifferConfig,
) -> Result<RemoteSnifferCommandResult, String> {
    tauri::async_runtime::spawn_blocking(move || stop_remote_sniffer_inner(config))
        .await
        .map_err(|error| format!("Stop task failed: {error}"))?
}

#[tauri::command]
pub async fn remote_sniffer_status(
    config: RemoteSnifferConfig,
) -> Result<RemoteSnifferStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        Ok(RemoteSnifferStatus {
            running: is_remote_sniffer_running(&config)?,
        })
    })
    .await
    .map_err(|error| format!("Status task failed: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::{
        parse_node_major, quote_remote_shell_arg, read_package_json_version, remote_directory_assignment_rhs,
        remote_launch_command, remote_start_script, remote_status_script, remote_stop_script, sniffer_version_matches,
        suggested_sniffer_url, RemoteSnifferConfig,
    };
    use std::path::PathBuf;

    fn sample_config() -> RemoteSnifferConfig {
        RemoteSnifferConfig {
            ssh_enabled: true,
            ssh_host: "pi@raspberrypi.local".into(),
            ssh_port: 22,
            remote_directory: "~/ham-radio-sniffer".into(),
            remote_start_command: "yarn start".into(),
            port: 3010,
            bind_host: "0.0.0.0".into(),
        }
    }

    #[test]
    fn start_script_binds_all_interfaces_and_detaches() {
        let script = remote_start_script(&sample_config());
        assert!(script.contains("HOST=0.0.0.0"));
        assert!(script.contains("NITRO_HOST=0.0.0.0"));
        assert!(script.contains("PORT=3010"));
        assert!(script.contains("nohup \"$NODE_BIN\" .output/server/index.mjs"));
        assert!(script.contains("SNIFFER_HEALTH_URL=http://127.0.0.1:3010/api/health"));
        assert!(script.contains("disown"));
        assert!(script.contains("Last lines of sniffer.log"));
        assert!(!script.contains("pkill"));
        assert!(!script.contains("-L"));
        assert!(!script.contains("HOST=127.0.0.1"));
        assert!(!script.contains("NITRO_HOST=127.0.0.1"));
    }

    #[test]
    fn start_script_can_bind_loopback_for_local_installs() {
        let mut config = sample_config();
        config.ssh_enabled = false;
        config.bind_host = "127.0.0.1".into();
        let script = remote_start_script(&config);
        assert!(script.contains("HOST=127.0.0.1"));
        assert!(script.contains("NITRO_HOST=127.0.0.1"));
        assert!(!script.contains("HOST=0.0.0.0"));
    }

    #[test]
    fn default_yarn_start_launches_nitro_directly() {
        assert_eq!(
            remote_launch_command("yarn start"),
            "\"$NODE_BIN\" .output/server/index.mjs"
        );
        assert_eq!(remote_launch_command("yarn dev"), "yarn dev");
    }

    #[test]
    fn suggested_url_uses_the_ssh_hostname_and_listen_port() {
        assert_eq!(
            suggested_sniffer_url(&sample_config()),
            "http://raspberrypi.local:3010"
        );
    }

    #[test]
    fn stop_script_kills_the_listen_port_and_pidfile() {
        let script = remote_stop_script(&sample_config());
        assert!(script.contains("fuser -k"));
        assert!(script.contains("sniffer.pid"));
        assert!(script.contains("3010"));
        assert!(!script.contains("pkill"));
    }

    #[test]
    fn status_script_uses_the_pidfile() {
        let script = remote_status_script(&sample_config());
        assert!(script.contains("sniffer.pid"));
        assert!(script.contains("RUNNING="));
        assert!(!script.contains("pgrep"));
        assert!(!script.contains("pkill"));
    }

    #[test]
    fn quotes_single_quotes_for_bash() {
        assert_eq!(
            quote_remote_shell_arg("/tmp/o'sniffer"),
            "'/tmp/o'\\''sniffer'"
        );
    }

    #[test]
    fn expands_home_prefix_for_remote_directory() {
        assert_eq!(remote_directory_assignment_rhs("~"), "\"$HOME\"");
        assert_eq!(
            remote_directory_assignment_rhs("~/ham-radio-sniffer"),
            "\"$HOME/ham-radio-sniffer\""
        );
        assert_eq!(
            remote_directory_assignment_rhs("/opt/sniffer"),
            "'/opt/sniffer'"
        );
    }

    #[test]
    fn parses_node_major_versions() {
        assert_eq!(parse_node_major("v26.10.0"), Some(26));
        assert_eq!(parse_node_major("v24.12.0"), Some(24));
        assert_eq!(parse_node_major("20.11.1"), Some(20));
        assert_eq!(parse_node_major("missing"), None);
    }

    #[test]
    fn version_match_is_skipped_until_the_sniffer_is_installed() {
        assert!(sniffer_version_matches(None, Some("0.2.0"), false, false));
        assert!(sniffer_version_matches(Some("0.1.0"), Some("0.2.0"), true, false));
        assert!(!sniffer_version_matches(Some("0.1.0"), Some("0.2.0"), true, true));
        assert!(sniffer_version_matches(Some("0.2.0"), Some("0.2.0"), true, true));
        assert!(!sniffer_version_matches(None, Some("0.2.0"), true, true));
    }

    #[test]
    fn reads_version_from_package_json() {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/ham-radio-sniffer/package.json");
        let version = read_package_json_version(&path).expect("bundled sniffer package.json");
        assert!(version.split('.').count() >= 3, "{version}");
    }
}
