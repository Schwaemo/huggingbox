use std::sync::{Arc, Mutex};
use std::process::Stdio;
use std::path::PathBuf;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use sysinfo::System;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, AsyncReadExt};

// ─── Managed State ────────────────────────────────────────────────────────────

pub struct ExecutionHandle {
    pub execution_pid: Arc<Mutex<Option<u32>>>,
    pub download_pid: Arc<Mutex<Option<u32>>>,
}

impl ExecutionHandle {
    pub fn new() -> Self {
        Self {
            execution_pid: Arc::new(Mutex::new(None)),
            download_pid: Arc::new(Mutex::new(None)),
        }
    }
}

// ─── Payload types ────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct SystemInfoPayload {
    total_ram: u64,
    available_ram: u64,
    gpu_name: Option<String>,
    gpu_vram: Option<u64>,
    os_name: String,
}

#[derive(Serialize)]
pub struct PythonInfo {
    path: String,
    version: String,
    ready: bool,
}

#[derive(Serialize, Clone)]
struct StreamPayload {
    text: String,
}

#[derive(Serialize, Clone)]
struct DonePayload {
    exit_code: i32,
}

#[derive(Serialize, Clone)]
struct DownloadStatsPayload {
    percent: f64,
    downloaded_bytes: u64,
    total_bytes: u64,
    speed_bps: f64,
    eta_seconds: Option<f64>,
    phase: String,
    files_done: usize,
    files_total: usize,
    filename: Option<String>,
}

#[derive(Deserialize)]
struct DownloadJsonLine {
    percent: f64,
    downloaded_bytes: u64,
    total_bytes: u64,
    speed_bps: f64,
    eta_seconds: Option<f64>,
    phase: String,
    files_done: usize,
    files_total: usize,
    filename: Option<String>,
}

#[derive(Serialize)]
struct CodeCacheRecord {
    code: String,
}

#[derive(Serialize)]
struct PythonBootstrapInfo {
    ready: bool,
    path: String,
    message: String,
}

#[derive(Serialize)]
struct DownloadedModelPayload {
    id: String,
    name: String,
    pipeline_tag: String,
    size_bytes: u64,
    last_used: String,
    storage_path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ModelEnvironmentPayload {
    model_id: String,
    python_path: String,
    size_bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GpuInfoPayload {
    id: String,
    name: String,
    vram_gb: Option<u64>,
    backend: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelDependencyProbeResult {
    missing_packages: Vec<String>,
    compatibility_error: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
struct AppSettingsPayload {
    // Kept for back-compat with old settings.json files; no longer used in UI
    #[serde(default)]
    claude_api_key: String,
    hf_token: String,
    model_storage_path: String,
    env_storage_path: String,
    preferred_device: String,
    selected_gpu_id: Option<String>,
    theme: String,
}

// ─── Helper: find Python executable ──────────────────────────────────────────

fn bundled_python_candidates(app: &AppHandle) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Ok(data_dir) = app.path().app_data_dir() {
        let py_root = data_dir.join("python");
        #[cfg(target_os = "windows")]
        {
            paths.push(py_root.join("python.exe"));
            paths.push(py_root.join("Scripts").join("python.exe"));
        }
        #[cfg(not(target_os = "windows"))]
        {
            paths.push(py_root.join("bin").join("python3"));
            paths.push(py_root.join("bin").join("python"));
        }
    }
    paths
}

fn app_python_root(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join("python"))
}

fn validate_model_id(model_id: &str) -> Result<(), String> {
    if model_id.trim().is_empty() {
        return Err("Model id is required.".to_string());
    }
    if model_id.contains("..") || model_id.contains('\\') || model_id.starts_with('/') {
        return Err("Invalid model id path.".to_string());
    }
    Ok(())
}

async fn find_python(app: &AppHandle) -> Result<String, String> {
    for candidate in bundled_python_candidates(app) {
        if !candidate.exists() {
            continue;
        }
        if let Ok(output) = tokio::process::Command::new(&candidate)
            .arg("--version")
            .output()
            .await
        {
            if output.status.success() {
                return Ok(candidate.to_string_lossy().to_string());
            }
        }
    }

    for candidate in ["python3", "python"] {
        if let Ok(output) = tokio::process::Command::new(candidate)
            .arg("--version")
            .output()
            .await
        {
            if output.status.success() {
                return Ok(candidate.to_string());
            }
        }
    }
    Err("Python not found. Install Python 3.11+ or bundle Python into the app data directory.".to_string())
}

/// Returns the directory that *contains* the `hf_auto_runner` package so it
/// can be prepended to PYTHONPATH. In a production bundle Tauri copies the
/// folder into the resource dir; during `tauri dev` the source tree itself is
/// used as a fallback.
fn hf_auto_runner_parent_dir(app: &AppHandle) -> Option<PathBuf> {
    // Production: Tauri puts bundled resources next to the binary.
    if let Ok(res_dir) = app.path().resource_dir() {
        let candidate = res_dir.join("hf_auto_runner");
        if candidate.is_dir() {
            // parent of hf_auto_runner/
            if let Some(parent) = candidate.parent() {
                return Some(parent.to_path_buf());
            }
        }
    }

    // Dev fallback: the source tree is two levels above src-tauri/
    // (i.e., the workspace root where hf_auto_runner/ lives).
    if let Ok(exe) = std::env::current_exe() {
        // During `tauri dev` the exe is at target/debug/huggingbox(.exe)
        // Walk up from the exe to find the workspace root containing hf_auto_runner.
        let mut dir = exe.as_path();
        for _ in 0..8 {
            if let Some(parent) = dir.parent() {
                if parent.join("hf_auto_runner").is_dir() {
                    return Some(parent.to_path_buf());
                }
                dir = parent;
            } else {
                break;
            }
        }
    }

    // Last resort: current working directory
    if let Ok(cwd) = std::env::current_dir() {
        if cwd.join("hf_auto_runner").is_dir() {
            return Some(cwd);
        }
    }

    None
}

fn model_venv_dir(app: &AppHandle, model_id: &str) -> Result<PathBuf, String> {
    validate_model_id(model_id)?;
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
    let mut dir = data_dir.join("venvs");
    for segment in model_id.split('/') {
        if !segment.trim().is_empty() {
            dir.push(segment.trim());
        }
    }
    Ok(dir)
}

fn model_venvs_root(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
    Ok(data_dir.join("venvs"))
}

fn venv_python_path(venv_dir: &PathBuf) -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        venv_dir.join("Scripts").join("python.exe")
    }
    #[cfg(not(target_os = "windows"))]
    {
        venv_dir.join("bin").join("python")
    }
}

