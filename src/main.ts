import "./styles.css";
import { Editor } from "./editor";
import { renderMarkdown, setCodeTheme, isExternal, type Theme } from "./preview";
import { TabManager, isDirty, dirname } from "./tabs";
import { toolbar, palette } from "./library";
import { FileTree, type DirEntry } from "./filetree";

// ---- Tauri bridges (guarded so the UI still runs in a plain browser) -------
const inTauri = "__TAURI_INTERNALS__" in window;

async function tauri<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  if (!inTauri) {
    toast("Desktop features need the Tauri app (run `npm run tauri dev`).", "error");
    return fallback;
  }
  return fn();
}

async function readFile(path: string): Promise<string> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("read_file", { path });
}
async function writeFile(path: string, content: string): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("write_file", { path, content });
}
async function fetchUrl(url: string): Promise<{ content: string; name: string; url: string }> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke("fetch_url", { url });
}
async function readDir(path: string): Promise<DirEntry[]> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<DirEntry[]>("read_dir", { path });
}
async function createFile(path: string): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("create_file", { path });
}
async function createDir(path: string): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("create_dir", { path });
}
// Open a link in the OS default browser. Used by the preview click handler so
// links never navigate the app's own webview. Falls back to window.open in a
// plain browser (dev) so testing still works.
async function openExternal(href: string): Promise<void> {
  if (!inTauri) {
    window.open(href, "_blank", "noopener");
    return;
  }
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("open_external", { url: href });
  } catch (e) {
    toast(String(e), "error");
  }
}

// ---- DOM refs -------------------------------------------------------------
const $ = (id: string) => document.getElementById(id)!;
const tabbarEl = $("tabbar");
const toolbarEl = $("toolbar");
const filetreeEl = $("filetree");
const paletteEl = $("palette");
const panesEl = $("panes");
const editorPane = $("editor-pane");
const previewPane = $("preview-pane");
const previewEl = $("preview");

// ---- State ----------------------------------------------------------------
type ViewMode = "split" | "source" | "preview";
let mode: ViewMode = "split";
let paletteVisible = true;
let treeVisible = true;

let theme: Theme = localStorage.getItem("mde-theme") === "light" ? "light" : "dark";
let themeBtn: HTMLButtonElement | undefined;

function applyTheme(t: Theme) {
  theme = t;
  document.body.dataset.theme = t;
  editor.setTheme(t);
  setCodeTheme(t);
  localStorage.setItem("mde-theme", t);
  if (themeBtn) {
    themeBtn.textContent = t === "dark" ? "☀ Light" : "☾ Dark";
    themeBtn.title = t === "dark" ? "Switch to light theme" : "Switch to dark theme";
  }
}

const tabs = new TabManager(() => renderTabs());
const editor = new Editor($("editor"), tabs.active.doc, onEditorChange, theme);

const tree = new FileTree(filetreeEl, {
  readDir,
  onOpenFolder: openFolder,
  onOpenFile: openPath,
  onNewFile: newFileInDir,
  onNewFolder: newFolderInDir,
});

let renderTimer: number | undefined;
function onEditorChange(doc: string) {
  tabs.setDoc(doc);
  renderTabs();
  clearTimeout(renderTimer);
  renderTimer = window.setTimeout(updatePreview, 150);
}

function updatePreview() {
  const t = tabs.active;
  previewEl.innerHTML = renderMarkdown(t.doc, t.path ? dirname(t.path) : undefined, t.sourceUrl);
  if (inTauri) rewriteLocalImages();
}

// Local images are rendered with a `data-rel-src` absolute path by preview.ts;
// convert those to asset-protocol URLs the webview can actually load.
let convertFileSrcFn: ((p: string) => string) | undefined;
async function rewriteLocalImages() {
  const imgs = previewEl.querySelectorAll<HTMLImageElement>("img[data-rel-src]");
  if (imgs.length === 0) return;
  if (!convertFileSrcFn) {
    ({ convertFileSrc: convertFileSrcFn } = await import("@tauri-apps/api/core"));
  }
  imgs.forEach((img) => {
    const abs = img.dataset.relSrc;
    if (abs) img.src = convertFileSrcFn!(abs);
  });
}

