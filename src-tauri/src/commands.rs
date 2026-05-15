use serde::Serialize;
use std::path::PathBuf;
use tauri::State;

use crate::app_config::AppConfig;
use crate::capture::{
    capture_thumbnail as cap_capture_thumbnail, list_monitors as cap_list_monitors, MonitorInfo,
    Region, Thumbnail,
};
use crate::paths;
use crate::recorder::{Recorder, RecorderStatus};
use crate::session::Session;

#[derive(Debug, Serialize)]
pub struct VirtualDesktopBounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Serialize)]
pub struct RecordingEntry {
    pub date: String,
    pub meeting_name: String,
    pub dir: String,
    pub count: u32,
    pub status: &'static str, // "in_progress" | "completed"
    pub created_at: Option<String>,
}

pub struct AppState {
    pub recorder: Recorder,
}

fn to_err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

#[tauri::command]
pub fn list_monitors() -> Result<Vec<MonitorInfo>, String> {
    cap_list_monitors().map_err(to_err)
}

#[tauri::command]
pub fn virtual_desktop_bounds() -> Result<VirtualDesktopBounds, String> {
    let monitors = cap_list_monitors().map_err(to_err)?;
    if monitors.is_empty() {
        return Err("No monitors detected".to_string());
    }
    let mut min_x = i32::MAX;
    let mut min_y = i32::MAX;
    let mut max_right = i32::MIN;
    let mut max_bottom = i32::MIN;
    for m in &monitors {
        let scale = m.scale_factor.max(0.01);
        // Convert physical width/height to logical for layout coords.
        let logical_w = (m.width as f32 / scale).round() as i32;
        let logical_h = (m.height as f32 / scale).round() as i32;
        min_x = min_x.min(m.x);
        min_y = min_y.min(m.y);
        max_right = max_right.max(m.x + logical_w);
        max_bottom = max_bottom.max(m.y + logical_h);
    }
    Ok(VirtualDesktopBounds {
        x: min_x,
        y: min_y,
        width: (max_right - min_x).max(1) as u32,
        height: (max_bottom - min_y).max(1) as u32,
    })
}

#[tauri::command]
pub fn list_recordings() -> Result<Vec<RecordingEntry>, String> {
    let root = paths::root_dir().map_err(to_err)?;
    if !root.exists() {
        return Ok(vec![]);
    }
    let active_session = Session::load().map_err(to_err)?;
    let mut entries: Vec<RecordingEntry> = Vec::new();

    for date_entry in std::fs::read_dir(&root).map_err(to_err)? {
        let date_entry = match date_entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let date_name = date_entry.file_name();
        let date_name = date_name.to_string_lossy().into_owned();
        if date_name.starts_with('.') {
            continue;
        }
        let date_path = date_entry.path();
        if !date_path.is_dir() {
            continue;
        }
        for meeting in std::fs::read_dir(&date_path).map_err(to_err)? {
            let meeting = match meeting {
                Ok(m) => m,
                Err(_) => continue,
            };
            let meeting_name = meeting.file_name();
            let meeting_name = meeting_name.to_string_lossy().into_owned();
            let meeting_path = meeting.path();
            if !meeting_path.is_dir() {
                continue;
            }
            let mut count = 0u32;
            for f in std::fs::read_dir(&meeting_path).map_err(to_err)? {
                if let Ok(f) = f {
                    let fname = f.file_name();
                    let s = fname.to_string_lossy();
                    if s.ends_with(".png") && !s.starts_with('.') {
                        count += 1;
                    }
                }
            }
            let is_active = active_session
                .as_ref()
                .map(|s| s.date == date_name && s.meeting_name == meeting_name)
                .unwrap_or(false);
            let created_at = std::fs::metadata(&meeting_path)
                .ok()
                .and_then(|m| m.created().ok())
                .and_then(|t| {
                    let dt: chrono::DateTime<chrono::Local> = t.into();
                    Some(dt.to_rfc3339())
                });
            entries.push(RecordingEntry {
                date: date_name.clone(),
                meeting_name,
                dir: meeting_path.to_string_lossy().into_owned(),
                count,
                status: if is_active { "in_progress" } else { "completed" },
                created_at,
            });
        }
    }
    // Newest first (by date desc, then by created_at desc).
    entries.sort_by(|a, b| {
        b.date
            .cmp(&a.date)
            .then(b.created_at.cmp(&a.created_at))
    });
    Ok(entries)
}