async fn ensure_model_venv_python(app: &AppHandle, model_id: &str) -> Result<String, String> {
    let venv_dir = model_venv_dir(app, model_id)?;
    let python_path = venv_python_path(&venv_dir);

    if python_path.exists() {
        if let Ok(out) = tokio::process::Command::new(&python_path)
            .arg("--version")
            .output()
            .await
        {
            if out.status.success() {
                return Ok(python_path.to_string_lossy().to_string());
            }
        }
    }

    if let Some(parent) = venv_dir.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create venv parent directory: {}", e))?;
    }

    let base_python = find_python(app).await?;
    let create = tokio::process::Command::new(&base_python)
        .args(["-m", "venv", &venv_dir.to_string_lossy()])
        .output()
        .await
        .map_err(|e| format!("Failed to create model venv: {}", e))?;

    if !create.status.success() {
        let stderr = String::from_utf8_lossy(&create.stderr);
        return Err(format!("Failed to create model venv: {}", stderr.trim()));
    }

    if !python_path.exists() {
        return Err("Model venv was created but Python executable was not found.".to_string());
    }

    // Ensure pip is available in the venv before package checks/installs.
    let pip_ok = tokio::process::Command::new(&python_path)
        .args(["-m", "pip", "--version"])
        .output()
        .await
        .map(|o| o.status.success())
        .unwrap_or(false);
    if !pip_ok {
        let _ = tokio::process::Command::new(&python_path)
            .args(["-m", "ensurepip", "--upgrade"])
            .output()
            .await;
    }

    Ok(python_path.to_string_lossy().to_string())
}

async fn resolve_python(app: &AppHandle, model_id: Option<&str>) -> Result<String, String> {
    if let Some(id) = model_id {
        if !id.trim().is_empty() {
            return ensure_model_venv_python(app, id).await;
        }
    }
    find_python(app).await
}

/// Returns the root directory under which per-model venvs are stored.
/// Uses the user-configured path when non-empty; otherwise defaults to
/// `<app_data>/venvs`.
fn effective_venv_root(app: &AppHandle, custom_path: Option<&str>) -> Result<PathBuf, String> {
    if let Some(p) = custom_path {
        let trimmed = p.trim();
        if !trimmed.is_empty() {
            let path = PathBuf::from(expand_home_dir(trimmed));
            std::fs::create_dir_all(&path)
                .map_err(|e| format!("Failed to create env storage dir: {}", e))?;
            return Ok(path);
        }
    }
    // Default: AppData/venvs
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
    Ok(data_dir.join("venvs"))
}

fn model_dir_from_id(storage_path: &str, model_id: &str) -> PathBuf {
    let expanded = expand_home_dir(storage_path);
    let mut path = PathBuf::from(expanded);
    for segment in model_id.split('/') {
        path.push(segment);
    }
    path
}

fn compute_dir_size(path: &PathBuf) -> u64 {
    let mut total = 0_u64;
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if let Ok(meta) = std::fs::metadata(&p) {
                if meta.is_file() {
                    total = total.saturating_add(meta.len());
                } else if meta.is_dir() {
                    total = total.saturating_add(compute_dir_size(&p));
                }
            }
        }
    }
    total
}

fn discover_model_envs(root: &PathBuf, current: &PathBuf, acc: &mut Vec<ModelEnvironmentPayload>) {
    let marker = current.join("pyvenv.cfg");
    let python = venv_python_path(current);
    if marker.exists() && python.exists() {
        if let Ok(rel) = current.strip_prefix(root) {
            let model_id = rel
                .iter()
                .map(|s| s.to_string_lossy().to_string())
                .collect::<Vec<_>>()
                .join("/");
            let size_bytes = compute_dir_size(current);
            acc.push(ModelEnvironmentPayload {
                model_id,
                python_path: python.to_string_lossy().to_string(),
                size_bytes,
            });
        }
        return;
    }

    if let Ok(entries) = std::fs::read_dir(current) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                discover_model_envs(root, &p, acc);
            }
        }
    }
}

fn discover_models(root: &PathBuf, current: &PathBuf, acc: &mut Vec<DownloadedModelPayload>) {
    let marker = current.join(".huggingbox_complete");
    if marker.exists() {
        if let Ok(rel) = current.strip_prefix(root) {
            let id = rel
                .iter()
                .map(|s| s.to_string_lossy().to_string())
                .collect::<Vec<_>>()
                .join("/");
            let size_bytes = compute_dir_size(current);
            let last_used = std::fs::metadata(&marker)
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs().to_string())
                .unwrap_or_else(|| "unknown".to_string());
            acc.push(DownloadedModelPayload {
                id: id.clone(),
                name: id,
                pipeline_tag: "unknown".to_string(),
                size_bytes,
                last_used,
                storage_path: current.to_string_lossy().to_string(),
            });
        }
        return;
    }

    if let Ok(entries) = std::fs::read_dir(current) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                discover_models(root, &p, acc);
            }
        }
    }
}

