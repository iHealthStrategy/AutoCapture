//! macOS Screen Recording (TCC) permission helpers.
//!
//! Without this permission, `CGDisplayCreateImage` returns an image containing
//! only the desktop wallpaper and menu bar — every other window is filtered
//! out. The result is a screenshot that looks like "wallpaper inside the
//! selected region", which surprises users. We detect that state on startup
//! and guide the user to grant access.

#[cfg(target_os = "macos")]
#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
}

#[cfg(target_os = "macos")]
pub fn has_screen_recording_permission() -> bool {
    unsafe { CGPreflightScreenCaptureAccess() }
}

/// Trigger the OS permission prompt. The system only shows a dialog the very
/// first time it is called for a given app identity; afterwards it silently
/// returns the current state. Callers should fall back to opening System
/// Settings directly when this returns false.
#[cfg(target_os = "macos")]
pub fn request_screen_recording_permission() -> bool {
    unsafe { CGRequestScreenCaptureAccess() }
}

#[cfg(not(target_os = "macos"))]
pub fn has_screen_recording_permission() -> bool {
    true
}

#[cfg(not(target_os = "macos"))]
pub fn request_screen_recording_permission() -> bool {
    true
}