// ---- Tab bar --------------------------------------------------------------
function renderTabs() {
  tabbarEl.innerHTML = "";
  for (const t of tabs.tabs) {
    const el = document.createElement("div");
    el.className = "tab" + (t.id === tabs.activeId ? " active" : "") + (isDirty(t) ? " dirty" : "");
    el.title = t.path ?? "Unsaved document";

    const dot = document.createElement("span");
    dot.className = "dot";
    const name = document.createElement("span");
    name.textContent = t.name;
    const close = document.createElement("button");
    close.className = "close";
    close.textContent = "×";
    close.onclick = (e) => {
      e.stopPropagation();
      closeTab(t.id);
    };

    el.append(dot, name, close);
    el.onclick = () => switchTo(t.id);
    tabbarEl.appendChild(el);
  }
  const add = document.createElement("button");
  add.className = "new-tab";
  add.textContent = "+";
  add.title = "New document";
  add.onclick = () => {
    tabs.newTab();
    editor.setDoc("");
    updatePreview();
    editor.focus();
  };
  tabbarEl.appendChild(add);
}

function switchTo(id: number) {
  if (id === tabs.activeId) return;
  tabs.select(id);
  editor.setDoc(tabs.active.doc);
  updatePreview();
  editor.focus();
}

function closeTab(id: number) {
  const ok = tabs.close(id, (t) =>
    confirm(`“${t.name}” has unsaved changes. Discard them?`),
  );
  if (!ok) return;
  editor.setDoc(tabs.active.doc);
  updatePreview();
}

// ---- Toolbar & palette ----------------------------------------------------
function buildToolbar() {
  for (const item of toolbar) {
    const b = document.createElement("button");
    b.textContent = item.label;
    b.title = item.hint ?? item.label;
    b.onclick = () => editor.applySnippet(item.spec);
    toolbarEl.appendChild(b);
  }

  toolbarEl.append(sep(), iconBtn("📂 Open", openFile), iconBtn("🌐 URL", openFromUrl),
    iconBtn("💾 Save", () => saveFile(false)), iconBtn("Save As", () => saveFile(true)));

  const spacer = document.createElement("div");
  spacer.className = "spacer";
  toolbarEl.appendChild(spacer);

  toolbarEl.appendChild(iconBtn("🗂 Files", () => {
    treeVisible = !treeVisible;
    filetreeEl.classList.toggle("hidden", !treeVisible);
  }));

  toolbarEl.appendChild(iconBtn("☰ Library", () => {
    paletteVisible = !paletteVisible;
    paletteEl.classList.toggle("hidden", !paletteVisible);
  }));

  const seg = document.createElement("div");
  seg.className = "seg";
  (["split", "source", "preview"] as ViewMode[]).forEach((m) => {
    const b = document.createElement("button");
    b.textContent = m[0].toUpperCase() + m.slice(1);
    b.dataset.mode = m;
    b.onclick = () => setMode(m);
    seg.appendChild(b);
  });
  toolbarEl.appendChild(seg);

  // Theme toggle, pinned to the top-right end of the toolbar.
  themeBtn = iconBtn("", () => applyTheme(theme === "dark" ? "light" : "dark"));
  toolbarEl.appendChild(themeBtn);

  setMode(mode);
}

function sep() {
  const s = document.createElement("div");
  s.className = "sep";
  return s;
}
function iconBtn(label: string, onClick: () => void) {
  const b = document.createElement("button");
  b.textContent = label;
  b.onclick = onClick;
  return b;
}

function buildPalette() {
  for (const group of palette) {
    const h = document.createElement("h3");
    h.textContent = group.category;
    paletteEl.appendChild(h);
    for (const item of group.items) {
      const b = document.createElement("button");
      b.innerHTML = item.hint
        ? `${escapeHtml(item.label)} <small>${escapeHtml(item.hint)}</small>`
        : escapeHtml(item.label);
      b.onclick = () => editor.applySnippet(item.spec);
      paletteEl.appendChild(b);
    }
  }
}

function setMode(m: ViewMode) {
  mode = m;
  editorPane.classList.toggle("hidden", m === "preview");
  previewPane.classList.toggle("hidden", m === "source");
  panesEl.classList.toggle("single", m !== "split");
  toolbarEl.querySelectorAll(".seg button").forEach((b) => {
    (b as HTMLElement).classList.toggle("on", (b as HTMLElement).dataset.mode === m);
  });
}

