use std::fs;
use std::path::Path;
use std::sync::Mutex;

use tauri::{Emitter, Manager};

/// Holds a file path captured before the frontend was ready to receive events,
/// so a path delivered during cold start (notably macOS) is not lost.
#[derive(Default)]
struct PendingFile(Mutex<Option<String>>);

/// Read a UTF-8 text file from disk. Returns the file contents or an error
/// message suitable for display in a toast.
#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Could not open “{path}”: {e}"))
}

/// Write `content` to `path` as UTF-8, creating or truncating the file.
#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            return Err(format!("Folder does not exist: {}", parent.display()));
        }
    }
    fs::write(&path, content).map_err(|e| format!("Could not save “{path}”: {e}"))
}

/// Frontend calls this once on boot to drain any path captured before the
/// webview/JS listener existed. Returns null if none.
#[tauri::command]
fn get_pending_file(state: tauri::State<PendingFile>) -> Option<String> {
    state.0.lock().unwrap().take()
}

/// Treat an arg as a file to open only if it exists and is not a flag.
fn looks_like_file(arg: &str) -> bool {
    !arg.starts_with('-') && Path::new(arg).is_file()
}

/// Pull the first openable file path out of a process argv vector.
fn file_from_args(args: &[String]) -> Option<String> {
    args.iter().skip(1).find(|a| looks_like_file(a)).cloned()
}

/// Deliver a path to the running app: store it (race-safe) and emit live.
fn deliver_path(app: &tauri::AppHandle, path: String) {
    if let Some(state) = app.try_state::<PendingFile>() {
        *state.0.lock().unwrap() = Some(path.clone());
    }
    let _ = app.emit("open-file", path);
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.set_focus();
        let _ = w.unminimize();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Path passed at cold start (Windows/Linux argv). macOS uses RunEvent::Opened.
    let startup_file = file_from_args(&std::env::args().collect::<Vec<_>>());

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // Fires in the FIRST instance when a second launch happens
            // (Windows/Linux "Open with" while already running).
            if let Some(path) = file_from_args(&argv) {
                deliver_path(app, path);
            } else if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .manage(PendingFile::default())
        .setup(move |app| {
            if let Some(path) = startup_file.clone() {
                *app.state::<PendingFile>().0.lock().unwrap() = Some(path);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_file,
            write_file,
            get_pending_file
        ]);

    builder
        .build(tauri::generate_context!())
        .expect("error while running markdown-editor")
        .run(|app, event| {
            // macOS: file-open requests arrive as RunEvent::Opened, never argv.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = event {
                for url in urls {
                    if let Ok(p) = url.to_file_path() {
                        deliver_path(app, p.to_string_lossy().into_owned());
                    }
                }
            }
            #[cfg(not(target_os = "macos"))]
            {
                let _ = (app, event);
            }
        });
}