fn expand_home_dir(input: &str) -> String {
    if let Some(rest) = input.strip_prefix("~/") {
        #[cfg(target_os = "windows")]
        {
            if let Ok(home) = std::env::var("USERPROFILE") {
                return format!("{}\\{}", home, rest.replace('/', "\\"));
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            if let Ok(home) = std::env::var("HOME") {
                return format!("{}/{}", home, rest);
            }
        }
    }
    input.to_string()
}

fn kill_pid(pid: u32, force: bool) {
    #[cfg(target_os = "windows")]
    {
        let mut args = vec!["/PID".to_string(), pid.to_string()];
        if force {
            args.insert(0, "/F".to_string());
        }
        let _ = std::process::Command::new("taskkill")
            .args(args)
            .output();
    }
    #[cfg(not(target_os = "windows"))]
    {
        let signal = if force { "-KILL" } else { "-TERM" };
        let _ = std::process::Command::new("kill")
            .args([signal, &pid.to_string()])
            .output();
    }
}

fn detect_gpu_windows() -> Option<(String, u64)> {
    #[cfg(target_os = "windows")]
    {
        // Prefer CUDA devices from nvidia-smi when available.
        if let Some(primary_cuda) = detect_cuda_gpus().into_iter().next() {
            return Some((primary_cuda.name, primary_cuda.vram_gb.unwrap_or(0)));
        }

        let output = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM | ConvertTo-Json -Compress",
            ])
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }

        let raw = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if raw.is_empty() {
            return None;
        }

        let value: serde_json::Value = serde_json::from_str(&raw).ok()?;
        let rows: Vec<serde_json::Value> = if value.is_array() {
            value.as_array()?.clone()
        } else {
            vec![value]
        };

        let is_virtual = |name: &str| {
            let lower = name.to_lowercase();
            lower.contains("virtual")
                || lower.contains("basic render")
                || lower.contains("remote display")
                || lower.contains("parsec")
        };

        let preferred = rows
            .iter()
            .find_map(|row| {
                let name = row.get("Name")?.as_str()?.to_string();
                if is_virtual(&name) {
                    return None;
                }
                let bytes = row.get("AdapterRAM").and_then(|v| v.as_u64()).unwrap_or(0);
                let vram_gb = if bytes > 0 {
                    (bytes / (1024_u64 * 1024_u64 * 1024_u64)).max(1)
                } else {
                    0
                };
                Some((name, vram_gb))
            });

        if preferred.is_some() {
            preferred
        } else {
            rows.first().and_then(|row| {
                let name = row.get("Name")?.as_str()?.to_string();
                let bytes = row.get("AdapterRAM").and_then(|v| v.as_u64()).unwrap_or(0);
                let vram_gb = if bytes > 0 {
                    (bytes / (1024_u64 * 1024_u64 * 1024_u64)).max(1)
                } else {
                    0
                };
                Some((name, vram_gb))
            })
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        None
    }
}

fn detect_cuda_gpus() -> Vec<GpuInfoPayload> {
    let output = std::process::Command::new("nvidia-smi")
        .args(["--query-gpu=index,name,memory.total", "--format=csv,noheader,nounits"])
        .output();

    let Ok(output) = output else {
        return vec![];
    };
    if !output.status.success() {
        return vec![];
    }

    let raw = String::from_utf8_lossy(&output.stdout);
    let mut gpus = Vec::new();
    for line in raw.lines() {
        let parts: Vec<&str> = line.split(',').map(|x| x.trim()).collect();
        if parts.len() < 2 {
            continue;
        }
        let id = parts[0].to_string();
        let name = parts[1].to_string();
        let vram_gb = parts
            .get(2)
            .and_then(|mb| mb.parse::<u64>().ok())
            .map(|mb| (mb / 1024).max(1));
        gpus.push(GpuInfoPayload {
            id,
            name,
            vram_gb,
            backend: "cuda".to_string(),
        });
    }
    gpus
}

fn ensure_temp_workspace(app: &AppHandle) -> Result<PathBuf, String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?
        .join("temp");
    std::fs::create_dir_all(&root).map_err(|e| format!("Failed to create temp workspace: {}", e))?;
    Ok(root)
}

fn cleanup_old_temp_scripts(app: &AppHandle) {
    if let Ok(root) = ensure_temp_workspace(app) {
        if let Ok(entries) = std::fs::read_dir(&root) {
            for entry in entries.flatten() {
                let path = entry.path();
                let name = path.file_name().and_then(|n| n.to_str()).unwrap_or_default();
                if name.starts_with("run_") && name.ends_with(".py") {
                    let _ = std::fs::remove_file(path);
                }
            }
        }
    }
}

fn get_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;

    std::fs::create_dir_all(&data_dir)
        .map_err(|e| format!("Failed to create app data dir: {}", e))?;

    Ok(data_dir.join("huggingbox.db"))
}

fn get_settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;

    std::fs::create_dir_all(&data_dir)
        .map_err(|e| format!("Failed to create app data dir: {}", e))?;

    Ok(data_dir.join("settings.json"))
}

fn init_db(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS code_cache(
            cache_key TEXT PRIMARY KEY,
            model_id TEXT NOT NULL,
            code TEXT NOT NULL,
            created_at TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| format!("Failed to init code_cache table: {}", e))?;

    Ok(())
}

// ─── Commands ─────────────────────────────────────────────────────────────────

#[tauri::command]
fn get_system_info() -> SystemInfoPayload {
    let mut sys = System::new_all();
    sys.refresh_all();

    let gpu = detect_gpu_windows();

    SystemInfoPayload {
        total_ram: sys.total_memory(),
        available_ram: sys.available_memory(),
        gpu_name: gpu.as_ref().map(|g| g.0.clone()),
        gpu_vram: gpu.as_ref().map(|g| g.1),
        os_name: System::long_os_version().unwrap_or_else(|| "Unknown OS".to_string()),
    }
}

