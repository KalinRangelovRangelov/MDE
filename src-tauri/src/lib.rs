use std::fs;
use std::path::Path;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![read_file, write_file])
        .run(tauri::generate_context!())
        .expect("error while running markdown-editor");
}
