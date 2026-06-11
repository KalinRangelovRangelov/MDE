let nextId = 1;

export interface Tab {
  id: number;
  path: string | null; // null = never saved
  name: string;
  doc: string;
  savedDoc: string; // last persisted content, for dirty comparison
  sourceUrl?: string; // origin URL for docs opened from the web (not a save target)
}

export function isDirty(t: Tab): boolean {
  return t.doc !== t.savedDoc;
}

/** Owns the list of open documents and which one is active. */
export class TabManager {
  tabs: Tab[] = [];
  activeId = 0;

  constructor(private onChange: () => void) {
    // Create the initial tab WITHOUT firing onChange: at construction time the
    // consumer's callback may close over bindings not yet initialized (the
    // `new TabManager()` result itself). The caller renders explicitly at boot.
    const tab = this.makeTab(null, "");
    this.tabs.push(tab);
    this.activeId = tab.id;
  }

  get active(): Tab {
    return this.tabs.find((t) => t.id === this.activeId)!;
  }

  private makeTab(path: string | null, content: string): Tab {
    return {
      id: nextId++,
      path,
      name: path ? basename(path) : "Untitled",
      doc: content,
      savedDoc: content,
    };
  }

  /**
   * Open a new tab. `name` overrides the derived label without giving the tab a
   * `path` — used by "Open from URL", where the document is untitled (saving
   * triggers Save-As) but should still show the source filename.
   */
  newTab(path: string | null = null, content = "", name?: string): Tab {
    const tab = this.makeTab(path, content);
    if (name) tab.name = name;
    this.tabs.push(tab);
    this.activeId = tab.id;
    this.onChange();
    return tab;
  }

  /** If the file is already open, focus its tab instead of duplicating. */
  openOrFocus(path: string, content: string): Tab {
    const existing = this.tabs.find((t) => t.path === path);
    if (existing) {
      existing.doc = content;
      existing.savedDoc = content;
      this.activeId = existing.id;
      this.onChange();
      return existing;
    }
    return this.newTab(path, content);
  }

  select(id: number): void {
    this.activeId = id;
    this.onChange();
  }

  /** Returns false if the caller should abort (unsaved changes, kept open). */
  close(id: number, confirmDiscard: (t: Tab) => boolean): boolean {
    const idx = this.tabs.findIndex((t) => t.id === id);
    if (idx < 0) return true;
    const tab = this.tabs[idx];
    if (isDirty(tab) && !confirmDiscard(tab)) return false;

    this.tabs.splice(idx, 1);
    if (this.tabs.length === 0) {
      this.newTab();
    } else if (this.activeId === id) {
      this.activeId = this.tabs[Math.max(0, idx - 1)].id;
    }
    this.onChange();
    return true;
  }

  markSaved(path: string): void {
    const t = this.active;
    t.path = path;
    t.name = basename(path);
    t.savedDoc = t.doc;
    this.onChange();
  }

  setDoc(doc: string): void {
    this.active.doc = doc;
  }

  anyDirty(): boolean {
    return this.tabs.some(isDirty);
  }
}

function basename(p: string): string {
  return p.split(/[\\/]/).pop() || p;
}

/** Directory portion of a path (no trailing slash). "" if there is none. */
export function dirname(p: string): string {
  const i = p.search(/[\\/][^\\/]*$/);
  return i < 0 ? "" : p.slice(0, i);
}
