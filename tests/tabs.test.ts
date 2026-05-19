import { describe, it, expect } from "vitest";
import { TabManager, isDirty } from "../src/tabs";

describe("TabManager", () => {
  it("does not invoke onChange during construction (avoids TDZ on the callback's closure)", () => {
    // Reproduces the blank-window bug: the consumer's onChange closes over a
    // binding that is only assigned *after* `new TabManager()` returns, so the
    // constructor must not call onChange synchronously.
    let calledDuringConstruction = false;
    let constructed = false;
    const tm = new TabManager(() => {
      if (!constructed) calledDuringConstruction = true;
    });
    constructed = true;
    expect(calledDuringConstruction).toBe(false);
    // But runtime mutations must still notify.
    let notified = false;
    const tm2 = new TabManager(() => {});
    (tm2 as unknown as { onChange: () => void }).onChange = () => { notified = true; };
    tm2.newTab();
    expect(notified).toBe(true);
    expect(tm.tabs.length).toBe(1);
  });

  it("starts with one clean Untitled tab", () => {
    const tm = new TabManager(() => {});
    expect(tm.tabs.length).toBe(1);
    expect(tm.active.name).toBe("Untitled");
    expect(isDirty(tm.active)).toBe(false);
  });

  it("tracks dirty state on edit and clears it on save", () => {
    const tm = new TabManager(() => {});
    tm.setDoc("hello");
    expect(isDirty(tm.active)).toBe(true);
    tm.markSaved("/tmp/note.md");
    expect(isDirty(tm.active)).toBe(false);
    expect(tm.active.name).toBe("note.md");
  });

  it("focuses an already-open file instead of duplicating", () => {
    const tm = new TabManager(() => {});
    tm.openOrFocus("/a/b.md", "x");
    const count = tm.tabs.length;
    tm.openOrFocus("/a/b.md", "x");
    expect(tm.tabs.length).toBe(count);
  });

  it("never leaves zero tabs after closing the last one", () => {
    const tm = new TabManager(() => {});
    tm.close(tm.activeId, () => true);
    expect(tm.tabs.length).toBe(1);
  });

  it("keeps a dirty tab open when discard is declined", () => {
    const tm = new TabManager(() => {});
    tm.setDoc("unsaved");
    const ok = tm.close(tm.activeId, () => false);
    expect(ok).toBe(false);
    expect(tm.tabs.length).toBe(1);
  });
});
