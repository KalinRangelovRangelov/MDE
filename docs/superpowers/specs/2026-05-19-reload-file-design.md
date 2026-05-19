# Reload File — Design

**Date:** 2026-05-19
**Status:** Approved

## Goal

Let the user re-read the active tab's file from disk, replacing the editor and
preview with the on-disk content. Useful when the file was changed by another
program (git checkout, formatter, external editor).

## Trigger

- Toolbar button `⟳ Reload`, placed next to `📂 Open` / `💾 Save`.
- Keyboard shortcut **Cmd+R** (macOS) / **Ctrl+R** (Windows/Linux), added to
  the existing `keydown` handler in `src/main.ts`. The handler calls
  `e.preventDefault()` so the keystroke reloads the *file* rather than the
  webview.

## Logic — `reloadFile()` in `src/main.ts`

1. `tab = tabs.active`. If `tab.path` is `null` (never saved) → toast
   `"Nothing to reload — file isn't saved yet"`, return.
2. If `isDirty(tab)` → `confirm("Reload from disk? Unsaved changes to
   \"<name>\" will be lost.")`. If the user declines, return.
3. `content = await readFile(tab.path)`. On error → `toast(String(e),
   "error")`, return.
4. Reset the tab to the on-disk content via a new
   `TabManager.markReloaded(content)` helper (sets `doc` and `savedDoc`,
   fires `onChange`), then `editor.setDoc(content)`, `updatePreview()`,
   `editor.focus()`, and toast `"Reloaded <name>"`.

## Decisions

- **Unsaved changes:** confirm, then discard (mirrors close-tab behavior).
- **Untitled tab:** no-op with an explanatory toast.
- **Non-Tauri browser:** `readFile` is already wrapped by the `tauri()` guard;
  reload surfaces the existing "Desktop features need the Tauri app" toast.

## Out of Scope / YAGNI

- No new Rust command — reuses the existing `read_file`.
- No filesystem watcher / auto-reload on external change.
- No per-tab reload (only the active tab).

## Testing

- Unit test `TabManager.markReloaded`: updates `doc`/`savedDoc`, clears dirty,
  fires `onChange`.
- Manual smoke test in the Tauri app: edit a file externally, Cmd+R, confirm
  content refreshes and the dirty dot clears.