#[tauri::command]
fn list_gpus() -> Vec<GpuInfoPayload> {
    let cuda = detect_cuda_gpus();
    if !cuda.is_empty() {
        return cuda;
    }

    #[cfg(target_os = "windows")]
    {
        let output = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM | ConvertTo-Json -Compress",
            ])
            .output();

        let Ok(output) = output else {
            return vec![];
        };
        if !output.status.success() {
            return vec![];
        }

        let raw = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if raw.is_empty() {
            return vec![];
        }

        let value: serde_json::Value = match serde_json::from_str(&raw) {
            Ok(v) => v,
            Err(_) => return vec![],
        };

        let rows: Vec<serde_json::Value> = if value.is_array() {
            value.as_array().cloned().unwrap_or_default()
        } else {
            vec![value]
        };

        return rows
            .into_iter()
            .enumerate()
            .filter_map(|(idx, row)| {
                let name = row.get("Name")?.as_str()?.to_string();
                let bytes = row.get("AdapterRAM").and_then(|v| v.as_u64()).unwrap_or(0);
                let vram_gb = if bytes > 0 {
                    Some((bytes / (1024_u64 * 1024_u64 * 1024_u64)).max(1))
                } else {
                    None
                };
                Some(GpuInfoPayload {
                    id: idx.to_string(),
                    name,
                    vram_gb,
                    backend: "display".to_string(),
                })
            })
            .collect();
    }

    #[cfg(not(target_os = "windows"))]
    {
        vec![]
    }
}

#[tauri::command]
fn load_app_settings(app: AppHandle) -> Result<Option<AppSettingsPayload>, String> {
    let path = get_settings_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }

    let raw = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read settings file: {}", e))?;
    let parsed = serde_json::from_str::<AppSettingsPayload>(&raw)
        .map_err(|e| format!("Failed to parse settings file: {}", e))?;
    Ok(Some(parsed))
}

#[tauri::command]
fn save_app_settings(app: AppHandle, settings: AppSettingsPayload) -> Result<(), String> {
    let path = get_settings_path(&app)?;
    let json = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    std::fs::write(&path, json).map_err(|e| format!("Failed to write settings file: {}", e))?;
    Ok(())
}

#[tauri::command]
async fn bootstrap_python_environment(app: AppHandle) -> Result<PythonBootstrapInfo, String> {
    if let Some(py_root) = app_python_root(&app) {
        std::fs::create_dir_all(&py_root)
            .map_err(|e| format!("Failed to create python environment root: {}", e))?;
    }

    match find_python(&app).await {
        Ok(path) => Ok(PythonBootstrapInfo {
            ready: true,
            path,
            message: "Python runtime available".to_string(),
        }),
        Err(msg) => Ok(PythonBootstrapInfo {
            ready: false,
            path: String::new(),
            message: msg,
        }),
    }
}

#[tauri::command]
async fn detect_python(app: AppHandle) -> PythonInfo {
    for candidate in bundled_python_candidates(&app) {
        if !candidate.exists() {
            continue;
        }
        if let Ok(output) = tokio::process::Command::new(&candidate)
            .arg("--version")
            .output()
            .await
        {
            if output.status.success() {
                let raw = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let version = if raw.is_empty() {
                    String::from_utf8_lossy(&output.stderr).trim().to_string()
                } else {
                    raw
                };
                return PythonInfo {
                    path: candidate.to_string_lossy().to_string(),
                    version,
                    ready: true,
                };
            }
        }
    }

    for candidate in ["python3", "python"] {
        if let Ok(output) = tokio::process::Command::new(candidate)
            .arg("--version")
            .output()
            .await
        {
            if output.status.success() {
                let raw = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let version = if raw.is_empty() {
                    String::from_utf8_lossy(&output.stderr).trim().to_string()
                } else {
                    raw
                };
                return PythonInfo { path: candidate.to_string(), version, ready: true };
            }
        }
    }
    PythonInfo { path: String::new(), version: String::new(), ready: false }
}