// ---- Preview link handling ------------------------------------------------
// Anchor clicks would otherwise navigate the webview itself to the target,
// replacing the app with no way back. Intercept here: open external links in
// the OS browser, and never let the webview navigate. One delegated listener
// suffices — `previewEl` persists; updatePreview only swaps its innerHTML.
previewEl.addEventListener("click", (e) => {
  const a = (e.target as HTMLElement).closest("a");
  const href = a?.getAttribute("href");
  if (!href) return;
  e.preventDefault(); // never let the webview navigate away
  if (href.startsWith("#")) return; // in-doc anchor: no-op (no heading ids today)
  if (isExternal(href)) {
    openExternal(href);
  } else if (tabs.active.sourceUrl) {
    // Relative link in a web-sourced doc: resolve against the source URL.
    try {
      openExternal(new URL(href, tabs.active.sourceUrl).href);
    } catch {
      /* malformed — ignore */
    }
  }
  // Relative links in a local doc are a no-op for now — opening linked local
  // files in a new tab is a possible future enhancement.
});

// ---- Scroll sync (split mode) --------------------------------------------
editorPane.addEventListener("scroll", () => {
  if (mode !== "split") return;
  const e = editor.view.scrollDOM;
  const ratio = e.scrollTop / Math.max(1, e.scrollHeight - e.clientHeight);
  previewPane.scrollTop = ratio * (previewPane.scrollHeight - previewPane.clientHeight);
});

// ---- File operations ------------------------------------------------------
async function openFile() {
  const path = await tauri(async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    return open({
      multiple: false,
      filters: [{ name: "Markdown", extensions: ["md", "markdown", "mdown", "txt"] }],
    });
  }, null);
  if (!path || typeof path !== "string") return;
  try {
    const content = await readFile(path);
    tabs.openOrFocus(path, content);
    editor.setDoc(content);
    updatePreview();
    editor.focus();
  } catch (e) {
    toast(String(e), "error");
  }
}

// Open a file by absolute path (used by .md file-association launches).
async function openPath(path: string) {
  try {
    const content = await readFile(path);
    tabs.openOrFocus(path, content);
    editor.setDoc(content);
    updatePreview();
    editor.focus();
  } catch (e) {
    toast(String(e), "error");
  }
}

// Open a markdown document from a URL. The fetch runs in Rust (see fetch_url),
// so the webview CSP never applies. The result loads as an untitled tab — the
// URL is only the source, so saving uses the normal Save-As flow.
//
// Known limitation: relative image paths in the fetched markdown have no local
// base and won't resolve; absolute https: image URLs render fine.
async function openFromUrl() {
  if (!inTauri) {
    toast("Desktop features need the Tauri app (run `npm run tauri dev`).", "error");
    return;
  }
  const url = await promptUrl();
  if (!url) return;
  try {
    const { content, name, url: sourceUrl } = await fetchUrl(url);
    const tab = tabs.newTab(null, content, name);
    tab.sourceUrl = sourceUrl; // used as the preview base for relative images/links
    editor.setDoc(tab.doc);
    updatePreview();
    editor.focus();
  } catch (e) {
    toast(String(e), "error");
  }
}

// ---- Folder / file-tree operations ----------------------------------------
// Build a child path under `dir`, picking the separator already in use so this
// works on Windows (`\`) and POSIX (`/`) without importing a path module.
function joinPath(dir: string, name: string): string {
  const sep = dir.includes("\\") && !dir.includes("/") ? "\\" : "/";
  return dir.replace(/[\\/]+$/, "") + sep + name;
}

// Pick a folder to browse in the tree, and remember it for next launch.
async function openFolder() {
  const path = await tauri(async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    return open({ directory: true });
  }, null);
  if (!path || typeof path !== "string") return;
  await tree.open(path);
  localStorage.setItem("mde-folder", path);
}

async function newFileInDir(dir: string) {
  const raw = await promptText({ title: "New file", placeholder: "name.md" });
  let name = raw?.trim();
  if (!name) return;
  if (!/\.[^.\\/]+$/.test(name)) name += ".md"; // default to .md when no extension
  const path = joinPath(dir, name);
  try {
    await createFile(path);
    await tree.refresh(dir);
    openPath(path); // open the new (empty) file in a tab
  } catch (e) {
    toast(String(e), "error");
  }
}

async function newFolderInDir(dir: string) {
  const raw = await promptText({ title: "New folder", placeholder: "folder name" });
  const name = raw?.trim();
  if (!name) return;
  try {
    await createDir(joinPath(dir, name));
    await tree.refresh(dir);
  } catch (e) {
    toast(String(e), "error");
  }
}

// Reopen the last-used folder on launch (desktop only). Verify it still exists
// first so a deleted/moved folder is forgotten rather than shown empty.
async function restoreFolder() {
  if (!inTauri) return;
  const saved = localStorage.getItem("mde-folder");
  if (!saved) return;
  try {
    await readDir(saved);
    await tree.open(saved);
  } catch {
    localStorage.removeItem("mde-folder");
  }
}