#[tauri::command]
pub fn delete_recording(dir: String) -> Result<(), String> {
    let path = PathBuf::from(&dir);
    let root = paths::root_dir().map_err(to_err)?;
    // Safety: only allow deletion inside the effective root.
    if !path.starts_with(&root) {
        return Err("路径不在录制目录内".to_string());
    }
    if path.exists() {
        std::fs::remove_dir_all(&path).map_err(to_err)?;
        // Clean up empty date dir.
        if let Some(parent) = path.parent() {
            if parent.starts_with(&root) && parent != root {
                let _ = std::fs::remove_dir(parent);
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn validate_meeting_name(name: String) -> Result<(), String> {
    paths::validate_meeting_name(&name).map_err(to_err)
}

#[tauri::command]
pub async fn start_recording(
    state: State<'_, AppState>,
    meeting_name: String,
    region: Region,
) -> Result<RecorderStatus, String> {
    state.recorder.start(meeting_name, region).map_err(to_err)
}

#[tauri::command]
pub async fn capture_one(
    state: State<'_, AppState>,
) -> Result<RecorderStatus, String> {
    state.recorder.capture_one().await.map_err(to_err)
}

#[tauri::command]
pub fn set_dock_icon(state: String, app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let s = state;
        let _ = app.run_on_main_thread(move || {
            crate::set_dock_icon_state(&s);
        });
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (state, app);
    }
    Ok(())
}

#[tauri::command]
pub async fn capture_thumbnail(region: Region, max_dim: u32) -> Result<Thumbnail, String> {
    tokio::task::spawn_blocking(move || cap_capture_thumbnail(&region, max_dim))
        .await
        .map_err(to_err)?
        .map_err(to_err)
}

#[tauri::command]
pub async fn stop_recording(state: State<'_, AppState>) -> Result<RecorderStatus, String> {
    state.recorder.stop().map_err(to_err)
}

#[tauri::command]
pub async fn finalize_recording(state: State<'_, AppState>) -> Result<(), String> {
    state.recorder.finalize().map_err(to_err)
}

#[tauri::command]
pub fn recorder_status(state: State<'_, AppState>) -> RecorderStatus {
    state.recorder.status()
}

/// Returns a resumable session if one exists on disk.
#[tauri::command]
pub fn check_resumable() -> Result<Option<Session>, String> {
    Session::load().map_err(to_err)
}

#[tauri::command]
pub async fn resume_session(state: State<'_, AppState>) -> Result<RecorderStatus, String> {
    let session = Session::load()
        .map_err(to_err)?
        .ok_or_else(|| "没有可恢复的会话".to_string())?;
    state.recorder.resume(session).map_err(to_err)
}

#[tauri::command]
pub fn discard_session() -> Result<(), String> {
    // Delete the recording directory and the persistence file.
    if let Some(session) = Session::load().map_err(to_err)? {
        if let Ok(dir) = session.dir() {
            if dir.exists() {
                std::fs::remove_dir_all(&dir).map_err(to_err)?;
                if let Some(parent) = dir.parent() {
                    let _ = std::fs::remove_dir(parent); // remove date dir if empty
                }
            }
        }
    }
    Session::clear().map_err(to_err)
}

/// End an interrupted session: load it into the recorder (Idle state) so the
/// user can proceed to Review. The persistence file stays until "完成".
#[tauri::command]
pub async fn end_session(state: State<'_, AppState>) -> Result<RecorderStatus, String> {
    let session = Session::load()
        .map_err(to_err)?
        .ok_or_else(|| "没有可恢复的会话".to_string())?;
    state.recorder.adopt_for_review(session).map_err(to_err)
}

#[derive(Debug, Serialize)]
pub struct ScreenshotInfo {
    pub seq: u32,
    pub filename: String,
    pub path: String,
}

#[tauri::command]
pub fn list_screenshots(dir: String) -> Result<Vec<ScreenshotInfo>, String> {
    let path = PathBuf::from(&dir);
    if !path.exists() {
        return Ok(vec![]);
    }
    let mut entries: Vec<(String, String)> = Vec::new();
    for entry in std::fs::read_dir(&path).map_err(to_err)? {
        let entry = entry.map_err(to_err)?;
        let name = entry.file_name();
        let name = name.to_string_lossy().into_owned();
        if !name.ends_with(".png") || name.starts_with('.') {
            continue;
        }
        entries.push((name, entry.path().to_string_lossy().into_owned()));
    }
    // Filenames are either zero-padded numbers (old) or `YYYY_MM_DD_HH_MM_SS` —
    // both sort chronologically as strings.
    entries.sort_by(|a, b| a.0.cmp(&b.0));
    let out = entries
        .into_iter()
        .enumerate()
        .map(|(i, (filename, path))| ScreenshotInfo {
            seq: (i + 1) as u32,
            filename,
            path,
        })
        .collect();
    Ok(out)
}

#[tauri::command]
pub fn delete_screenshots(paths: Vec<String>) -> Result<u32, String> {
    let mut count = 0;
    for p in paths {
        let path = PathBuf::from(&p);
        if path.exists() {
            std::fs::remove_file(&path).map_err(to_err)?;
            count += 1;
        }
    }
    Ok(count)
}

#[derive(Debug, Serialize)]
pub struct OutputRootInfo {
    /// The effective root directory (custom if set, else default).
    pub effective: String,
    /// The platform default.
    pub default: String,
    /// True if the user has chosen a custom path.
    pub is_custom: bool,
}

#[tauri::command]
pub fn get_output_root() -> Result<OutputRootInfo, String> {
    let cfg = AppConfig::load();
    let default = paths::default_root_dir()
        .map_err(to_err)?
        .to_string_lossy()
        .into_owned();
    let (effective, is_custom) = match cfg.output_root.as_deref() {
        Some(s) if !s.is_empty() => (s.to_string(), true),
        _ => (default.clone(), false),
    };
    Ok(OutputRootInfo {
        effective,
        default,
        is_custom,
    })
}

/// Update the user-chosen output root. Pass `None` to reset to default.
#[tauri::command]
pub fn set_output_root(path: Option<String>) -> Result<OutputRootInfo, String> {
    let mut cfg = AppConfig::load();
    let normalized = path.and_then(|s| if s.trim().is_empty() { None } else { Some(s) });
    if let Some(p) = normalized.as_ref() {
        let pb = PathBuf::from(p);
        if !pb.is_absolute() {
            return Err("路径必须是绝对路径".to_string());
        }
        // Create if not exists, to fail fast on invalid paths.
        std::fs::create_dir_all(&pb).map_err(|e| format!("无法创建目录: {}", e))?;
    }
    cfg.output_root = normalized;
    cfg.save().map_err(to_err)?;
    get_output_root()
}

#[tauri::command]
pub async fn export_pdf(
    image_paths: Vec<String>,
    output_path: String,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        crate::export::export_pdf(&image_paths, std::path::Path::new(&output_path))
    })
    .await
    .map_err(to_err)?
    .map_err(to_err)
}

#[tauri::command]
pub async fn export_pptx(
    image_paths: Vec<String>,
    output_path: String,
    title: String,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        crate::export::export_pptx(
            &image_paths,
            std::path::Path::new(&output_path),
            &title,
        )
    })
    .await
    .map_err(to_err)?
    .map_err(to_err)
}