#[tauri::command]
async fn generate_python_code_local(app: AppHandle, model_id: String, hf_token: Option<String>) -> Result<String, String> {
    let python = find_python(&app).await?;
    let mut cmd = tokio::process::Command::new(&python);
    cmd.env("HB_DEBUG", "1");
    if let Some(pypath) = hf_auto_runner_parent_dir(&app) {
        cmd.env("PYTHONPATH", pypath.to_string_lossy().to_string());
    }
    // Set token as env var so inspector.py can pick it up
    if let Some(ref token) = hf_token {
        if !token.is_empty() {
            cmd.env("HF_TOKEN", token);
        }
    }
    let mut args = vec!["-m".to_string(), "hf_auto_runner".to_string(), "generate".to_string(), model_id.clone()];
    if let Some(ref token) = hf_token {
        if !token.is_empty() {
            args.push("--hf-token".to_string());
            args.push(token.clone());
        }
    }
    let output = cmd
        .args(&args)
        .output()
        .await
        .map_err(|e| format!("Failed to call python hf_auto_runner script logic: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        // It may fail but still print valid JSON; attach diagnostics when possible.
        if let Ok(mut value) = serde_json::from_str::<serde_json::Value>(stdout.trim()) {
            if let Some(obj) = value.as_object_mut() {
                if !stderr.trim().is_empty() {
                    obj.insert("stderr".to_string(), serde_json::Value::String(stderr.clone()));
                }
                obj.insert(
                    "exitCode".to_string(),
                    serde_json::Value::String(output.status.to_string()),
                );
            }
            return Ok(value.to_string());
        }
        return Err(format!(
            "Python hf_auto_runner failed.\nstatus: {}\nstderr:\n{}\nstdout:\n{}",
            output.status, stderr, stdout
        ));
    }

    // Validate that successful runs return valid JSON and include debug stderr context.
    let mut value = serde_json::from_str::<serde_json::Value>(stdout.trim()).map_err(|e| {
        format!(
            "hf_auto_runner returned non-JSON stdout.\nparse_error: {}\nstderr:\n{}\nstdout:\n{}",
            e, stderr, stdout
        )
    })?;

    if let Some(obj) = value.as_object_mut() {
        if !stderr.trim().is_empty() {
            obj.insert("debugStderr".to_string(), serde_json::Value::String(stderr));
        }
    }

    Ok(value.to_string())
}

#[tauri::command]
async fn run_python_code(
    app: AppHandle,
    handle: State<'_, ExecutionHandle>,
    preferred_device: Option<String>,
    selected_gpu_id: Option<String>,
    model_id: Option<String>,
    hf_token: Option<String>,
    user_input: Option<String>,
    env_storage_path: Option<String>,
) -> Result<(), String> {
    {
        let lock = handle.execution_pid.lock().unwrap();
        if lock.is_some() {
            return Err("An execution is already running. Stop it before starting another.".to_string());
        }
    }

    let python = resolve_python(&app, model_id.as_deref()).await?;

    let mut command = tokio::process::Command::new(&python);
    command
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUTF8", "1");

    // Ensure isolated venvs can find the hf_auto_runner package
    if let Some(pypath) = hf_auto_runner_parent_dir(&app) {
        command.env("PYTHONPATH", pypath.to_string_lossy().to_string());
    }

    // Set HB_VENV_DIR so the Python env_manager uses the same venv directory
    // that Tauri's resolve_python() created.
    if let Some(ref mid) = model_id {
        if !mid.trim().is_empty() {
            if let Ok(venv_root) = effective_venv_root(&app, env_storage_path.as_deref()) {
                let mut venv_dir = venv_root;
                for segment in mid.split('/') {
                    if !segment.trim().is_empty() {
                        venv_dir.push(segment.trim());
                    }
                }
                command.env("HB_VENV_DIR", venv_dir.to_string_lossy().to_string());
            }
        }
    }

    // Pass HF token as env var (belt-and-suspenders alongside CLI flag)
    if let Some(ref token) = hf_token {
        if !token.is_empty() {
            command.env("HF_TOKEN", token);
        }
    }

    // Pass user input as env var for the inference script
    if let Some(ref input) = user_input {
        if !input.is_empty() {
            command.env("HB_INPUT", input);
        }
    }

    let device = preferred_device.unwrap_or_else(|| "auto".to_string()).to_lowercase();
    if device == "cpu" {
        command.env("CUDA_VISIBLE_DEVICES", "-1");
    } else if let Some(gpu_id) = selected_gpu_id.as_deref() {
        let trimmed = gpu_id.trim();
        if !trimmed.is_empty() {
            command.env("CUDA_VISIBLE_DEVICES", trimmed);
        }
    }

    let model = model_id.unwrap_or_else(|| "".to_string());
    if model.is_empty() {
        return Err("Model ID is required for execution via hf_auto_runner.".to_string());
    }

    // Build CLI args: -m hf_auto_runner run <model> [--hf-token T] [--input I]
    let mut run_args = vec![
        "-m".to_string(), "hf_auto_runner".to_string(), "run".to_string(), model.clone()
    ];
    if let Some(ref token) = hf_token {
        if !token.is_empty() {
            run_args.push("--hf-token".to_string());
            run_args.push(token.clone());
        }
    }
    if let Some(ref input) = user_input {
        if !input.is_empty() {
            run_args.push("--input".to_string());
            run_args.push(input.clone());
        }
    }

    let mut child = command
        .args(&run_args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start Python: {}", e))?;

    // Store PID for cancellation
    let pid_arc = handle.execution_pid.clone();
    {
        let mut lock = pid_arc.lock().unwrap();
        *lock = child.id();
    }

    let stdout = child.stdout.take().ok_or("no stdout")?;
    let stderr = child.stderr.take().ok_or("no stderr")?;

    let app_clone = app.clone();

    // Detach all I/O + wait logic into a background task so the command returns immediately
    tokio::spawn(async move {
        let app_out = app_clone.clone();
        let app_err = app_clone.clone();
        let app_done = app_clone.clone();

        let t_stdout = tokio::spawn(async move {
            let mut reader = tokio::io::BufReader::new(stdout);
            let mut buf = [0u8; 1024];
            loop {
                match reader.read(&mut buf).await {
                    Ok(0) => break,
                    Ok(n) => {
                        let text = String::from_utf8_lossy(&buf[..n]).to_string();
                        let _ = app_out.emit("execution-stdout", StreamPayload { text });
                    }
                    Err(_) => break,
                }
            }
        });

        let t_stderr = tokio::spawn(async move {
            let mut reader = tokio::io::BufReader::new(stderr);
            let mut buf = [0u8; 1024];
            loop {
                match reader.read(&mut buf).await {
                    Ok(0) => break,
                    Ok(n) => {
                        let text = String::from_utf8_lossy(&buf[..n]).to_string();
                        let _ = app_err.emit("execution-stderr", StreamPayload { text });
                    }
                    Err(_) => break,
                }
            }
        });

        let exit_code = match child.wait().await {
            Ok(status) => status.code().unwrap_or(-1),
            Err(_) => -1,
        };

        // Drain remaining I/O
        let _ = tokio::join!(t_stdout, t_stderr);

        // Clear PID
        {
            let mut lock = pid_arc.lock().unwrap();
            *lock = None;
        }

        let _ = app_done.emit("execution-done", DonePayload { exit_code });
    });

    Ok(())
}

#[tauri::command]
fn cancel_execution(handle: State<'_, ExecutionHandle>) -> Result<(), String> {
    let pid = { *handle.execution_pid.lock().unwrap() };

    if let Some(pid) = pid {
        kill_pid(pid, false);
        std::thread::sleep(std::time::Duration::from_secs(3));
        let still_running = {
            #[cfg(target_os = "windows")]
            {
                std::process::Command::new("tasklist")
                    .args(["/FI", &format!("PID eq {}", pid)])
                    .output()
                    .ok()
                    .map(|o| String::from_utf8_lossy(&o.stdout).contains(&pid.to_string()))
                    .unwrap_or(false)
            }
            #[cfg(not(target_os = "windows"))]
            {
                std::process::Command::new("kill")
                    .args(["-0", &pid.to_string()])
                    .output()
                    .map(|o| o.status.success())
                    .unwrap_or(false)
            }
        };
        if still_running {
            kill_pid(pid, true);
        }
    }

    Ok(())
}

#[tauri::command]
fn is_model_downloaded(model_id: String, storage_path: String) -> Result<bool, String> {
    let model_dir = model_dir_from_id(&storage_path, &model_id);
    let marker = model_dir.join(".huggingbox_complete");
    Ok(marker.exists())
}

#[tauri::command]
async fn download_model(
    app: AppHandle,
    handle: State<'_, ExecutionHandle>,
    model_id: String,
    storage_path: String,
    hf_token: Option<String>,
) -> Result<(), String> {
    {
        let lock = handle.download_pid.lock().unwrap();
        if lock.is_some() {
            return Err("A model download is already in progress.".to_string());
        }
    }

    let python = resolve_python(&app, Some(&model_id)).await?;
    let model_dir = model_dir_from_id(&storage_path, &model_id);
    std::fs::create_dir_all(&model_dir).map_err(|e| format!("Failed to create model directory: {}", e))?;

    let script = r#"
import os
import sys
import time
import json

# Force Hugging Face Hub to use hf_transfer backend when available.
os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "1"

from huggingface_hub import HfApi, hf_hub_download

model_id = sys.argv[1]
target_dir = sys.argv[2]
token = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] else None

try:
    import hf_transfer  # noqa: F401
    print("[HuggingBox] HF Transfer enabled.", flush=True)
except Exception:
    print("[HuggingBox] HF Transfer module missing; falling back to standard downloader.", flush=True)

api = HfApi(token=token)
info = api.model_info(model_id)
files = []
total = 0
for s in info.siblings:
    name = getattr(s, "rfilename", None)
    if not name:
        continue
    size = getattr(s, "size", None) or 0
    files.append((name, int(size)))
    total += int(size)

downloaded = 0
files_done = 0
files_total = len(files)
start = time.time()

def emit(phase, filename=None):
    elapsed = max(0.001, time.time() - start)
    speed = downloaded / elapsed
    remaining = max(0, total - downloaded)
    eta = (remaining / speed) if speed > 0 else None
    if total > 0:
        pct = (downloaded / total * 100.0)
    elif files_total > 0:
        pct = (files_done / files_total * 100.0)
    else:
        pct = 0.0
    payload = {
        "percent": pct,
        "downloaded_bytes": downloaded,
        "total_bytes": total,
        "speed_bps": speed,
        "eta_seconds": eta,
        "phase": phase,
        "files_done": files_done,
        "files_total": files_total,
        "filename": filename,
    }
    print("HB_DOWNLOAD_JSON:" + json.dumps(payload), flush=True)

print(f"[HuggingBox] Downloading {model_id} into {target_dir}", flush=True)
emit("starting")
for (filename, size) in files:
    hf_hub_download(
        repo_id=model_id,
        filename=filename,
        token=token,
        local_dir=target_dir,
    )
    files_done += 1
    downloaded += max(0, size)
    emit("downloading", filename)

marker = os.path.join(target_dir, ".huggingbox_complete")
with open(marker, "w", encoding="utf-8") as f:
    f.write(str(time.time()))
emit("complete")
print("[HuggingBox] Download complete.", flush=True)
"#;

    let script_path = std::env::temp_dir().join("huggingbox_download.py");
    std::fs::write(&script_path, script).map_err(|e| e.to_string())?;

    let token = hf_token.unwrap_or_default();
    let mut child = tokio::process::Command::new(&python)
        .arg(script_path.to_str().ok_or("invalid path")?)
        .arg(model_id.clone())
        .arg(model_dir.to_string_lossy().to_string())
        .arg(token)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start model download: {}", e))?;

    let pid_arc = handle.download_pid.clone();
    {
        let mut lock = pid_arc.lock().unwrap();
        *lock = child.id();
    }

    let stdout = child.stdout.take().ok_or("no stdout")?;
    let stderr = child.stderr.take().ok_or("no stderr")?;
    let app2 = app.clone();

    let t1 = tokio::spawn(async move {
        let mut lines = tokio::io::BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if let Some(json_part) = line.strip_prefix("HB_DOWNLOAD_JSON:") {
                if let Ok(stats) = serde_json::from_str::<DownloadJsonLine>(json_part) {
                    let _ = app.emit("download-stats", DownloadStatsPayload {
                        percent: stats.percent,
                        downloaded_bytes: stats.downloaded_bytes,
                        total_bytes: stats.total_bytes,
                        speed_bps: stats.speed_bps,
                        eta_seconds: stats.eta_seconds,
                        phase: stats.phase,
                        files_done: stats.files_done,
                        files_total: stats.files_total,
                        filename: stats.filename,
                    });
                }
            } else {
                let _ = app.emit("download-progress", StreamPayload { text: line + "\n" });
            }
        }
    });

    let t2 = tokio::spawn(async move {
        let mut lines = tokio::io::BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = app2.emit("download-progress", StreamPayload { text: line + "\n" });
        }
    });

    let status = child.wait().await.map_err(|e| e.to_string())?;
    let _ = tokio::join!(t1, t2);

    {
        let mut lock = pid_arc.lock().unwrap();
        *lock = None;
    }

    if status.success() {
        Ok(())
    } else {
        Err("Model download failed. You can retry to resume partial files.".to_string())
    }
}

