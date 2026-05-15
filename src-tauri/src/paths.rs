use anyhow::{anyhow, Result};
use chrono::Local;
use std::path::PathBuf;

use crate::app_config::AppConfig;

const ILLEGAL_CHARS: &[char] = &['<', '>', ':', '"', '/', '\\', '|', '?', '*'];
const MAX_NAME_LEN: usize = 100;

/// Platform-default recording root: ~/auto-capture/
pub fn default_root_dir() -> Result<PathBuf> {
    let home = dirs::home_dir().ok_or_else(|| anyhow!("Cannot resolve home directory"))?;
    Ok(home.join("auto-capture"))
}

/// Effective recording root — user-customised if set, else default.
pub fn root_dir() -> Result<PathBuf> {
    let cfg = AppConfig::load();
    match cfg.output_root.as_deref() {
        Some(s) if !s.is_empty() => Ok(PathBuf::from(s)),
        _ => default_root_dir(),
    }
}

/// Session file path: ~/auto-capture/.session.json
pub fn session_file() -> Result<PathBuf> {
    Ok(root_dir()?.join(".session.json"))
}

/// Recording directory: ~/auto-capture/{YYYY-MM-DD}/{meeting_name}/
pub fn recording_dir(date: &str, meeting_name: &str) -> Result<PathBuf> {
    Ok(root_dir()?.join(date).join(meeting_name))
}

/// Today's date in YYYY-MM-DD format (local time)
pub fn today() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

/// Validate meeting name. Returns Err with a reason if invalid.
pub fn validate_meeting_name(name: &str) -> Result<()> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(anyhow!("会议名称不能为空"));
    }
    if trimmed.len() > MAX_NAME_LEN {
        return Err(anyhow!("会议名称过长（最多 {} 个字符）", MAX_NAME_LEN));
    }
    if trimmed != name {
        return Err(anyhow!("会议名称首尾不能有空格"));
    }
    if name.ends_with('.') {
        return Err(anyhow!("会议名称不能以 . 结尾"));
    }
    for c in name.chars() {
        if ILLEGAL_CHARS.contains(&c) {
            return Err(anyhow!("会议名称不能包含以下字符: < > : \" / \\ | ? *"));
        }
        if (c as u32) < 0x20 {
            return Err(anyhow!("会议名称不能包含控制字符"));
        }
    }
    Ok(())
}

/// File name based on local date+time. E.g. 2026-05-14 13:10:20 -> "2026_05_14_13_10_20.png"
/// If `counter` > 0, appends "_{counter}" to avoid collisions on rapid captures.
pub fn screenshot_filename(dt: &chrono::DateTime<chrono::Local>, counter: u32) -> String {
    if counter == 0 {
        dt.format("%Y_%m_%d_%H_%M_%S.png").to_string()
    } else {
        format!("{}_{}.png", dt.format("%Y_%m_%d_%H_%M_%S"), counter)
    }
}
