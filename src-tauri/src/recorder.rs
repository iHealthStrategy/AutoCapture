use anyhow::{anyhow, Result};
use serde::Serialize;
use std::sync::{
    atomic::{AtomicU32, Ordering},
    Arc, Mutex,
};

use crate::capture::{capture_region, Region};
use crate::paths;
use crate::session::Session;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RecorderState {
    Idle,
    Recording,
}

#[derive(Debug, Clone, Serialize)]
pub struct RecorderStatus {
    pub state: RecorderState,
    pub captured_count: u32,
    pub meeting_name: Option<String>,
    pub started_at: Option<String>,
    pub region: Option<Region>,
    pub output_dir: Option<String>,
}

struct Inner {
    state: Mutex<RecorderState>,
    session: Mutex<Option<Session>>,
    captured: AtomicU32,
}

#[derive(Clone)]
pub struct Recorder {
    inner: Arc<Inner>,
}

impl Recorder {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Inner {
                state: Mutex::new(RecorderState::Idle),
                session: Mutex::new(None),
                captured: AtomicU32::new(0),
            }),
        }
    }

    pub fn status(&self) -> RecorderStatus {
        let state = *self.inner.state.lock().unwrap();
        let session = self.inner.session.lock().unwrap().clone();
        let captured = self.inner.captured.load(Ordering::Relaxed);
        let output_dir = session
            .as_ref()
            .and_then(|s| s.dir().ok().map(|p| p.to_string_lossy().into_owned()));
        RecorderStatus {
            state,
            captured_count: captured,
            meeting_name: session.as_ref().map(|s| s.meeting_name.clone()),
            started_at: session.as_ref().map(|s| s.started_at.clone()),
            region: session.as_ref().map(|s| s.region),
            output_dir,
        }
    }

    pub fn start(&self, meeting_name: String, region: Region) -> Result<RecorderStatus> {
        paths::validate_meeting_name(&meeting_name)?;
        {
            let state = *self.inner.state.lock().unwrap();
            if state != RecorderState::Idle {
                return Err(anyhow!("已经在录制中"));
            }
        }
        let session = Session::new(meeting_name, region);
        std::fs::create_dir_all(session.dir()?)?;
        session.persist()?;

        *self.inner.session.lock().unwrap() = Some(session);
        self.inner.captured.store(0, Ordering::Relaxed);
        *self.inner.state.lock().unwrap() = RecorderState::Recording;
        Ok(self.status())
    }

    pub fn resume(&self, session: Session) -> Result<RecorderStatus> {
        {
            let state = *self.inner.state.lock().unwrap();
            if state != RecorderState::Idle {
                return Err(anyhow!("已经在录制中"));
            }
        }
        std::fs::create_dir_all(session.dir()?)?;
        let captured = session.captured_count;
        *self.inner.session.lock().unwrap() = Some(session);
        self.inner.captured.store(captured, Ordering::Relaxed);
        *self.inner.state.lock().unwrap() = RecorderState::Recording;
        Ok(self.status())
    }

    /// Stop the active recording and commit it. The persistence file is
    /// cleared here so closing the app right after stop won't trigger the
    /// "interrupted recording" recovery prompt. The in-memory session stays
    /// so the UI can still navigate to Review.
    pub fn stop(&self) -> Result<RecorderStatus> {
        {
            let state = *self.inner.state.lock().unwrap();
            if state == RecorderState::Idle {
                return Err(anyhow!("当前未在录制"));
            }
        }
        Session::clear()?;
        *self.inner.state.lock().unwrap() = RecorderState::Idle;
        Ok(self.status())
    }

    pub fn finalize(&self) -> Result<()> {
        *self.inner.session.lock().unwrap() = None;
        self.inner.captured.store(0, Ordering::Relaxed);
        *self.inner.state.lock().unwrap() = RecorderState::Idle;
        Session::clear()?;
        Ok(())
    }

    /// Commit an interrupted session so the user can curate it in Review.
    /// Clears the on-disk session file — the recording is considered "done".
    pub fn adopt_for_review(&self, session: Session) -> Result<RecorderStatus> {
        {
            let state = *self.inner.state.lock().unwrap();
            if state != RecorderState::Idle {
                return Err(anyhow!("录制进行中，无法切换到整理"));
            }
        }
        Session::clear()?;
        self.inner
            .captured
            .store(session.captured_count, Ordering::Relaxed);
        *self.inner.session.lock().unwrap() = Some(session);
        Ok(self.status())
    }

    /// Capture one frame on demand.
    pub async fn capture_one(&self) -> Result<RecorderStatus> {
        {
            let state = *self.inner.state.lock().unwrap();
            if state != RecorderState::Recording {
                return Err(anyhow!("当前未在录制"));
            }
        }
        let region = {
            let sess = self.inner.session.lock().unwrap();
            sess.as_ref()
                .map(|s| s.region)
                .ok_or_else(|| anyhow!("会话不存在"))?
        };

        let img = tokio::task::spawn_blocking(move || capture_region(&region)).await??;

        let dir = {
            let mut sess_guard = self.inner.session.lock().unwrap();
            let sess = sess_guard
                .as_mut()
                .ok_or_else(|| anyhow!("会话不存在"))?;
            sess.captured_count += 1;
            sess.next_seq += 1;
            sess.dir()?
        };
        // Filename: local timestamp; if collision (rapid clicks within same second),
        // append a counter.
        let now = chrono::Local::now();
        let mut counter = 0u32;
        let file = loop {
            let candidate = dir.join(paths::screenshot_filename(&now, counter));
            if !candidate.exists() {
                break candidate;
            }
            counter += 1;
            if counter > 999 {
                return Err(anyhow!("无法分配文件名"));
            }
        };
        tokio::task::spawn_blocking(move || -> Result<()> {
            img.save(&file)?;
            Ok(())
        })
        .await??;

        let snapshot = self.inner.session.lock().unwrap().clone();
        if let Some(s) = snapshot {
            self.inner.captured.store(s.captured_count, Ordering::Relaxed);
            let _ = s.persist();
        }
        Ok(self.status())
    }
}