#[tauri::command]
fn cancel_download(handle: State<'_, ExecutionHandle>) -> Result<(), String> {
    let pid = { *handle.download_pid.lock().unwrap() };
    if let Some(pid) = pid {
        kill_pid(pid, false);
        std::thread::sleep(std::time::Duration::from_secs(3));
        kill_pid(pid, true);
    }
    Ok(())
}

#[tauri::command]
fn list_downloaded_models(storage_path: String) -> Result<Vec<DownloadedModelPayload>, String> {
    let root = PathBuf::from(expand_home_dir(&storage_path));
    if !root.exists() {
        return Ok(vec![]);
    }
    let mut models = Vec::new();
    discover_models(&root, &root, &mut models);
    Ok(models)
}

#[tauri::command]
fn list_model_environments(app: AppHandle) -> Result<Vec<ModelEnvironmentPayload>, String> {
    let root = model_venvs_root(&app)?;
    if !root.exists() {
        return Ok(vec![]);
    }
    let mut envs = Vec::new();
    discover_model_envs(&root, &root, &mut envs);
    envs.sort_by(|a, b| a.model_id.cmp(&b.model_id));
    Ok(envs)
}

#[tauri::command]
fn delete_model_environment(app: AppHandle, model_id: String) -> Result<(), String> {
    let dir = model_venv_dir(&app, &model_id)?;
    if !dir.exists() {
        return Ok(());
    }
    std::fs::remove_dir_all(&dir)
        .map_err(|e| format!("Failed to remove model environment: {}", e))?;
    Ok(())
}