// Wire up OS "Open with" / double-click delivery. Registers the live event
// listener before draining any path captured during cold start, so a path
// arriving before the webview was ready is never lost.
async function initFileAssociation() {
  if (!inTauri) return;
  const { invoke } = await import("@tauri-apps/api/core");
  const { listen } = await import("@tauri-apps/api/event");
  await listen<string>("open-file", (e) => {
    if (e.payload) openPath(e.payload);
  });
  const pending = await invoke<string | null>("get_pending_file");
  if (pending) openPath(pending);
}

async function saveFile(forceDialog: boolean) {
  const tab = tabs.active;
  let path = tab.path;
  if (!path || forceDialog) {
    path = await tauri(async () => {
      const { save } = await import("@tauri-apps/plugin-dialog");
      return save({
        defaultPath: tab.path ?? `${tab.name}.md`,
        filters: [{ name: "Markdown", extensions: ["md"] }],
      });
    }, null);
  }
  if (!path) return;
  try {
    await writeFile(path, tab.doc);
    tabs.markSaved(path);
    toast(`Saved ${tab.name}`, "ok");
  } catch (e) {
    toast(String(e), "error");
  }
}

// ---- Keyboard shortcuts ---------------------------------------------------
window.addEventListener("keydown", (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (!mod) return;
  const k = e.key.toLowerCase();
  if (k === "s") { e.preventDefault(); saveFile(e.shiftKey); }
  else if (k === "o") { e.preventDefault(); e.shiftKey ? openFromUrl() : openFile(); }
  else if (k === "n") { e.preventDefault(); tabs.newTab(); editor.setDoc(""); updatePreview(); }
  else if (k === "w") { e.preventDefault(); closeTab(tabs.activeId); }
  else if (k === "1") { e.preventDefault(); setMode("source"); }
  else if (k === "2") { e.preventDefault(); setMode("split"); }
  else if (k === "3") { e.preventDefault(); setMode("preview"); }
});

// ---- Quit guard -----------------------------------------------------------
if (inTauri) {
  import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
    getCurrentWindow().onCloseRequested(async (event) => {
      if (!tabs.anyDirty()) return;
      const { ask } = await import("@tauri-apps/plugin-dialog");
      const quit = await ask("You have unsaved changes. Quit without saving?", {
        title: "Unsaved changes",
        kind: "warning",
      });
      if (!quit) event.preventDefault();
    });
  });
}

// ---- Text prompt modal ----------------------------------------------------
// A small custom modal (window.prompt is unreliable in macOS WKWebView).
// Resolves to the trimmed value, or null if cancelled. Used for "Open from
// URL" and for naming new files/folders.
function promptUrl(): Promise<string | null> {
  return promptText({
    title: "Open from URL",
    placeholder: "https://example.com/README.md",
    type: "url",
  });
}

function promptText(opts: {
  title: string;
  placeholder?: string;
  value?: string;
  type?: "text" | "url";
}): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    const card = document.createElement("div");
    card.className = "modal-card";

    const title = document.createElement("h2");
    title.textContent = opts.title;

    const input = document.createElement("input");
    input.type = opts.type ?? "text";
    if (opts.placeholder) input.placeholder = opts.placeholder;
    if (opts.value) input.value = opts.value;

    const row = document.createElement("div");
    row.className = "modal-actions";
    const cancel = document.createElement("button");
    cancel.textContent = "Cancel";
    const open = document.createElement("button");
    open.className = "primary";
    open.textContent = "OK";

    row.append(cancel, open);
    card.append(title, input, row);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    input.focus();

    const done = (value: string | null) => {
      window.removeEventListener("keydown", onKey, true);
      overlay.remove();
      resolve(value);
    };
    const submit = () => {
      const v = input.value.trim();
      done(v || null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); done(null); }
      else if (e.key === "Enter") { e.preventDefault(); submit(); }
    };

    window.addEventListener("keydown", onKey, true);
    overlay.addEventListener("mousedown", (e) => {
      if (e.target === overlay) done(null);
    });
    cancel.onclick = () => done(null);
    open.onclick = submit;
  });
}

// ---- Toasts ---------------------------------------------------------------
function toast(msg: string, kind: "ok" | "error" = "ok") {
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = msg;
  $("toasts").appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

// ---- Boot -----------------------------------------------------------------
buildToolbar();
buildPalette();
applyTheme(theme);
renderTabs();
updatePreview();
editor.focus();
initFileAssociation();
restoreFolder();
