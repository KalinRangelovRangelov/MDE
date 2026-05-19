import "./styles.css";
import { Editor } from "./editor";
import { renderMarkdown } from "./preview";
import { TabManager, isDirty } from "./tabs";
import { toolbar, palette } from "./library";

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

// ---- DOM refs -------------------------------------------------------------
const $ = (id: string) => document.getElementById(id)!;
const tabbarEl = $("tabbar");
const toolbarEl = $("toolbar");
const paletteEl = $("palette");
const panesEl = $("panes");
const editorPane = $("editor-pane");
const previewPane = $("preview-pane");
const previewEl = $("preview");

// ---- State ----------------------------------------------------------------
type ViewMode = "split" | "source" | "preview";
let mode: ViewMode = "split";
let paletteVisible = true;

const tabs = new TabManager(() => renderTabs());
const editor = new Editor($("editor"), tabs.active.doc, onEditorChange);

let renderTimer: number | undefined;
function onEditorChange(doc: string) {
  tabs.setDoc(doc);
  renderTabs();
  clearTimeout(renderTimer);
  renderTimer = window.setTimeout(updatePreview, 150);
}

function updatePreview() {
  previewEl.innerHTML = renderMarkdown(tabs.active.doc);
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

  toolbarEl.append(sep(), iconBtn("📂 Open", openFile), iconBtn("💾 Save", () => saveFile(false)),
    iconBtn("Save As", () => saveFile(true)));

  const spacer = document.createElement("div");
  spacer.className = "spacer";
  toolbarEl.appendChild(spacer);

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
  else if (k === "o") { e.preventDefault(); openFile(); }
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
renderTabs();
updatePreview();
editor.focus();