#[tauri::command]
async fn check_packages(
    app: AppHandle,
    packages: Vec<String>,
    model_id: Option<String>,
) -> Result<Vec<String>, String> {
    let python = resolve_python(&app, model_id.as_deref()).await?;
    let mut missing = Vec::new();

    for pkg in &packages {
        let result = tokio::process::Command::new(&python)
            .args(["-c", &format!("import {}", pkg)])
            .output()
            .await
            .map_err(|e| e.to_string())?;

        if !result.status.success() {
            missing.push(pkg.clone());
        }
    }

    Ok(missing)
}

#[tauri::command]
async fn probe_model_dependencies(
    app: AppHandle,
    model_id: String,
    hf_token: Option<String>,
) -> Result<ModelDependencyProbeResult, String> {
    let python = resolve_python(&app, Some(&model_id)).await?;
    let script = r#"
import json
import re
import sys
from transformers import AutoConfig, AutoModel

model_id = sys.argv[1]
token = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] else None

def call_with_token(fn, *args, **kwargs):
    if token:
        try:
            return fn(*args, token=token, **kwargs)
        except TypeError:
            return fn(*args, use_auth_token=token, **kwargs)
    return fn(*args, **kwargs)

def extract_missing_packages(text: str):
    found = set()
    stop_words = {
        "run", "pip", "pip3", "install", "python", "-m", "m"
    }

    def normalize_pkg(raw: str):
        pkg = (raw or "").strip().strip("`'\".,:;()[]{}")
        if not pkg:
            return None
        if pkg.startswith("-"):
            return None
        if pkg.lower() in stop_words:
            return None
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", pkg):
            return None
        return pkg

    pattern = re.compile(
        r"requires the following packages that were not found in your environment:\s*([^\n]+)",
        re.IGNORECASE,
    )
    for match in pattern.findall(text or ""):
        pip_match = re.search(r"(?:pip|pip3)\s+install\s+([^\n\r`]+)", match, flags=re.IGNORECASE)
        if pip_match:
            for raw in re.split(r"[,\s]+", pip_match.group(1)):
                pkg = normalize_pkg(raw)
                if pkg:
                    found.add(pkg)
            continue
        for raw in re.split(r"[,\s]+", match):
            pkg = normalize_pkg(raw)
            if pkg:
                found.add(pkg)

    for match in re.findall(r"(?:pip|pip3)\s+install\s+([^\n\r]+)", text or "", flags=re.IGNORECASE):
        for raw in re.split(r"[,\s]+", match):
            pkg = normalize_pkg(raw)
            if pkg:
                found.add(pkg)

    return sorted(found)

compatibility_error = None
try:
    cfg = call_with_token(AutoConfig.from_pretrained, model_id, trust_remote_code=True)
    call_with_token(AutoModel.from_config, cfg, trust_remote_code=True)
    missing = []
except Exception as err:
    err_text = str(err)
    missing = extract_missing_packages(err_text)
    lower = err_text.lower()
    if not missing and "cannot import name" in lower and "transformers.models" in lower:
        compatibility_error = (
            "This model's custom code is incompatible with your installed transformers version. "
            "Try upgrading transformers first (python -m pip install -U transformers). "
            "If that still fails, the model likely requires a specific transformers version."
        )
    elif not missing and "sigalrm" in lower and "trust_remote_code" in lower:
        compatibility_error = (
            "Windows trust_remote_code prompt failed. Regenerate code and ensure trust_remote_code=True is used."
        )

print("HB_PROBE_JSON:" + json.dumps({
    "missingPackages": missing,
    "compatibilityError": compatibility_error,
}), flush=True)
"#;

    let script_path = std::env::temp_dir().join("huggingbox_probe_deps.py");
    std::fs::write(&script_path, script).map_err(|e| e.to_string())?;

    let token = hf_token.unwrap_or_default();
    let output = tokio::process::Command::new(&python)
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUTF8", "1")
        .arg(script_path.to_string_lossy().to_string())
        .arg(model_id)
        .arg(token)
        .output()
        .await
        .map_err(|e| format!("Failed to run dependency probe: {}", e))?;

    let _ = std::fs::remove_file(&script_path);
    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        if let Some(raw) = line.strip_prefix("HB_PROBE_JSON:") {
            let parsed = serde_json::from_str::<ModelDependencyProbeResult>(raw)
                .map_err(|e| format!("Failed to parse dependency probe result: {}", e))?;
            return Ok(parsed);
        }
    }

    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    if output.status.success() {
        Ok(ModelDependencyProbeResult {
            missing_packages: vec![],
            compatibility_error: None,
        })
    } else {
        Err(format!("Dependency probe failed: {}", stderr))
    }
}

