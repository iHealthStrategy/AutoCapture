mod app_config;
mod capture;
mod commands;
mod export;
mod paths;
mod permissions;
mod recorder;
mod session;

use commands::AppState;
use recorder::Recorder;
use tauri::Manager;

/// macOS dev mode shows a generic Dock icon for loose Mach-O binaries — they
/// aren't .app bundles, so LaunchServices can't bind an icon to them. Set the
/// running NSApplication's icon manually so the Dock matches the window icon.
#[cfg(target_os = "macos")]
fn set_dock_icon_from_bytes(bytes: &'static [u8]) {
    use cocoa::appkit::{NSApp, NSApplication, NSImage};
    use cocoa::base::{id, nil};
    use cocoa::foundation::NSData;
    use objc::{msg_send, sel, sel_impl};

    unsafe {
        let data: id = NSData::dataWithBytes_length_(
            nil,
            bytes.as_ptr() as *const std::ffi::c_void,
            bytes.len() as u64,
        );
        let image: id = NSImage::initWithData_(NSImage::alloc(nil), data);
        if image == nil {
            return;
        }
        let app: id = NSApp();
        if app == nil {
            return;
        }
        let _: () = msg_send![app, setApplicationIconImage: image];
    }
}

#[cfg(target_os = "macos")]
fn set_macos_dock_icon() {
    set_dock_icon_from_bytes(include_bytes!("../icons/icon.png"));
}

/// Switch the Dock icon to one of three states: "close" (default), "half"
/// (motion detected, not yet captured), or "open" (capture just fired).
/// Caller is responsible for running this on the main thread.
#[cfg(target_os = "macos")]
pub fn set_dock_icon_state(state: &str) {
    match state {
        "open" => set_dock_icon_from_bytes(include_bytes!("../icons/icon-open.png")),
        "half" => set_dock_icon_from_bytes(include_bytes!("../icons/icon-half.png")),
        _ => set_dock_icon_from_bytes(include_bytes!("../icons/icon.png")),
    }
}

#[cfg(not(target_os = "macos"))]
pub fn set_dock_icon_state(_state: &str) {}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                // Apply once now, and once again after a short delay so it
                // wins against any default icon Tauri may set during window
                // creation that happens just after `setup`.
                set_macos_dock_icon();
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(600));
                    let _ = handle.run_on_main_thread(|| {
                        set_macos_dock_icon();
                    });
                });
            }
            app.manage(AppState {
                recorder: Recorder::new(),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_monitors,
            commands::virtual_desktop_bounds,
            commands::validate_meeting_name,
            commands::start_recording,
            commands::capture_one,
            commands::capture_thumbnail,
            commands::set_dock_icon,
            commands::stop_recording,
            commands::finalize_recording,
            commands::recorder_status,
            commands::check_resumable,
            commands::resume_session,
            commands::end_session,
            commands::discard_session,
            commands::list_screenshots,
            commands::delete_screenshots,
            commands::open_output_dir,
            commands::list_recordings,
            commands::delete_recording,
            commands::get_output_root,
            commands::set_output_root,
            commands::export_pdf,
            commands::export_pptx,
            commands::check_screen_recording_permission,
            commands::request_screen_recording_permission,
            commands::open_screen_recording_settings,
            commands::reset_screen_recording_permission,
            commands::relaunch_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
