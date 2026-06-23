use std::fs;
use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
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

/// One entry in a directory listing returned by `read_dir`.
#[derive(Serialize)]
struct DirEntry {
    name: String,
    path: String,
    is_dir: bool,
}

/// List the immediate children of a directory. The file-tree lazy-loads each
/// folder on expand, so this returns a single level only. Dotfiles (`.git`,
/// `.DS_Store`, …) are skipped to keep the tree readable. Folders sort before
/// files, then case-insensitively by name.
#[tauri::command]
fn read_dir(path: String) -> Result<Vec<DirEntry>, String> {
    let mut entries: Vec<DirEntry> = Vec::new();
    let iter = fs::read_dir(&path).map_err(|e| format!("Could not read folder “{path}”: {e}"))?;
    for entry in iter {
        let entry = entry.map_err(|e| format!("Could not read folder “{path}”: {e}"))?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        // file_type() avoids a stat() on most platforms; default to "not a dir".
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        entries.push(DirEntry {
            name,
            path: entry.path().to_string_lossy().into_owned(),
            is_dir,
        });
    }
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

/// Create an empty file. Errors if a file or folder already exists at `path`,
/// so an accidental click never clobbers existing content.
#[tauri::command]
fn create_file(path: String) -> Result<(), String> {
    if Path::new(&path).exists() {
        return Err(format!("Already exists: {path}"));
    }
    fs::write(&path, "").map_err(|e| format!("Could not create “{path}”: {e}"))
}

/// Create a directory. Errors if anything already exists at `path`.
#[tauri::command]
fn create_dir(path: String) -> Result<(), String> {
    if Path::new(&path).exists() {
        return Err(format!("Already exists: {path}"));
    }
    fs::create_dir(&path).map_err(|e| format!("Could not create folder “{path}”: {e}"))
}

/// Frontend calls this once on boot to drain any path captured before the
/// webview/JS listener existed. Returns null if none.
#[tauri::command]
fn get_pending_file(state: tauri::State<PendingFile>) -> Option<String> {
    state.0.lock().unwrap().take()
}

/// Open a URL in the OS default browser. The frontend intercepts preview-link
/// clicks and calls this so links never navigate the webview itself (a desktop
/// window has no back button). The scheme allowlist keeps `file:`/arbitrary
/// schemes from reaching the OS opener.
#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    let url = url.trim();
    let ok = ["http://", "https://", "mailto:"].iter().any(|s| url.starts_with(s));
    if !ok {
        return Err(format!("Refusing to open unsupported URL: {url}"));
    }
    open::that(url).map_err(|e| format!("Could not open “{url}”: {e}"))
}

/// A document fetched from the web: its text, a tab name, and the final URL
/// (after redirects/blob-rewrite) so the preview can resolve relative images.
#[derive(Serialize)]
struct FetchedDoc {
    content: String,
    name: String,
    url: String,
}

/// Rewrite a GitHub *blob* page URL to its raw counterpart so a pasted
/// `github.com/.../blob/...` link fetches markdown instead of an HTML page.
/// Any other URL is returned unchanged.
fn rewrite_github_blob(url: &str) -> String {
    if let Some(rest) = url.strip_prefix("https://github.com/") {
        // rest = "{user}/{repo}/blob/{branch}/{path...}"
        let mut parts = rest.splitn(4, '/');
        if let (Some(user), Some(repo), Some("blob"), Some(tail)) =
            (parts.next(), parts.next(), parts.next(), parts.next())
        {
            return format!("https://raw.githubusercontent.com/{user}/{repo}/{tail}");
        }
    }
    url.to_string()
}

/// Derive a tab name from a URL's last non-empty path segment (query/fragment
/// stripped). Falls back to "Untitled" when there is nothing usable.
fn name_from_url(url: &str) -> String {
    let path = url
        .split(['?', '#'])
        .next()
        .unwrap_or(url)
        .trim_end_matches('/');
    match path.rsplit('/').next() {
        Some(s) if !s.is_empty() && !s.contains("://") => s.to_string(),
        _ => "Untitled".to_string(),
    }
}

/// Fetch a markdown document over HTTP(S) and return its text plus a tab name.
/// Runs in Rust (not the webview) so the page CSP never applies to the request.
#[tauri::command]
async fn fetch_url(url: String) -> Result<FetchedDoc, String> {
    let url = url.trim();
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("Only http:// and https:// URLs are supported.".into());
    }
    let fetch_url = rewrite_github_blob(url);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent(concat!("MDE/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| format!("Could not start request: {e}"))?;

    let resp = client
        .get(&fetch_url)
        .send()
        .await
        .map_err(|e| format!("Could not reach “{url}”: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        return Err(format!(
            "Server returned {} for “{url}”.",
            status.canonical_reason().unwrap_or(status.as_str())
        ));
    }

    // Use the final URL (after redirects) to name the tab and as the image base.
    let final_url = resp.url().as_str().to_string();
    let content = resp
        .text()
        .await
        .map_err(|e| format!("Could not read response from “{url}”: {e}"))?;

    Ok(FetchedDoc {
        content,
        name: name_from_url(&final_url),
        url: final_url,
    })
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

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default();

    // macOS routes file opens to the single Launch-Services instance via
    // RunEvent::Opened. The single-instance plugin forwards only argv (never
    // the opened file on macOS) and exit(0)s the file-opening process before
    // its RunEvent::Opened is handled, so register it on Windows/Linux only.
    #[cfg(not(target_os = "macos"))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(
            |app, argv, _cwd| {
                // Fires in the FIRST instance when a second launch happens
                // (Windows/Linux "Open with" while already running).
                if let Some(path) = file_from_args(&argv) {
                    deliver_path(app, path);
                } else if let Some(w) = app.get_webview_window("main") {
                    let _ = w.set_focus();
                }
            },
        ));
    }

    let builder = builder
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
            read_dir,
            create_file,
            create_dir,
            get_pending_file,
            fetch_url,
            open_external
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