/// Returns whether the app currently has macOS Screen Recording permission.
/// Always returns true on non-macOS platforms.
#[tauri::command]
pub fn check_screen_recording_permission() -> bool {
    crate::permissions::has_screen_recording_permission()
}

/// Trigger the system Screen Recording permission prompt. The OS only shows a
/// dialog on first call for this app identity; on later calls it silently
/// returns the current state. Returns the current state after the call.
#[tauri::command]
pub fn request_screen_recording_permission() -> bool {
    crate::permissions::request_screen_recording_permission()
}

/// Relaunch the app. Needed after the user grants Screen Recording permission,
/// because TCC state is read once at process start.
#[tauri::command]
pub fn relaunch_app(app: tauri::AppHandle) {
    app.restart();
}

/// Wipe macOS TCC's Screen Recording record for this bundle id, then open
/// System Settings so the user can re-grant. This breaks the "switch looks
/// enabled but capture still sees only wallpaper" deadlock that happens when
/// a previous build's cdhash no longer matches the current binary.
#[tauri::command]
pub fn reset_screen_recording_permission(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let bundle_id = app.config().identifier.clone();
        // tccutil reset acts on the current user's TCC db; no sudo needed.
        let status = std::process::Command::new("tccutil")
            .args(["reset", "ScreenCapture", &bundle_id])
            .status()
            .map_err(to_err)?;
        if !status.success() {
            return Err(format!("tccutil reset 失败 (exit {:?})", status.code()));
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
    }
    Ok(())
}

/// Open System Settings directly to Privacy → Screen Recording.
#[tauri::command]
pub fn open_screen_recording_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")
            .spawn()
            .map_err(to_err)?;
    }
    Ok(())
}

#[tauri::command]
pub fn open_output_dir(dir: String) -> Result<(), String> {
    let path = PathBuf::from(&dir);
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(to_err)?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(to_err)?;
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = path;
    }
    Ok(())
}
