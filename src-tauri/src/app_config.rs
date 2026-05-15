use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AppConfig {
    /// Custom root directory for recordings. None = use platform default.
    #[serde(default)]
    pub output_root: Option<String>,
}

fn config_path() -> Result<PathBuf> {
    let dir = dirs::config_dir()
        .ok_or_else(|| anyhow!("Cannot resolve config directory"))?
        .join("AutoCapture");
    std::fs::create_dir_all(&dir)?;
    Ok(dir.join("config.json"))
}

impl AppConfig {
    pub fn load() -> AppConfig {
        match Self::try_load() {
            Ok(c) => c,
            Err(_) => AppConfig::default(),
        }
    }

    fn try_load() -> Result<AppConfig> {
        let path = config_path()?;
        if !path.exists() {
            return Ok(AppConfig::default());
        }
        let bytes = std::fs::read(&path)?;
        let cfg: AppConfig = serde_json::from_slice(&bytes)?;
        Ok(cfg)
    }

    pub fn save(&self) -> Result<()> {
        let path = config_path()?;
        let json = serde_json::to_string_pretty(self)?;
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, json)?;
        std::fs::rename(&tmp, &path)?;
        Ok(())
    }
}
