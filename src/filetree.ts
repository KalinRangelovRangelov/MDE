// File-tree sidebar: an expandable, lazy-loaded view of a folder on disk.
//
// The module is deliberately Tauri-agnostic — it never imports `invoke`. The
// host (main.ts) injects a `readDir` function and click callbacks, so the tree
// can be unit-tested or run in a plain browser without the desktop backend.

export interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

export interface FileTreeCallbacks {
  /** List the immediate children of a directory (folders first, then files). */
  readDir: (path: string) => Promise<DirEntry[]>;
  /** Pick a folder to open; resolves to its path, or null if cancelled. */
  onOpenFolder: () => void;
  /** A markdown file row was clicked. */
  onOpenFile: (path: string) => void;
  /** "+ New file" pressed; `dir` is the folder to create it in. */
  onNewFile: (dir: string) => void;
  /** "+ New folder" pressed; `dir` is the folder to create it in. */
  onNewFolder: (dir: string) => void;
}

const MD_EXT = ["md", "markdown", "mdown", "txt"];

function isMarkdown(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return MD_EXT.includes(ext);
}

function basename(p: string): string {
  return p.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || p;
}

export class FileTree {
  root: string | null = null;
  /** Folder paths the user has expanded. */
  private expanded = new Set<string>();
  /** Loaded children per folder path; only present once a folder is opened. */
  private children = new Map<string, DirEntry[]>();
  /** The folder new files/folders are created in. Null falls back to root. */
  private selectedDir: string | null = null;

  constructor(
    private el: HTMLElement,
    private cb: FileTreeCallbacks,
  ) {
    this.render();
  }

  /** The directory that create actions target. */
  get targetDir(): string | null {
    return this.selectedDir ?? this.root;
  }

  /** Open a folder as the tree root, replacing any current contents. */
  async open(path: string): Promise<void> {
    this.root = path;
    this.expanded.clear();
    this.children.clear();
    this.selectedDir = path;
    await this.load(path);
    this.render();
  }

  /**
   * Reload a folder's children from disk and re-render. Used after creating a
   * file/folder so the new entry shows. Expands the folder so the result is
   * visible. Defaults to the root.
   */
  async refresh(dir: string | null = this.root): Promise<void> {
    if (!dir) return;
    if (dir !== this.root) this.expanded.add(dir);
    await this.load(dir);
    this.render();
  }

  /** Load (or reload) one folder's children into the cache. */
  private async load(dir: string): Promise<void> {
    try {
      this.children.set(dir, await this.cb.readDir(dir));
    } catch {
      // Folder vanished or is unreadable — show it as empty rather than throw.
      this.children.set(dir, []);
    }
  }

  private async toggle(dir: string): Promise<void> {
    this.selectedDir = dir;
    if (this.expanded.has(dir)) {
      this.expanded.delete(dir);
    } else {
      this.expanded.add(dir);
      if (!this.children.has(dir)) await this.load(dir);
    }
    this.render();
  }

  // ---- Rendering ----------------------------------------------------------

  private render(): void {
    this.el.innerHTML = "";
    this.el.appendChild(this.buildHeader());

    if (!this.root) {
      const empty = document.createElement("p");
      empty.className = "ft-empty";
      empty.textContent = "No folder open.";
      this.el.appendChild(empty);
      return;
    }

    const list = document.createElement("div");
    list.className = "ft-list";
    this.renderLevel(this.root, 0, list);
    this.el.appendChild(list);
  }

  private buildHeader(): HTMLElement {
    const header = document.createElement("div");
    header.className = "ft-header";

    const title = document.createElement("span");
    title.className = "ft-title";
    title.textContent = this.root ? basename(this.root) : "Files";
    title.title = this.root ?? "";
    header.appendChild(title);

    const actions = document.createElement("div");
    actions.className = "ft-actions";

    if (this.root) {
      actions.appendChild(
        this.actionBtn("📄", "New file", () => {
          if (this.targetDir) this.cb.onNewFile(this.targetDir);
        }),
      );
      actions.appendChild(
        this.actionBtn("📁", "New folder", () => {
          if (this.targetDir) this.cb.onNewFolder(this.targetDir);
        }),
      );
    }
    actions.appendChild(this.actionBtn("📂", "Open folder…", this.cb.onOpenFolder));

    header.appendChild(actions);
    return header;
  }

  private actionBtn(label: string, title: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement("button");
    b.textContent = label;
    b.title = title; // native fallback
    b.dataset.tip = title; // CSS tooltip (native titles are unreliable in the webview)
    b.onclick = onClick;
    return b;
  }

  private renderLevel(dir: string, depth: number, into: HTMLElement): void {
    const entries = this.children.get(dir);
    if (!entries) return;
    for (const entry of entries) {
      into.appendChild(this.buildRow(entry, depth));
      if (entry.is_dir && this.expanded.has(entry.path)) {
        this.renderLevel(entry.path, depth + 1, into);
      }
    }
  }

  private buildRow(entry: DirEntry, depth: number): HTMLElement {
    const row = document.createElement("div");
    row.className = "ft-row";
    // Indent by depth; 14px per level plus room for the chevron column.
    row.style.paddingLeft = `${8 + depth * 14}px`;

    const chevron = document.createElement("span");
    chevron.className = "ft-chevron";
    chevron.textContent = entry.is_dir ? (this.expanded.has(entry.path) ? "▾" : "▸") : "";

    const icon = document.createElement("span");
    icon.className = "ft-icon";
    icon.textContent = entry.is_dir ? "📁" : "📄";

    const name = document.createElement("span");
    name.className = "ft-name";
    name.textContent = entry.name;

    row.append(chevron, icon, name);

    if (entry.is_dir) {
      if (entry.path === this.selectedDir) row.classList.add("selected");
      row.onclick = () => this.toggle(entry.path);
    } else if (isMarkdown(entry.name)) {
      row.onclick = () => this.cb.onOpenFile(entry.path);
    } else {
      // Non-markdown files are shown but inert.
      row.classList.add("muted");
    }
    return row;
  }
}