fn requirement_name(requirement: &str) -> String {
    let mut end = requirement.len();
    for (idx, ch) in requirement.char_indices() {
        if ['<', '>', '=', '!', '~', '[', ';', ' '].contains(&ch) {
            end = idx;
            break;
        }
    }
    requirement[..end].trim().to_lowercase()
}

async fn run_pip_install_with_progress(
    app: &AppHandle,
    python: &str,
    args: Vec<String>,
) -> Result<(), String> {
    let mut child = tokio::process::Command::new(python)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();
    let app2 = app.clone();
    let app_out = app.clone();

    let t1 = tokio::spawn(async move {
        let mut lines = tokio::io::BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = app_out.emit("install-progress", StreamPayload { text: line + "\n" });
        }
    });

    let t2 = tokio::spawn(async move {
        let mut lines = tokio::io::BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = app2.emit("install-progress", StreamPayload { text: line + "\n" });
        }
    });

    let status = child.wait().await.map_err(|e| e.to_string())?;
    let _ = tokio::join!(t1, t2);
    if status.success() {
        Ok(())
    } else {
        Err("Package installation failed".to_string())
    }
}

#[tauri::command]
async fn install_packages(
    app: AppHandle,
    packages: Vec<String>,
    model_id: Option<String>,
) -> Result<(), String> {
    let python = resolve_python(&app, model_id.as_deref()).await?;
    let mut torch_family = Vec::new();
    let mut other_packages = Vec::new();
    for pkg in packages {
        let name = requirement_name(&pkg);
        if name == "torch" || name == "torchvision" || name == "torchaudio" {
            torch_family.push(pkg);
        } else {
            other_packages.push(pkg);
        }
    }

    let has_cuda_gpu = !detect_cuda_gpus().is_empty();
    if has_cuda_gpu && !torch_family.is_empty() {
        let _ = app.emit("install-progress", StreamPayload {
            text: "[HuggingBox] CUDA GPU detected. Preferring CUDA PyTorch wheels.\n".to_string(),
        });
        let mut cuda_args = vec![
            "-m".to_string(),
            "pip".to_string(),
            "install".to_string(),
            "--index-url".to_string(),
            "https://download.pytorch.org/whl/cu124".to_string(),
        ];
        cuda_args.extend(torch_family.clone());

        if run_pip_install_with_progress(&app, &python, cuda_args).await.is_err() {
            let _ = app.emit("install-progress", StreamPayload {
                text: "[HuggingBox] CUDA wheel install failed. Falling back to default PyPI packages.\n".to_string(),
            });
            let mut fallback_args = vec!["-m".to_string(), "pip".to_string(), "install".to_string()];
            fallback_args.extend(torch_family);
            run_pip_install_with_progress(&app, &python, fallback_args).await?;
        }
    } else if !torch_family.is_empty() {
        let mut args = vec!["-m".to_string(), "pip".to_string(), "install".to_string()];
        args.extend(torch_family);
        run_pip_install_with_progress(&app, &python, args).await?;
    }

    if !other_packages.is_empty() {
        let mut args = vec!["-m".to_string(), "pip".to_string(), "install".to_string()];
        args.extend(other_packages);
        run_pip_install_with_progress(&app, &python, args).await?;
    }

    Ok(())
}

#[tauri::command]
fn get_cached_code(
    app: AppHandle,
    cache_key: String,
) -> Result<Option<CodeCacheRecord>, String> {
    let db_path = get_db_path(&app)?;
    let conn = Connection::open(db_path).map_err(|e| format!("DB open failed: {}", e))?;
    init_db(&conn)?;

    let mut stmt = conn
        .prepare("SELECT code FROM code_cache WHERE cache_key = ?1")
        .map_err(|e| format!("DB query prepare failed: {}", e))?;

    let mut rows = stmt
        .query(params![cache_key])
        .map_err(|e| format!("DB query failed: {}", e))?;

    if let Some(row) = rows.next().map_err(|e| format!("DB row read failed: {}", e))? {
        let code: String = row.get(0).map_err(|e| format!("DB value read failed: {}", e))?;
        Ok(Some(CodeCacheRecord { code }))
    } else {
        Ok(None)
    }
}

#[tauri::command]
fn upsert_cached_code(
    app: AppHandle,
    cache_key: String,
    model_id: String,
    code: String,
) -> Result<(), String> {
    let db_path = get_db_path(&app)?;
    let conn = Connection::open(db_path).map_err(|e| format!("DB open failed: {}", e))?;
    init_db(&conn)?;

    conn.execute(
        "INSERT INTO code_cache(cache_key, model_id, code, created_at)
         VALUES(?1, ?2, ?3, datetime('now'))
         ON CONFLICT(cache_key)
         DO UPDATE SET
           model_id = excluded.model_id,
           code = excluded.code,
           created_at = datetime('now')",
        params![cache_key, model_id, code],
    )
    .map_err(|e| format!("DB upsert failed: {}", e))?;

    Ok(())
}

// ─── Entry point ─────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Best-effort startup cleanup for stale temp scripts.
    // Any active process from a prior session would have exited with the app.
    // This keeps app_data/temp tidy.
    // Failures here should not block app startup.
    // Intentionally ignored.
    // cleanup_old_temp_scripts requires app handle, so we call it via setup below.
    tauri::Builder::default()
        .manage(ExecutionHandle::new())
        .setup(|app| {
            cleanup_old_temp_scripts(app.handle());
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            load_app_settings,
            save_app_settings,
            get_system_info,
            list_gpus,
            bootstrap_python_environment,
            detect_python,
            generate_python_code_local,
            run_python_code,
            cancel_execution,
            is_model_downloaded,
            download_model,
            cancel_download,
            list_downloaded_models,
            list_model_environments,
            delete_model_environment,
            check_packages,
            probe_model_dependencies,
            install_packages,
            get_cached_code,
            upsert_cached_code,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
