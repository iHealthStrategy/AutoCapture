use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use crate::capture::Region;
use crate::paths;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub meeting_name: String,
    pub date: String,
    pub region: Region,
    pub started_at: String,
    pub captured_count: u32,
    /// Next sequence number to assign (handles gaps if user deleted files mid-session).
    pub next_seq: u32,
}

impl Session {
    pub fn new(meeting_name: String, region: Region) -> Self {
        Self {
            meeting_name,
            date: paths::today(),
            region,
            started_at: chrono::Local::now().to_rfc3339(),
            captured_count: 0,
            next_seq: 1,
        }
    }

    pub fn dir(&self) -> Result<PathBuf> {
        paths::recording_dir(&self.date, &self.meeting_name)
    }

    pub fn persist(&self) -> Result<()> {
        let path = paths::session_file()?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_string_pretty(self)?;
        // Atomic write: write to .tmp, then rename.
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, json)?;
        std::fs::rename(&tmp, &path)?;
        Ok(())
    }

    pub fn load() -> Result<Option<Self>> {
        let path = paths::session_file()?;
        if !path.exists() {
            return Ok(None);
        }
        let bytes = std::fs::read(&path)?;
        let session: Session = serde_json::from_slice(&bytes)
            .map_err(|e| anyhow!("会话文件损坏: {}", e))?;
        Ok(Some(session))
    }

    pub fn clear() -> Result<()> {
        let path = paths::session_file()?;
        if path.exists() {
            std::fs::remove_file(&path)?;
        }
        Ok(())
    }
}
